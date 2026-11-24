// POST /api/activity/heartbeats — visibility heartbeat from the project
// admin page (admin session cookie). One ping per 30s while the tab is
// visible; the server extends the current block or opens a new one. Blocks
// die 90s after the last ping, so a hidden tab or a sleeping machine
// accrues nothing.
import type { APIEvent } from "filesystem-routing/api";
import { isAdminApiKey, json } from "~/lib/admin-api";
import { touchHeartbeat } from "~/lib/activity/record";
import { getCurrentUser } from "~/lib/session";

export const POST = async (event: APIEvent) => {
	let user = await getCurrentUser();
	if (!user && !(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	user ??= { id: "mc" } as NonNullable<typeof user>;
	let body: { projectId?: string; at?: string };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const projectId = String(body.projectId ?? "");
	if (!/^[0-9a-f-]{36}$/i.test(projectId)) return json({ error: "projectId required" }, 400);
	const at = body.at && Number.isFinite(Date.parse(body.at)) ? new Date(body.at) : new Date();
	await touchHeartbeat(user.id, projectId, at);
	return json({ ok: true });
};
