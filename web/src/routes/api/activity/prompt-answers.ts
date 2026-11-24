// POST /api/activity/prompt-answers — the sampler's notification reply
// (mc_ key). Reclassifies the block; "none" marks it answered so it never
// re-prompts. remember=true upserts a learned app→project matcher.
import type { APIEvent } from "filesystem-routing/api";
import { isAdminApiKey, json } from "~/lib/admin-api";
import { answerPrompt } from "~/lib/activity/record";
import type { Bucket } from "~/lib/activity/match";

export const POST = async (event: APIEvent) => {
	if (!(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	let body: { eventId?: string; projectId?: string | null; category?: string | null; remember?: boolean; appName?: string | null };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const eventId = String(body.eventId ?? "");
	if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "eventId required" }, 400);
	const bucket: NonNullable<Bucket> | null = body.projectId
		? { projectId: String(body.projectId) }
		: body.category === "internal" || body.category === "personal"
			? { category: body.category }
			: null;
	await answerPrompt(eventId, bucket, !!body.remember, body.appName ? String(body.appName).slice(0, 80) : null);
	return json({ ok: true });
};
