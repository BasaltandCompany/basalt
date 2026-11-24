// POST /api/activity/usage — daily Pi agent-usage rollups (mc_ key).
// The local scanner recomputes full windows each run; rows upsert by
// dedupeKey so replays are exact.
import type { APIEvent } from "filesystem-routing/api";
import { isAdminApiKey, json } from "~/lib/admin-api";
import { ingestUsage, type UsageRow } from "~/lib/activity/record";

const MAX_ROWS = 5000;

const num = (v: unknown): number => (Number.isFinite(v) ? Math.max(0, Math.floor(Number(v))) : 0);

export const POST = async (event: APIEvent) => {
	if (!(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	let body: { rows?: unknown[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const raw = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : null;
	if (!raw) return json({ error: "rows[] required" }, 400);
	const rows: UsageRow[] = [];
	for (const r of raw) {
		const it = r as Record<string, unknown>;
		const day = typeof it.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.day) ? it.day : null;
		const projectId = typeof it.projectId === "string" && /^[0-9a-f-]{36}$/i.test(it.projectId) ? it.projectId : null;
		const category = it.category === "internal" || it.category === "personal" ? it.category : null;
		if (!day || typeof it.dedupeKey !== "string" || (projectId && category) || (!projectId && !category && it.category !== null))
			return json({ error: "Each row needs day + dedupeKey, and projectId XOR category" }, 400);
		rows.push({
			dedupeKey: it.dedupeKey.slice(0, 200),
			day,
			projectId,
			category,
			provider: typeof it.provider === "string" ? it.provider.slice(0, 60) : null,
			model: typeof it.model === "string" ? it.model.slice(0, 100) : null,
			inputTokens: num(it.inputTokens),
			outputTokens: num(it.outputTokens),
			cacheReadTokens: num(it.cacheReadTokens),
			cacheWriteTokens: num(it.cacheWriteTokens),
			totalTokens: num(it.totalTokens),
			apiCostUsd: Number.isFinite(it.apiCostUsd) ? Math.max(0, Number(it.apiCostUsd)) : 0,
			sessionCount: num(it.sessionCount),
		});
	}
	const upserted = await ingestUsage(rows);
	return json({ ok: true, upserted });
};
