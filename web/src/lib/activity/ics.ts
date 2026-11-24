// Minimal iCal (RFC 5545) VEVENT parser for the Google Calendar private
// feed — no dependency, only what attribution needs. Handles line folding,
// UTC (…Z) and local-floating DTSTART/DTEND with TZID (treated as the
// machine's local zone — the collector runs where Collin lives).
export type IcsEvent = {
	uid: string;
	title: string | null;
	startsAt: Date;
	endsAt: Date;
	location: string | null;
	attendees: string[];
};

export function parseIcs(text: string): IcsEvent[] {
	const lines: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		if (raw.startsWith(" ") || raw.startsWith("\t")) {
			if (lines.length > 0) lines[lines.length - 1] += raw.slice(1);
		} else lines.push(raw);
	}
	const events: IcsEvent[] = [];
	let cur: { props: Record<string, string[]> } | null = null;
	const value = (line: string): [string, string] => {
		const idx = line.indexOf(":");
		return idx === -1 ? [line, ""] : [line.slice(0, idx).toUpperCase(), line.slice(idx + 1)];
	};
	for (const line of lines) {
		if (line === "BEGIN:VEVENT") cur = { props: {} };
		else if (line === "END:VEVENT" && cur) {
			const e = icsFromProps(cur.props);
			if (e) events.push(e);
			cur = null;
		} else if (cur) {
		const [key, val] = value(line);
		const base = key.split(";")[0]; // DTSTART;TZID=…: → DTSTART
		if (base) cur.props[base] = [...(cur.props[base] ?? []), val];
		}
	}
	return events;
}

function icsFromProps(props: Record<string, string[]>): IcsEvent | null {
	const uid = (props.UID ?? [])[0];
	const dtstart = (props.DTSTART ?? [])[0];
	const dtend = (props.DTEND ?? [])[0];
	if (!uid || !dtstart || !dtend) return null;
	const start = parseIcsDate(dtstart);
	const end = parseIcsDate(dtend);
	if (!start || !end || end <= start) return null;
	return {
		uid,
		title: (props.SUMMARY ?? [])[0] ?? null,
		startsAt: start,
		endsAt: end,
		location: (props.LOCATION ?? [])[0]?.trim() || null,
		attendees: (props.ATTENDEE ?? []).map((a) => {
			const m = a.match(/mailto:([^>\s,]+)/i);
			return m ? m[1].toLowerCase() : "";
		}).filter(Boolean),
	};
}

// value forms: "20261125T140000Z", "20261125T140000" (local; TZID treated as
// the collector machine's zone). Date-only (all-day) values return null —
// an all-day block is not a meeting span. Params like
// "DTSTART;TZID=America/Chicago:…" were already split at the first colon.
export function parseIcsDate(v: string): Date | null {
	const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
	if (!m) return null;
	const [, y, mo, d, h, mi, s, z] = m;
	return z === "Z" ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}
