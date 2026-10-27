// Funnel stage batch runner — shared by the dashboard "Run stage" button and
// the scheduler's daily automation. Drivers: Prospeo (headcount, revenue —
// 0 credits on miss), Apollo (tech_team), cache reads (ai_signal roster/site).
import { and, eq, notInArray, sql } from "drizzle-orm";
import { db } from "~/db";
import { funnelItems, funnelStageResults, type FunnelStage } from "~/db/schema";
import { applyVerdictConsequences, getQueue, getRunStages } from "~/lib/funnels";
import {
	cleanName,
	prospeoCompanyRoster,
	prospeoConfigured,
	prospeoEnrichBatch,
	prospeoEnrichCompany,
	rangeMidpoint,
	type ProspeoCompany,
	type ProspeoRoster,
} from "~/lib/enrich-prospeo";
import { mergeSearchHits, pastMatches, scoreAiSignal, scoreRoster, scanSite } from "~/lib/ai-signal";

const M = 1_000_000;

/** Runtime-tuned gate number from the funnel row's stage params (code default otherwise). */
const num = (stage: FunnelStage | undefined, k: string, dflt: number) =>
	typeof stage?.params?.[k] === "number" ? (stage.params![k] as number) : dflt;

export type RevenueInputs = {
	revenueMin: number | null;
	revenueMax: number | null;
	employeeCount: number | null;
	employeeRange: string | null;
};

/** The revenue_band gate. Real Prospeo range → overlap test on the band.
 *  Missing/one-sided range → estimate headcount × perEmp (the gate's own
 *  rev/employee sanity, midpoint). Nothing at all → honest fail, never a
 *  throw — an error records no verdict and the item re-errors every run. */
export function revenueBandVerdict(
	co: RevenueInputs | null,
	{ min = 10_000_000, max = 70_000_000, perEmp = 325_000 }: { min?: number; max?: number; perEmp?: number } = {},
): { verdict: "pass" | "fail"; note: string } {
	if (co && co.revenueMin !== null && co.revenueMax !== null) {
		return {
			verdict: co.revenueMax >= min && co.revenueMin <= max ? "pass" : "fail",
			note: `$${Math.round(co.revenueMin / M)}–$${Math.round(co.revenueMax / M)}M (Prospeo)`,
		};
	}
	const n = co?.employeeCount ?? rangeMidpoint(co?.employeeRange ?? null);
	if (n === null) return { verdict: "fail", note: "no revenue or headcount data (Prospeo)" };
	const est = n * perEmp;
	return {
		verdict: est >= min && est <= max ? "pass" : "fail",
		note: `est. $${Math.round(est / M)}M from ~${n} employees @ $${Math.round(perEmp / 1000)}k/emp (Prospeo has no revenue)`,
	};
}

/** The ops_trigger soft signal (Flowscope study, Oct 2026): does the roster
 *  show the finance/ops buyer layer their customers all had — CFO/controller/
 *  COO/business manager — or a manual hiring machine (recruiting/onboarding
 *  titles)? Current titles only: a past CFO elsewhere isn't this company's
 *  buyer. Soft by design — a small sample missing the CFO is absence of
 *  evidence, so this records strength and never gates. */
export function opsTriggerVerdict(
	roster: ProspeoRoster,
	{ minFinance = 1, minHiring = 2 }: { minFinance?: number; minHiring?: number } = {},
): { verdict: "pass" | "fail"; note: string } {
	const FINANCE = /\bcfo\b|chief financial|(?<!project\s)controller|vp\.? finance|finance director|head of finance|treasurer|\bcoo\b|chief operating|business manager/i;
	const HIRING = /recruit|onboarding|talent (acquisition|manager)|staffing coordinator|human resources|\bhr\b/i;
	const fin = roster.people.filter((p) => FINANCE.test(p.title ?? ""));
	const hire = roster.people.filter((p) => HIRING.test(p.title ?? ""));
	const names = (ps: typeof fin, n: number) =>
		[...new Set(ps.map((p) => p.title ?? "").filter(Boolean))].slice(0, n).join(", ") || "none";
	const pass = fin.length >= minFinance || hire.length >= minHiring;
	return {
		verdict: pass ? "pass" : "fail",
		note: `fin:${fin.length} hire:${hire.length} in ${roster.people.length}-person sample (Prospeo) — ${names(fin, 3)} / ${names(hire, 3)}`,
	};
}

export type BatchResult = { ok: true; results: number; errors: number; firstError?: string } | { ok: false; error: string };

/** Cached Prospeo payload written by the headcount run (null = never enriched). */
function cachedProspeo(item: typeof funnelItems.$inferSelect): RevenueInputs | null {
	return ((item.rawData as Record<string, unknown> | null)?.prospeo ?? null) as RevenueInputs | null;
}

/** Enough firmographics to settle revenue_band from the cache alone. */
const hasFirmographics = (c: RevenueInputs | null) =>
	!!c && (c.revenueMin !== null || c.revenueMax !== null || c.employeeCount !== null || c.employeeRange !== null);

/** One Prospeo call carries the whole firmographic payload — cache it on the
 *  item so later stages (revenue) read it free instead of re-enriching. */
async function cacheProspeo(itemId: string, co: ProspeoCompany | null) {
	await db
		.update(funnelItems)
		.set({
			rawData: sql`jsonb_set(coalesce(${funnelItems.rawData}, '{}'::jsonb), '{prospeo}', ${JSON.stringify(
				co ? { matched: true, ...co } : { matched: false },
			)}::jsonb)`,
		})
		.where(eq(funnelItems.id, itemId));
}

/** Same pattern for the people roster / AI matches — cached so re-runs and
  *  re-scores cost zero credits (Prospeo additionally dedupes identical pages
 *  free for 30d). The jsonb path is a bound parameter — no sql.raw anywhere. */
async function cacheRawJson(itemId: string, key: "roster" | "aiMatches", value: unknown) {
	await db
		.update(funnelItems)
		.set({
			rawData: sql`jsonb_set(coalesce(${funnelItems.rawData}, '{}'::jsonb), ARRAY[${key}]::text[], ${JSON.stringify(value)}::jsonb)`,
		})
		.where(eq(funnelItems.id, itemId));
}
const cacheRoster = (itemId: string, roster: ProspeoRoster) => cacheRawJson(itemId, "roster", roster);

/** The company roster, cached-or-pull: free when an earlier stage on this
 *  item (ai_signal, a prior tech_team run) already cached it; one pull +
 *  cache otherwise. */
async function rosterFor(item: typeof funnelItems.$inferSelect): Promise<ProspeoRoster> {
	const raw = (item.rawData ?? {}) as Record<string, unknown>;
	const prospeo = (raw.prospeo ?? null) as { companyId?: string | null; domain?: string | null } | null;
	const refs = {
		companyId: prospeo?.companyId ?? null,
		domain: prospeo?.domain ?? null,
		name: cleanName(item.companyName),
	};
	let roster = (raw.roster ?? null) as ProspeoRoster | null;
	if (!roster) {
		roster = await prospeoCompanyRoster(refs);
		await cacheRoster(item.id, roster);
	}
	return roster;
}

/** Keyless page fetch for the site scan — a dead site skips the scan, it
 *  never fails the stage. ponytail: 500KB cap covers any real homepage. */
async function fetchPage(url: string): Promise<string | null> {
	try {
		const r = await fetch(url, {
			signal: AbortSignal.timeout(10_000),
			headers: { "User-Agent": "Mozilla/5.0 (compatible; madcactus-icp/1.0)" },
		});
		if (!r.ok) return null;
		return (await r.text()).slice(0, 500_000);
	} catch {
		return null;
	}
}

/** Internal href paths for subpage scanning (assets and hashes dropped). */
function internalLinks(html: string): string[] {
	const out: string[] = [];
	for (const m of html.matchAll(/href=["'](\/[^"'#]*)["']/gi)) {
		const path = m[1];
		if (/\.(css|js|png|jpe?g|gif|svg|ico|pdf|woff2?|mp4|webp)(\?|$)/i.test(path)) continue;
		if (/^(mailto:|tel:)/.test(path)) continue;
		if (!out.includes(path)) out.push(path);
	}
	return out;
}

/** The ai_signal driver: complete a partial cached roster (legacy page-1
 *  caches have no `complete` key → read as partial), score the full roster +
 *  site, cache matches for the detail modal. Pages cost 1 credit each
 *  (identical pages deduped free for 30d), so a complete roster never
 *  re-fetches. */
async function aiSignalVerdict(item: typeof funnelItems.$inferSelect, stage: FunnelStage) {
	const raw = (item.rawData ?? {}) as Record<string, unknown>;
	let prospeo = (raw.prospeo ?? null) as { companyId?: string | null; domain?: string | null } | null;
	// ai_signal runs before any firmographic stage now — no headcount cache
	// exists yet. Match the company by cleaned name first (1 credit on match,
	// 0 on miss) so the roster uses exact ids (the name fallback can pull in
	// unrelated same-name companies), and cache it — that pre-answers
	// headcount/revenue for free.
	if (!prospeo) {
		const co = await prospeoEnrichCompany(cleanName(item.companyName));
		await cacheProspeo(item.id, co);
		prospeo = { companyId: co?.companyId ?? null, domain: co?.domain ?? null };
	}
	const refs = {
		companyId: prospeo.companyId ?? null,
		domain: prospeo.domain ?? null,
		name: cleanName(item.companyName),
	};
	const maxPages = num(stage, "maxRosterPages", 10);
	const cached = (raw.roster ?? null) as ProspeoRoster | null;
	let roster = cached;
	if (!roster?.complete) {
		const fresh = await prospeoCompanyRoster(refs, { maxPages });
		if (cached) {
			// union keeps people from a partial cache the fresh pull couldn't re-reach
			const seen = new Set(fresh.people.map((p) => p.name));
			fresh.people.push(...cached.people.filter((p) => !seen.has(p.name)));
			fresh.total = Math.max(fresh.total, cached.total);
		}
		roster = fresh;
		await cacheRoster(item.id, fresh);
	}
	const matches = mergeSearchHits(
		scoreRoster(roster.people),
		(raw.aiHits as { name?: string; title?: string | null }[] | undefined) ?? [],
	);
	const past = pastMatches(roster.people);

	const siteEvidence: string[] = [];
	const vendorHints: string[] = [];
	let siteAttempted = false;
	if (refs.domain) {
		siteAttempted = true;
		const base = `https://${refs.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
		const home = await fetchPage(base);
		if (home) {
			const hs = scanSite(home, `${base}/`, item.companyName);
			siteEvidence.push(...hs.evidence);
			vendorHints.push(...hs.vendorHints);
			const links = internalLinks(home);
			const pages = [...new Set([...links.slice(0, 3), links.find((p) => /privacy/i.test(p)) ?? "/privacy"])];
			for (const path of pages) {
				const page = await fetchPage(`${base}${path}`);
				if (!page) continue;
				const s = scanSite(page, `${base}${path}`, item.companyName);
				siteEvidence.push(...s.evidence);
				vendorHints.push(...s.vendorHints);
			}
		}
	}
	const t = scoreAiSignal({
		employeeMatches: matches,
		pastMatches: past,
		siteEvidence,
		vendorHints,
		roster,
		maxPages,
		siteAttempted,
	});
	await cacheRawJson(item.id, "aiMatches", { matches, pastMatches: past });
	return { verdict: t.verdict, note: t.note };
}

/** Batch-run an api-method stage over its queue. `limit` bounds credit spend. */
export async function runStageBatch(runId: string, stageKey: string, limit = 50): Promise<BatchResult> {
	const info = await getRunStages(runId);
	const stage = info?.stages.find((s) => s.key === stageKey);
	if (!info || !stage) return { ok: false, error: "Run not found or unknown stage" };
	if (stage.method !== "api") return { ok: false, error: `Stage ${stageKey} is not an api stage` };
	if (!prospeoConfigured()) return { ok: false, error: `${stageKey} stage needs PROSPEO_API_KEY` };

	const queue = await getQueue(runId, stageKey);
	if (!queue) return { ok: false, error: "Run not found" };
	const cap = Math.min(Math.max(Math.trunc(limit), 1), 500);
	const items = queue.slice(0, cap);

	let okCount = 0;
	let errors = 0;
	let firstError = "";
	const recordError = (e: unknown) => {
		errors++;
		if (!firstError) {
			// drizzle wraps the pg error — the real message (constraint name) is the cause
			const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : null;
			firstError = cause ?? (e instanceof Error ? e.message : String(e));
		}
	};
	const upsert = (itemId: string, v: "pass" | "fail", n: string) =>
		db
			.insert(funnelStageResults)
			.values({ itemId, stage: stageKey, verdict: v, note: n, method: "api" })
			.onConflictDoUpdate({
				target: [funnelStageResults.itemId, funnelStageResults.stage],
				set: { verdict: v, note: n, method: "api", checkedAt: new Date() },
			});

	// Prospeo firmographic stages: one bulk request per 50 companies instead of
	// N singles — same credit cost (per match), one rate-limit slot, no 429
	// storms. ai_signal is excluded: it reads the headcount run's cached payload
	// and its own cached roster instead.
	const enriched = new Map<string, ProspeoCompany | null>();
	if ((stageKey === "headcount" || stageKey === "revenue_band") && prospeoConfigured() && items.length > 0) {
	// firmographic stages: skip items the ai_signal run already enriched and
	// cached (matched or matched:false) — re-enriching burns 1 credit each for
	// data we have. Bulk-request the rest: one per 50 companies, same credit
	// cost (per match), one rate-limit slot, no 429 storms.
	const todo =
		stageKey === "headcount"
			? items.filter((it) => !cachedProspeo(it))
			: stageKey === "revenue_band"
				? items.filter((it) => !hasFirmographics(cachedProspeo(it)))
				: items;
		try {
			for (let i = 0; i < todo.length; i += 50) {
				const chunk = todo.slice(i, i + 50);
				const res = await prospeoEnrichBatch(chunk.map((c) => c.companyName));
				for (const c of chunk) enriched.set(c.id, res.get(c.companyName) ?? null);
			}
		} catch (e) {
			return { ok: false, error: `Prospeo bulk failed: ${e instanceof Error ? e.message : String(e)}` };
		}
	}
	for (const item of items) {
		try {
			let verdict: "pass" | "fail" = "fail";
			let note = "";
			if (stageKey === "headcount") {
				// cached payload (ai_signal-first) answers most items free; the fresh
				// bulk above only ran for cache-less items
				const cached = cachedProspeo(item);
				const fresh = enriched.get(item.id) ?? null;
				if (!cached) await cacheProspeo(item.id, fresh);
				const co = cached ?? fresh;
				const n = co?.employeeCount ?? rangeMidpoint(co?.employeeRange ?? null);
				// null = not in Prospeo → almost certainly under the minimum → honest fail
				const min = num(stage, "min", 15);
				const max = num(stage, "max", 250);
				verdict = n !== null && n >= min && n <= max ? "pass" : "fail";
				note = n !== null ? `${co?.employeeCount ?? `${co?.employeeRange} range`} → ~${n} employees (Prospeo)` : `not in Prospeo — likely under ${min} employees`;
			} else if (stageKey === "revenue_band") {
				// cached payload answers most items free; the fresh enrich above only
				// ran for cache-less items
				const cached = cachedProspeo(item);
				const co = hasFirmographics(cached) ? cached : (enriched.get(item.id) ?? null);
				({ verdict, note } = revenueBandVerdict(co, {
					min: num(stage, "min", 10_000_000),
					max: num(stage, "max", 70_000_000),
					perEmp: num(stage, "perEmp", 325_000),
				}));
			} else if (stageKey === "tech_team") {
				// roster-based gate: tech titles in Prospeo's 25-person sample —
				// one vendor, zero extra API calls when ai_signal already cached
				// the roster. Sample proxy for "no real tech team" (≤6 hits passes —
				// small in-house tech teams of 3-6 are common and still good targets).
				const roster0 = await rosterFor(item);
				const TECH = /cto|cio|vp.?eng|engineer|developer|it director|software|data engineer|devops|programmer/i;
				const hits = roster0.people.filter(
					(p) => TECH.test(p.title ?? "") || p.historyTitles.some((t) => TECH.test(t)),
				).length;
				verdict = hits <= num(stage, "maxHits", 6) ? "pass" : "fail";
				note = `${hits} tech titles in ${roster0.people.length}-person sample (Prospeo)`;
			} else if (stageKey === "ops_trigger") {
				// Soft Flowscope-buyer-layer signal on the cached roster (free when
				// ai_signal ran; one pull otherwise). Never gates the queue.
				const roster1 = await rosterFor(item);
				({ verdict, note } = opsTriggerVerdict(roster1, {
					minFinance: num(stage, "minFinance", 1),
					minHiring: num(stage, "minHiring", 2),
				}));
			} else if (stageKey === "ai_signal") {
				({ verdict, note } = await aiSignalVerdict(item, stage));
			} else {
				return { ok: false, error: `No api driver for stage ${stageKey}` };
			}
			// upsert per (item, stage): a concurrent writer (scheduler enrich, manual
			// click, verify agent) may have recorded this item after the queue snapshot
			// — latest verdict wins, evidenceUrl survives (not in set)
			await upsert(item.id, verdict, note);
			okCount++;
			await applyVerdictConsequences(item.id);
		} catch (e) {
			recordError(e);
		}
	}

	// ai_signal auto-backfill: anything already scored on a partial roster
	// (legacy page-1 caches, quota-cut pulls) completes its pagination and
	// re-scores on the next run — queue items first, backfill second, same cap.
	// Latest-wins upsert + applyVerdictConsequences handle flipped verdicts.
	if (stageKey === "ai_signal") {
		const done = items.map((i) => i.id);
		const partials = await db
			.select()
			.from(funnelItems)
			.where(
				and(
					eq(funnelItems.runId, runId),
					sql`exists (select 1 from ${funnelStageResults} r where r.item_id = ${funnelItems.id} and r.stage = 'ai_signal')`,
					sql`${funnelItems.rawData} -> 'roster' is not null`,
					sql`coalesce(${funnelItems.rawData} -> 'roster' ->> 'complete', 'false') <> 'true'`,
					done.length ? notInArray(funnelItems.id, done) : undefined,
				),
			)
			.limit(cap);
		for (const item of partials) {
			try {
				const { verdict, note } = await aiSignalVerdict(item, stage);
				await upsert(item.id, verdict, note);
				okCount++;
				await applyVerdictConsequences(item.id);
			} catch (e) {
				recordError(e);
			}
		}
	}
	return { ok: true, results: okCount, errors, ...(firstError ? { firstError: firstError.slice(0, 200) } : {}) };
}
