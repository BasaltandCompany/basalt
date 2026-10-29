// Funnels shared logic: the Freight ICP stage list (from ICP.md), lazy seed,
// and the promote/un-approve moves shared by the API routes.
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { campaigns, entityLinks } from "~/db/schema";
import { checkApiKey } from "~/lib/api-key";
import { getAuthedClient } from "~/lib/session";
import {
	funnelItems,
	funnelRuns,
	funnelStageResults,
	funnels,
	outreachProspects,
	FUNNEL_METHODS,
	type FunnelStage,
} from "~/db/schema";

// Stage skeleton — order is display/processing order only. Every stage is
// soft: nothing gates, queues are "no verdict at this stage yet", and a fail
// never removes a company. ai_signal is the ONLY promotion gate
// (applyVerdictConsequences); the firmographic stages record verdicts as
// enrichment data to learn from. A later funnel (law, gov) is another row in
// `funnels` with the same stages; nothing here is freight-specific.
export const FREIGHT_STAGES: FunnelStage[] = [
	{ key: "hq_state", label: "Indiana HQ", gate: "Address/city is in Indiana, not a name token", method: "source", soft: true },
	{ key: "ai_signal", label: "AI signal", gate: "≥1 employee self-labels AI (Prospeo roster); site evidence corroborates only; vendor-hint recorded separately", method: "api", soft: true, params: { maxRosterPages: 10 } },
	{ key: "headcount", label: "Headcount", gate: "15-250 employees", method: "api", soft: true, params: { min: 15, max: 250 } },
	{ key: "revenue_band", label: "Revenue", gate: "$10-70M estimate; rev/employee $150-500k sanity; no Prospeo revenue → headcount × $325k/emp estimate", method: "api", soft: true, params: { min: 10_000_000, max: 70_000_000, perEmp: 325_000 } },
	{ key: "tech_team", label: "Tech team", gate: "≤6 title hits for CTO/VP Eng/IT Director/engineer/developer", method: "api", soft: true, params: { maxHits: 6 } },
	{ key: "ops_trigger", label: "Ops trigger", gate: "≥1 finance/ops leadership title (CFO/controller/COO/business manager) or ≥2 recruiting titles in the roster — the buyer layer Flowscope's customers all showed; soft, records strength only", method: "api", soft: true, params: { minFinance: 1, minHiring: 2 } },
	{ key: "owner_led", label: "Owner-led", gate: "Founder/CEO still running it, not a PE roll-up", method: "agent", soft: true },
];

/** Funnels API accepts an admin session (UI) or an mc_ API key (scripts/agents). */
export async function funnelAuthed(request: Request) {
	return (await checkApiKey(request)) || (await getAuthedClient()) !== null;
}

export type ImportRow = {
	companyName?: string;
	city?: string | null;
	state?: string | null;
	sourceUrl?: string | null;
	sourceKind?: string | null;
	rawData?: Record<string, unknown> | null;
};

const normState = (s?: string | null) => {
	const t = (s ?? "").trim().toLowerCase();
	return t === "in" || t === "indiana" ? "IN" : t ? t.toUpperCase().slice(0, 2) : null;
};

/** Insert items into an open run: dedup on (runId, company), skip already-promoted
 *  companies, auto-write hq_state / industry_type verdicts from row evidence. */
export async function importRunItems(
	runId: string,
	rows: ImportRow[],
): Promise<{ imported: number; duplicated: number; skippedPromoted: number }> {
	// skip companies that already made it to the CRM
	const names = [...new Set(rows.map((r) => r.companyName!.trim()))];
	const promoted = await db
		.select({ company: outreachProspects.company })
		.from(outreachProspects)
		.where(inArray(outreachProspects.company, names));
	const promotedSet = new Set(promoted.map((p) => p.company.toLowerCase()));

	let imported = 0;
	let skippedPromoted = 0;
	let duplicated = 0;
	for (const row of rows) {
		const name = row.companyName!.trim();
		if (promotedSet.has(name.toLowerCase())) {
			skippedPromoted++;
			continue;
		}
		const inserted = await db
			.insert(funnelItems)
			.values({
				runId,
				companyName: name,
				city: row.city?.trim() || null,
				state: normState(row.state),
				sourceUrl: row.sourceUrl?.trim() || null,
				sourceKind: row.sourceKind?.trim() || null,
				rawData: row.rawData ?? null,
			})
			.onConflictDoNothing({ target: [funnelItems.runId, funnelItems.companyName] })
			.returning({ id: funnelItems.id, state: funnelItems.state });
		if (inserted.length === 0) {
			duplicated++;
			continue;
		}
		imported++;
		// auto stage verdicts from pull evidence (method=source)
		const item = inserted[0];
		const auto: { stage: string; verdict: "pass" | "fail"; note: string | null }[] = [];
		if (item.state) {
			auto.push({
				stage: "hq_state",
				verdict: item.state === "IN" ? "pass" : "fail",
				note: [row.city?.trim(), item.state].filter(Boolean).join(", ") || null,
			});
		}
		for (const a of auto) {
			await db
				.insert(funnelStageResults)
				.values({
				itemId: item.id,
				stage: a.stage,
				verdict: a.verdict,
				note: a.note,
				evidenceUrl: row.sourceUrl?.trim() || null,
				method: "source",
			})
			.onConflictDoNothing({ target: [funnelStageResults.itemId, funnelStageResults.stage] });
		}
	}
	return { imported, duplicated, skippedPromoted };
}

/** New funnel, idempotent on name (existing row wins — safe to re-call).
 *  Stages clone the ungated freight skeleton as-is. */
export async function createFunnel(name: string, description?: string | null) {
	const trimmed = name.trim();
	const [existing] = await db.select().from(funnels).where(eq(funnels.name, trimmed)).limit(1);
	if (existing) return existing;
	const [row] = await db
		.insert(funnels)
		.values({ name: trimmed, description: description?.trim() || null, stages: FREIGHT_STAGES })
		.onConflictDoNothing({ target: funnels.name })
		.returning();
	return row ?? (await db.select().from(funnels).where(eq(funnels.name, trimmed)).limit(1))[0];
}

const RUN_SOURCES = ["importyeti", "fmcsa", "paste", "mixed"];

/** Open a run for a funnel, by id or name (same shape as POST /api/funnels). */
export async function createFunnelRun(opts: { funnelId?: string; funnelName?: string; source?: string; note?: string }) {
	let funnelId = opts.funnelId ?? null;
	if (!funnelId && opts.funnelName?.trim()) {
		const [f] = await db.select({ id: funnels.id }).from(funnels).where(ilike(funnels.name, opts.funnelName.trim())).limit(1);
		funnelId = f?.id ?? null;
	}
	if (!funnelId) return { error: "funnel not found — pass funnel_id or funnel_name" } as const;
	const source = RUN_SOURCES.includes(opts.source ?? "") ? opts.source! : "paste";
	const [run] = await db.insert(funnelRuns).values({ funnelId, source, note: opts.note?.trim() || null }).returning();
	return { run };
}

/** Record one stage verdict (upsert per item+stage) and run promotion/
 *  un-approve consequences. The one code path shared by the REST results
 *  handler and the MCP record_funnel_verdict tool. */
export async function recordStageVerdict(input: {
	itemId: string;
	stage: string;
	verdict: "pass" | "fail";
	note?: string | null;
	evidenceUrl?: string | null;
	method?: string | null;
}): Promise<{ ok: true } | { error: string; status: number }> {
	const method = FUNNEL_METHODS.includes((input.method ?? "") as never) ? input.method! : "human";
	const [item] = await db
		.select({ id: funnelItems.id, runId: funnelItems.runId })
		.from(funnelItems)
		.where(eq(funnelItems.id, input.itemId))
		.limit(1);
	if (!item) return { error: "Unknown itemId", status: 404 };
	const info = await getRunStages(item.runId);
	if (!info || !info.stages.some((s) => s.key === input.stage)) return { error: "Unknown stage", status: 400 };
	const values = {
		verdict: input.verdict,
		evidenceUrl: input.evidenceUrl?.trim() || null,
		note: input.note?.trim() || null,
		method,
		checkedAt: new Date(),
	};
	// upsert per (item, stage) — race-free where two writers pick the same item
	await db
		.insert(funnelStageResults)
		.values({ itemId: input.itemId, stage: input.stage, ...values })
		.onConflictDoUpdate({ target: [funnelStageResults.itemId, funnelStageResults.stage], set: values });
	await applyVerdictConsequences(input.itemId);
	return { ok: true };
}

/** Merge a funnel row's stages into the code skeleton: code wins for
 * gate/label/method/soft (definitions evolve), the row wins for params
 * (runtime tuning). Keys not in the skeleton — e.g. legacy industry_type —
 * drop out. Pure — exported for tests. */
export function mergeStages(skeleton: FunnelStage[], rowStages: FunnelStage[]): FunnelStage[] {
	const tuned = new Map(rowStages.map((s) => [s.key, s]));
	return skeleton.map((s) => {
		const t = tuned.get(s.key);
		return t ? { ...s, ...(t.params ? { params: t.params } : {}), ...(t.soft !== undefined ? { soft: t.soft } : {}) } : s;
	});
}

// stage keys a freight-skeleton funnel may carry beyond the skeleton itself
const LEGACY_STAGE_KEYS = new Set(["industry_type"]);

/** Insert the Freight ICP funnel if missing, then keep EVERY funnel built on
 * the freight skeleton in sync with the code definitions (called on list reads
 * — no seed migration, so drizzle stays the only writer of SQL). Funnels with
 * unknown extra stages are left alone; a missing skeleton key = not ours. */
export async function ensureFreightFunnel() {
	const existing = await db.select().from(funnels);
	if (!existing.some((f) => f.name === "Freight ICP")) {
		await db.insert(funnels).values({
			name: "Freight ICP",
			description: "Owner-led Indiana freight brokers/3PLs, $10-70M, no tech team (see ICP.md)",
			stages: FREIGHT_STAGES,
		}).onConflictDoNothing();
	}
	const skeletonKeys = new Set(FREIGHT_STAGES.map((s) => s.key));
	for (const f of existing) {
		const keys = new Set(f.stages.map((s) => s.key));
		if (![...skeletonKeys].every((k) => keys.has(k))) continue; // not a freight-skeleton funnel
		if (![...keys].every((k) => skeletonKeys.has(k) || LEGACY_STAGE_KEYS.has(k))) continue; // custom stages — leave alone
		const merged = mergeStages(FREIGHT_STAGES, f.stages);
		if (JSON.stringify(f.stages) !== JSON.stringify(merged)) {
			await db.update(funnels).set({ stages: merged }).where(eq(funnels.id, f.id));
		}
	}
}

export async function getFunnel(funnelId: string) {
	const [f] = await db.select().from(funnels).where(eq(funnels.id, funnelId)).limit(1);
	return f ?? null;
}

/** Stage keys of the funnel a run belongs to. */
export async function getRunStages(runId: string): Promise<{ run: typeof funnelRuns.$inferSelect; stages: FunnelStage[] } | null> {
	const [row] = await db
		.select({ run: funnelRuns, stages: funnels.stages })
		.from(funnelRuns)
		.innerJoin(funnels, eq(funnelRuns.funnelId, funnels.id))
		.where(eq(funnelRuns.id, runId))
		.limit(1);
	if (!row) return null;
	return { run: row.run, stages: row.stages };
}

/**
 * Items queued at `stage`: this stage has no result yet, and every earlier
 * HARD stage passed. Current funnels are all-soft (nothing gates — the queue
 * is just "unscored at this stage"), but the soft filter keeps the semantics
 * correct should a hard stage ever return.
 */
export async function getQueue(runId: string, stageKey: string) {
	const info = await getRunStages(runId);
	if (!info) return null;
	const idx = info.stages.findIndex((s) => s.key === stageKey);
	if (idx === -1) return null;
	// soft stages are signal-only — their verdicts never gate later queues
	const gates = info.stages.slice(0, idx).filter((s) => !s.soft).map((s) => s.key);
	const rows = await db
		.select()
		.from(funnelItems)
		.where(
			and(
				eq(funnelItems.runId, runId),
				// no result at this stage yet
				sql`not exists (select 1 from ${funnelStageResults} r where r.item_id = ${funnelItems.id} and r.stage = ${stageKey})`,
				// every earlier stage has a passing result
				...gates.map(
					(k) =>
						sql`exists (select 1 from ${funnelStageResults} r where r.item_id = ${funnelItems.id} and r.stage = ${k} and r.verdict = 'pass')`,
				),
			),
		)
		.orderBy(
			// IBJ rank first (highest signal), then oldest-founded FMCSA companies
			// (established = far more likely to be in Apollo), then alphabetical.
			sql`(${funnelItems.rawData}->>'rank')::int asc nulls last`,
			sql`(${funnelItems.rawData}->>'founded') asc nulls last`,
			funnelItems.companyName,
		);
	return rows;
}

/** Per-stage counts for a run: passed / failed / awaiting per stage. */
export async function getSummary(runId: string, stages: FunnelStage[]) {
	const items = await db.select({ id: funnelItems.id }).from(funnelItems).where(eq(funnelItems.runId, runId));
	const results = items.length
		? await db
				.select({ itemId: funnelStageResults.itemId, stage: funnelStageResults.stage, verdict: funnelStageResults.verdict })
				.from(funnelStageResults)
				.where(inArray(funnelStageResults.itemId, items.map((i) => i.id)))
		: [];
	const byStage = stages.map((s) => {
		const rs = results.filter((r) => r.stage === s.key);
		return {
			stage: s.key,
			label: s.label,
			passed: rs.filter((r) => r.verdict === "pass").length,
			failed: rs.filter((r) => r.verdict === "fail").length,
			awaiting: items.length - rs.length,
		};
	});
	return { total: items.length, byStage };
}

/**
 * After a verdict lands: ai_signal pass → promote (idempotent — a re-pass
 * updates the existing prospect). ai_signal is the ONLY gate — every stage is
 * soft, so firmographic fails never drop a company or un-approve; a fail on
 * ai_signal does (until a pass re-lands). Unsccored ai_signal → no change.
 */
export async function applyVerdictConsequences(itemId: string) {
	const [item] = await db.select().from(funnelItems).where(eq(funnelItems.id, itemId)).limit(1);
	if (!item) return;
	const results = await db
		.select({ stage: funnelStageResults.stage, verdict: funnelStageResults.verdict, note: funnelStageResults.note })
		.from(funnelStageResults)
		.where(eq(funnelStageResults.itemId, itemId));
	// Second promotion path (Flowscope study, Oct 2026): the automated top of
	// the rescue pile. An ai_signal FAIL still records the item for rescue —
	// unless the trigger path fired: a visible finance/ops buyer layer
	// (ops_trigger pass) AND the human owner_led pass. 2 of Flowscope's 3
	// named customers had zero employee AI self-labels; the pain is the
	// pitch, so readiness ≠ AI enthusiasm. Requires the ai_signal verdict to
	// exist, so the path never promotes before the gate has run.
	const triggerPath =
		results.some((r) => r.stage === "ops_trigger" && r.verdict === "pass") &&
		results.some((r) => r.stage === "owner_led" && r.verdict === "pass");

	// ai_signal note tier → aiInterest (tier1=high, tier2=some) — only on a
	// pass; a tier2 FAIL note (site-only rescue evidence) must never set it.
	const aiRow = results.find((r) => r.stage === "ai_signal");
	const aiInterest = aiRow?.verdict === "pass" && aiRow.note?.startsWith("tier1")
		? "high"
		: aiRow?.verdict === "pass" && aiRow.note?.startsWith("tier2")
			? "some"
			: null;

	if (aiRow?.verdict === "pass" || triggerPath) {
		const raw = (item.rawData ?? {}) as Record<string, unknown>;
		const resultRows = await db
			.select({ stage: funnelStageResults.stage, note: funnelStageResults.note })
			.from(funnelStageResults)
			.where(eq(funnelStageResults.itemId, itemId));
		const noteFor = (k: string) => resultRows.find((r) => r.stage === k)?.note ?? "unknown";
	// attach to a campaign named after the funnel (first word, case-insensitive:
	// "Freight ICP" → %freight%, "Legal ICP" → %legal%). campaignId is nullable
	// — a missing campaign must not block promotion.
	const [frow] = await db
		.select({ name: funnels.name })
		.from(funnelRuns)
		.innerJoin(funnels, eq(funnelRuns.funnelId, funnels.id))
		.where(eq(funnelRuns.id, item.runId))
		.limit(1);
	const [campaign] = frow
		? await db
				.select({ id: campaigns.id })
				.from(campaigns)
				.where(ilike(campaigns.name, `%${frow.name.split(/\s+/)[0]}%`))
				.limit(1)
		: [];
		if (item.prospectId) {
			await db
				.update(outreachProspects)
				.set({
					region: item.state ?? "unknown",
					revenueBand: noteFor("revenue_band"),
					techTeam: noteFor("tech_team"),
					...(aiInterest ? { aiInterest } : {}),
					icpApproved: true,
				})
				.where(eq(outreachProspects.id, item.prospectId));
		} else {
			// LinkedIn targets for the connect loop: the self-labeling AI person
			// (Rail-A import evidence) and the owner from the cached roster. Both
			// get invited in the same cycle — the connect automation caps itself.
			const aiHits = (raw.aiHits as { linkedinUrl?: string | null }[] | undefined) ?? [];
			const aiLi = aiHits.find((h) => h.linkedinUrl)?.linkedinUrl ?? null;
			const rosterPeople = (raw.roster as { people?: { title?: string | null; linkedinUrl?: string | null }[] } | undefined)?.people ?? [];
			const ownerLi =
				rosterPeople.find((p) => p.linkedinUrl && /\b(ceo|founder|owner|president)\b/i.test(p.title ?? ""))?.linkedinUrl ?? null;
			const notes = [
				typeof raw.address === "string" ? raw.address : null,
				aiLi ? `li: ${aiLi}` : null,
				ownerLi ? `li-owner: ${ownerLi}` : null,
			]
				.filter(Boolean)
				.join("\n") || null;
			const [prospect] = await db
				.insert(outreachProspects)
				.values({
					company: item.companyName,
					stage: "candidate",
					region: item.state ?? "unknown",
					revenueBand: noteFor("revenue_band"),
					techTeam: noteFor("tech_team"),
					...(aiInterest ? { aiInterest } : {}),
					icpApproved: true,
					sourceNote: `funnel-run ${new Date().toISOString().slice(0, 10)}`,
					campaignId: campaign?.id ?? null,
					notes,
				})
				.returning({ id: outreachProspects.id });
			await db
				.update(funnelItems)
				.set({ prospectId: prospect.id, promotedAt: new Date() })
				.where(eq(funnelItems.id, itemId));
			// registry link: run → promoted prospect (board card shows where it came from)
			await db
				.insert(entityLinks)
				.values({ fromKind: "funnel-run", fromId: item.runId, toKind: "prospect", toId: prospect.id, linkType: "promoted", createdBy: "agent" })
				.onConflictDoNothing();
		}
		return;
	}

	// ai_signal fail landed: if promoted, drop approval — the existing
	// invite gate picks this up; the prospect row itself survives.
	if (aiRow?.verdict === "fail" && item.prospectId) {
		await db.update(outreachProspects).set({ icpApproved: false }).where(eq(outreachProspects.id, item.prospectId));
	}
}
