// Funnel archive — sets/clears archivedAt. There is deliberately NO delete:
// enriched rawData (Prospeo rosters, ImportYeti scrapes) is too expensive to
// lose; archiving greys a funnel out and drops it from the New-run dropdown.
// POST /api/funnels/archive {funnelId, archived: true|false} → { funnel }
import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { funnels } from "~/db/schema";
import { funnelAuthed } from "~/lib/funnels";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const POST = async (event: APIEvent) => {
	if (!(await funnelAuthed(event.request))) return json({ error: "Unauthorized" }, 401);
	const body = (await event.request.json().catch(() => ({}))) as { funnelId?: string; archived?: boolean };
	if (!body.funnelId || typeof body.archived !== "boolean") return json({ error: "funnelId and archived (boolean) required" }, 400);
	const [funnel] = await db
		.update(funnels)
		.set({ archivedAt: body.archived ? new Date() : null })
		.where(eq(funnels.id, body.funnelId))
		.returning();
	if (!funnel) return json({ error: "Unknown funnelId" }, 404);
	return json({ funnel });
};
