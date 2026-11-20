// Record a stage verdict (upsert per item+stage) — session or mc_ key guarded.
// POST /api/funnels/results { itemId, stage, verdict, evidenceUrl?, note?, method? }
// Triggers promotion on all-stages-pass and un-approves the linked prospect on a fail.
import type { APIEvent } from "filesystem-routing/api";
import { recordStageVerdict } from "~/lib/funnels";
import { funnelAuthed } from "~/lib/funnel-auth";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const POST = async (event: APIEvent) => {
	if (!(await (event.request))) return json({ error: "Unauthorized" }, 401);
	const body = (await event.request.json().catch(() => ({}))) as {
		itemId?: string;
		stage?: string;
		verdict?: string;
		evidenceUrl?: string;
		note?: string;
		method?: string;
	};
	if (!body.itemId || !body.stage || !["pass", "fail"].includes(body.verdict ?? "")) {
		return json({ error: "itemId, stage, verdict (pass|fail) required" }, 400);
	}
	const r = await recordStageVerdict({
		itemId: body.itemId,
		stage: body.stage,
		verdict: body.verdict as "pass" | "fail",
		note: body.note ?? null,
		evidenceUrl: body.evidenceUrl ?? null,
		method: body.method ?? null,
	});
	if ("error" in r) return json({ error: r.error }, r.status);
	return json({ ok: true });
};
