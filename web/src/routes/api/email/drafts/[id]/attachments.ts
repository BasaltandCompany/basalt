import type { APIEvent } from "@solidjs/start/server";
import { getAuthedClient } from "~/lib/session";
import { attachBytes, removeOutboxAttachment } from "~/lib/email-outbox";

/**
 * /api/email/drafts/:id/attachments
 * POST   multipart form { file }   → attach one file (≤20MB)
 * DELETE ?path=storage/path        → remove one attachment
 */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const POST = async (event: APIEvent) => {
	if (!(await getAuthedClient())) return json({ error: "Unauthorized" }, 401);
	const form = await event.request.formData();
	const file = form.get("file") as File | null;
	if (!file) return json({ error: "file required" }, 400);
	if (file.size > MAX_FILE_BYTES) {
		return json({ error: `${file.name}: ${(file.size / 1048576).toFixed(1)}MB exceeds the 20MB per-file cap` }, 400);
	}
	const res = await attachBytes(event.params.id, [
		{ bytes: await file.arrayBuffer(), filename: file.name, mimeType: file.type },
	]);
	return res.ok ? json({ attachments: res.attachments }) : json({ error: res.error }, 400);
};

export const DELETE = async (event: APIEvent) => {
	if (!(await getAuthedClient())) return json({ error: "Unauthorized" }, 401);
	const path = new URL(event.request.url).searchParams.get("path");
	if (!path) return json({ error: "path required" }, 400);
	const ok = await removeOutboxAttachment(event.params.id, path);
	return json({ ok }, ok ? 200 : 404);
};
