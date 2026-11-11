// Live admin feed — GET /api/changes?since=<id> → { events: [{id, table, op}], last }.
// `last` is the cursor the client sends next time (== since when nothing changed).
// Session-guarded; rows come from the basalt_notify_change() trigger (lib/live-server.ts).
import type { APIEvent } from "@solidjs/start/server";
import { asc, gt } from "drizzle-orm";
import { db } from "~/db";
import { changeEvents } from "~/db/schema";
import { getCurrentUser } from "~/lib/session";

const CAP = 500; // one poll is a revalidate signal, not a feed — cap the payload

export const GET = async (event: APIEvent) => {
	if ((await getCurrentUser()) === null) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
	}
	const since = Number(new URL(event.request.url).searchParams.get("since"));
	const events = Number.isFinite(since)
		? await db
				.select({ id: changeEvents.id, table: changeEvents.table, op: changeEvents.op })
				.from(changeEvents)
				.where(gt(changeEvents.id, since))
				.orderBy(asc(changeEvents.id))
				.limit(CAP)
		: [];
	const last = events.length > 0 ? events[events.length - 1].id : Number.isFinite(since) ? since : 0;
	return new Response(JSON.stringify({ events, last }), { headers: { "Content-Type": "application/json" } });
};
