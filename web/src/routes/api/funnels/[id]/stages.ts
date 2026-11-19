import { funnelAuthed } from "~/lib/funnel-auth";
// Tune a stage's gate on the fly — POST /api/funnels/:id/stages
// Body: { key, params?: Record<string, number>, soft?: boolean }
// params replace that stage's tuning numbers (min/max headcount, revenue band,
// perEmp, maxHits); soft=true makes the stage signal-only: verdicts are
// recorded but never block later stages or promotion. Code still owns
// label/gate/method (ensureFreightFunnel merges those back on sync).
import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { funnels, type FunnelStage } from "~/db/schema";

export const POST = async (event: APIEvent) => {
	if (!(await (event.request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
	const body = (await event.request.json().catch(() => ({}))) as {
		key?: string;
		params?: Record<string, number>;
		soft?: boolean;
	};
	if (!body.key) return Response.json({ error: "key required" }, { status: 400 });
	if (body.params && Object.values(body.params).some((v) => typeof v !== "number" || !Number.isFinite(v))) {
		return Response.json({ error: "params must be finite numbers" }, { status: 400 });
	}
	const [f] = await db.select().from(funnels).where(eq(funnels.id, event.params.id)).limit(1);
	if (!f) return Response.json({ error: "Funnel not found" }, { status: 404 });
	let hit = false;
	const stages: FunnelStage[] = (f.stages ?? []).map((s) => {
		if (s.key !== body.key) return s;
		hit = true;
		return {
			...s,
			...(body.params ? { params: body.params } : {}),
			...(body.soft !== undefined ? { soft: body.soft } : {}),
		};
	});
	if (!hit) return Response.json({ error: `Unknown stage ${body.key}` }, { status: 400 });
	await db.update(funnels).set({ stages }).where(eq(funnels.id, f.id));
	return Response.json({ ok: true });
};
