import { describe, expect, test } from "bun:test";
import { parseIcs, parseIcsDate } from "./ics";

const ICAL = [
	"BEGIN:VCALENDAR",
	"BEGIN:VEVENT",
	"UID:abc123@google.com",
	"SUMMARY:BCW weekly sync",
	"DTSTART:20261124T140000Z",
	"DTEND:20261124T143000Z",
	"ATTENDEE;CN=Collin;ROLE=REQ-PARTICIPANT:mailto:collin@basalt.ac",
	"ATTENDEE;CN=Client:mailto:dev@bcw.example",
	"LOCATION:https://meet.google.com/xyz",
	"END:VEVENT",
	"BEGIN:VEVENT",
	"UID:def456@google.com",
	"SUMMARY:On-site working session",
	"DTSTART;TZID=America/Chicago:20261125T090000",
	"DTEND;TZID=America/Chicago:20261125T110000",
	"LOCATION:123 Main St, Chicago",
	"ATTENDEE:mailto:ops@cdl.example",
	"END:VEVENT",
	"BEGIN:VEVENT",
	"UID:malformed",
	"DTSTART:20261125T120000Z",
	"END:VEVENT",
	"END:VCALENDAR",
].join("\r\n");

describe("parseIcs", () => {
	test("parses attendees, location, UTC dates; skips malformed events", () => {
		const events = parseIcs(ICAL);
		expect(events).toHaveLength(2);
		const [first, second] = events;
		expect(first!.uid).toBe("abc123@google.com");
		expect(first!.attendees).toEqual(["collin@basalt.ac", "dev@bcw.example"]);
		expect(first!.startsAt.toISOString()).toBe("2026-11-24T14:00:00.000Z");
		expect(first!.location).toBe("https://meet.google.com/xyz");
		expect(second!.title).toBe("On-site working session");
		expect(second!.attendees).toEqual(["ops@cdl.example"]);
	});
	test("handles folded (continuation) lines", () => {
		const folded = ["SUMMARY:BCW weekly sync —", "  deliverables review"].join("\r\n");
		const events = parseIcs(`BEGIN:VEVENT\r\nUID:x\r\n${folded}\r\nDTSTART:20261124T140000Z\r\nDTEND:20261124T143000Z\r\nEND:VEVENT`);
		expect(events[0]!.title).toBe("BCW weekly sync — deliverables review");
	});
	test("date forms: Z, local, all-day", () => {
		expect(parseIcsDate("20261124T140000Z")!.toISOString()).toBe("2026-11-24T14:00:00.000Z");
		expect(parseIcsDate("20261124T140000")!.getHours()).toBe(14);
		expect(parseIcsDate("20261124")).toBeNull(); // all-day: no start/end pair → event skipped
		expect(parseIcsDate("garbage")).toBeNull();
	});
});
