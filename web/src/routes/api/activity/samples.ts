// POST /api/activity/samples — desktop sampler ingest (mc_ key).
// Batches of 30s foreground samples; the server builds attributed blocks,
// stores them idempotently (batch dedupe keys), and returns unresolved
// blocks worth prompting about, with ranked candidate projects.
import type { APIEvent } from "filesystem-routing/api";
import { eq, desc } from "drizzle-orm";
import { db } from "~/db";
import { projects } from "~/db/schema";
import { isAdminApiKey, json } from "~/lib/admin-api";
import { ingestDesktopSamples, loadMatcherIndex, pendingPromptBlocks, type DesktopSample } from "~/lib/activity/record";

const MAX_SAMPLES = 2000;

export const POST = async (event: APIEvent) => {
	if (!(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	let body: { deviceId?: string; batchId?: string; samples?: DesktopSample[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const deviceId = String(body.deviceId ?? "").slice(0, 64);
	const batchId = String(body.batchId ?? "").slice(0, 64);
	const samples = Array.isArray(body.samples) ? body.samples.slice(0, MAX_SAMPLES) : null;
	if (!deviceId || !batchId || !samples) return json({ error: "deviceId, batchId and samples[] required" }, 400);
	const clean: DesktopSample[] = samples
		.filter((s) => s && typeof s.at === "string" && Number.isFinite(Date.parse(s.at)))
		.map((s) => ({
			at: s.at,
			appName: typeof s.appName === "string" ? s.appName.slice(0, 80) : null,
			title: typeof s.title === "string" ? s.title.slice(0, 200) : null,
			idleSec: Number.isFinite(s.idleSec) ? Number(s.idleSec) : null,
			locked: !!s.locked,
		}));
	if (clean.length === 0) return json({ inserted: 0, prompts: [] });

	const inserted = await ingestDesktopSamples(deviceId, batchId, clean, await loadMatcherIndex());

	// prompt decisions: unresolved recent blocks ≥10 min; sampler throttles
	// (1 per 15 min) and drops these during DND
	const pending = await pendingPromptBlocks(deviceId);
	const candidateRows = await db
		.select({ id: projects.id, name: projects.name })
		.from(projects)
		.where(eq(projects.status, "active"))
		.orderBy(desc(projects.updatedAt))
		.limit(5);
	const prompts = pending.map((p) => ({
		eventId: p.id,
		startedAt: p.startedAt,
		endedAt: p.endedAt,
		minutes: Math.round((new Date(p.endedAt).getTime() - new Date(p.startedAt).getTime()) / 60_000),
		appName: p.appName,
		titleSnippet: p.titleSnippet,
		candidates: candidateRows,
	}));
	return json({ inserted, prompts });
};
