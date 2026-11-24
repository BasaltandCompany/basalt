#!/usr/bin/env bun
// Google Calendar collector (ASPTR-227) — the meetings signal. Fetches the
// private iCal feed, parses VEVENTs, and upserts them to
// /api/activity/meetings where attendees map to client companies and
// location-bearing events get travel buffers. Idempotent by calendar UID,
// so a failed run just re-uploads the same window next tick.
//   cd web && ACTIVITY_CAL_URL=... ACTIVITY_API_KEY=mc_... bun scripts/activity/collect-calendar.ts [--dry]
import { homedir } from "node:os";
import { join } from "node:path";
import { parseIcs } from "~/lib/activity/ics";

async function main() {
	const dry = process.argv.includes("--dry");
	const config = await loadConfig();
	const res = await fetch(config.calUrl, { headers: { "User-Agent": "basalt-activity-collector" } });
	if (!res.ok) throw new Error(`iCal fetch ${res.status}`);
	const events = parseIcs(await res.text());
	const now = Date.now();
	const window = events.filter((e) => new Date(e.endsAt).getTime() >= now - 7 * 86_400_000 && new Date(e.startsAt).getTime() <= now + 86_400_000);
	if (window.length === 0) {
		console.log("no events in window");
		return;
	}
	if (dry) {
		for (const e of window)
			console.log(
				`${e.startsAt.toISOString()}–${e.endsAt.toISOString()} | ${e.title ?? "(no title)"} | ${e.location ?? "no location"} | ${e.attendees.join(", ") || "no attendees"}`,
			);
		return;
	}
	const post = await fetch(`${config.baseUrl}/api/activity/meetings`, {
		method: "POST",
		headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({
			events: window.map((e) => ({
				uid: e.uid,
				title: e.title,
				startsAt: e.startsAt.toISOString(),
				endsAt: e.endsAt.toISOString(),
				location: e.location,
				attendees: e.attendees,
			})),
		}),
	});
	if (!post.ok) throw new Error(`meetings POST ${post.status}: ${await post.text()}`);
	console.log(`uploaded ${window.length} calendar events`);
}

async function loadConfig(): Promise<{ baseUrl: string; apiKey: string; calUrl: string }> {
	// env first, then ~/.config/basalt/activity.json (calendarIcalUrl is the
	// Google Calendar "Secret address in iCal format" — private, never logged)
	let calUrl = process.env.ACTIVITY_CAL_URL ?? null;
	let baseUrl = process.env.ACTIVITY_BASE_URL ?? "https://basalt.ac";
	let apiKey = process.env.ACTIVITY_API_KEY ?? null;
	try {
		const file = Bun.file(join(homedir(), ".config/basalt/activity.json"));
		if (await file.exists()) {
			const cfg = await file.json();
			calUrl = calUrl ?? cfg.calendarIcalUrl ?? null;
			baseUrl = cfg.baseUrl ?? baseUrl;
			apiKey = apiKey ?? cfg.apiKey ?? null;
		}
	} catch { /* env-only */ }
	if (!calUrl) throw new Error("Set ACTIVITY_CAL_URL or add calendarIcalUrl to ~/.config/basalt/activity.json");
	if (!apiKey) throw new Error("Set ACTIVITY_API_KEY (mc_ key) or add apiKey to ~/.config/basalt/activity.json");
	return { baseUrl, apiKey, calUrl };
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
