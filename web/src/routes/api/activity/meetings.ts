// POST /api/activity/meetings — calendar events from the local iCal
// collector (mc_ key). Attendee emails match portal members → companies →
// a single active project; location-bearing non-virtual events get the
// travel buffer. Upserts by calendar UID.
import type { APIEvent } from "filesystem-routing/api";
import { isAdminApiKey, json } from "~/lib/admin-api";
import { ingestMeetings, type MeetingInput } from "~/lib/activity/record";

const MAX_EVENTS = 500;

export const POST = async (event: APIEvent) => {
	if (!(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	let body: { events?: unknown[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const raw = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : null;
	if (!raw) return json({ error: "events[] required" }, 400);
	const meetings: MeetingInput[] = [];
	for (const r of raw) {
		const it = r as Record<string, unknown>;
		const startsAt = typeof it.startsAt === "string" ? new Date(it.startsAt) : null;
		const endsAt = typeof it.endsAt === "string" ? new Date(it.endsAt) : null;
		if (typeof it.uid !== "string" || !startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)
			continue; // malformed event rows are skipped, not fatal
		meetings.push({
			uid: it.uid.slice(0, 200),
			title: typeof it.title === "string" ? it.title.slice(0, 200) : null,
			startsAt,
			endsAt,
			location: typeof it.location === "string" ? it.location.slice(0, 200) : null,
			attendees: Array.isArray(it.attendees)
				? it.attendees.filter((a): a is string => typeof a === "string" && /.+@.+\..+/.test(a)).map((a) => a.toLowerCase().slice(0, 200))
				: [],
		});
	}
	const stored = await ingestMeetings(meetings);
	return json({ ok: true, stored });
};
