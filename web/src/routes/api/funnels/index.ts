// Funnels API — session (UI) or mc_ key (scripts/agents) guarded.
// GET  /api/funnels                → { funnels, runs }
// POST /api/funnels {funnelId, source?, note?} → { run }
import type { APIEvent } from "@solidjs/start/server";
import { desc, eq, count } from "drizzle-orm";
import { db } from "~/db";
import { funnelItems, funnelRuns, funnels } from "~/db/schema";
import { ensureFreightFunnel, ensureMepFunnel, funnelAuthed } from "~/lib/funnels";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const GET = async (event: APIEvent) => {
	if (!(await funnelAuthed(event.request))) return json({ error: "Unauthorized" }, 401);
	await ensureFreightFunnel();
	await ensureMepFunnel();
	const [funnelRows, runRows] = await Promise.all([
		db.select().from(funnels).orderBy(funnels.createdAt),
		db
			.select({
				id: funnelRuns.id,
				funnelId: funnelRuns.funnelId,
				funnelName: funnels.name,
				source: funnelRuns.source,
				status: funnelRuns.status,
				note: funnelRuns.note,
				createdAt: funnelRuns.createdAt,
				closedAt: funnelRuns.closedAt,
			})
			.from(funnelRuns)
			.innerJoin(funnels, eq(funnelRuns.funnelId, funnels.id))
			.orderBy(desc(funnelRuns.createdAt)),
	]);
	// per-funnel item counts for the archive confirm() — runs are counted client-side from runs[]
	const itemRows = await db
		.select({ funnelId: funnelRuns.funnelId, items: count() })
		.from(funnelItems)
		.innerJoin(funnelRuns, eq(funnelItems.runId, funnelRuns.id))
		.groupBy(funnelRuns.funnelId);
	const itemCounts = Object.fromEntries(itemRows.map((r) => [r.funnelId, Number(r.items)]));
	return json({ funnels: funnelRows, runs: runRows, itemCounts });
};

export const POST = async (event: APIEvent) => {
	if (!(await funnelAuthed(event.request))) return json({ error: "Unauthorized" }, 401);
	const body = (await event.request.json().catch(() => ({}))) as { funnelId?: string; source?: string; note?: string };
	if (!body.funnelId) return json({ error: "funnelId required" }, 400);
	const [funnel] = await db.select({ id: funnels.id }).from(funnels).where(eq(funnels.id, body.funnelId)).limit(1);
	if (!funnel) return json({ error: "Unknown funnelId" }, 400);
	const source = ["importyeti", "fmcsa", "paste", "mixed"].includes(body.source ?? "") ? body.source! : "paste";
	const [run] = await db.insert(funnelRuns).values({ funnelId: body.funnelId, source, note: body.note ?? null }).returning();
	return json({ run });
};
