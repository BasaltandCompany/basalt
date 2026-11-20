// GET /api/sync?since=<eventId>&kinds=a,b — the engine's read feed: change
// events since the cursor, with the changed rows for subscribed kinds joined
// in. Session-guarded; rows come from the basalt_notify_change() trigger
// (lib/live-server.ts). CAP is a safety valve, not a feed guarantee: when the
// backlog exceeds it the response sets truncate:true and the client fully
// refetches its kinds instead of silently skipping events.
import type { APIEvent } from "filesystem-routing/api";
import { asc, gt } from "drizzle-orm";
import { db } from "~/db";
import { changeEvents } from "~/db/schema";
import { getCurrentUser } from "~/lib/session";
import { fetchRowsForKinds, kindsForTable, SYNC_KINDS } from "~/lib/sync/sync-server";

const CAP = 200; // max events per poll — beyond this the client refetches wholesale

export const GET = async (event: APIEvent) => {
	if ((await getCurrentUser()) === null) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
	}
	const since = Number(new URL(event.request.url).searchParams.get("since"));
	const subscribed = new Set(
		(new URL(event.request.url).searchParams.get("kinds") ?? "")
			.split(",")
			.map((k) => k.trim())
			.filter((k) => k in SYNC_KINDS),
	);

	const events =
		Number.isFinite(since) && subscribed.size
			? await db
					.select({ id: changeEvents.id, table: changeEvents.table, rowId: changeEvents.rowId })
					.from(changeEvents)
					.where(gt(changeEvents.id, since))
					.orderBy(asc(changeEvents.id))
					.limit(CAP)
			: [];
	const last = events.length > 0 ? events[events.length - 1].id : Number.isFinite(since) ? since : 0;
	const truncate = events.length >= CAP;

	const rows: { kind: string; row: Record<string, unknown> }[] = [];
	if (!truncate) {
		const idsByKind = new Map<string, string[]>();
		for (const e of events) {
			if (!e.rowId) continue;
			for (const kind of kindsForTable(e.table, subscribed)) {
				const ids = idsByKind.get(kind) ?? [];
				if (!ids.includes(e.rowId)) ids.push(e.rowId);
				idsByKind.set(kind, ids);
			}
		}
		for (const [kind, ids] of idsByKind) {
			for (const row of await fetchRowsForKinds(kind, ids)) rows.push({ kind, row });
		}
	}

	return new Response(JSON.stringify({ last, truncate, rows }), { headers: { "Content-Type": "application/json" } });
};
