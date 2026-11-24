# Activity tracking (ASPTR-227)

Automatically answers "how much active time and how many agent tokens went to each client this week?" without a manual timer — all scheduling lives in the Basalt Sampler desktop app (no launchd, no cron). Five signals, one fact table (`activity_events` + `agent_usage_daily`), attribution decided by `project_matchers`.

## The signals, in trust order

1. **Pi coding sessions** — `scripts/activity/pi-usage-scan.ts` walks `~/.pi/agent/sessions/**/*.jsonl`, attributes each session's `cwd` via worktree matchers (git remote as fallback), and upserts per-day token/cost rollups to `POST /api/activity/usage`.
2. **In-app events** — the server records mutations (project edits, deliverables, status updates, emails sent to a project-linked contact) as exact 5-minute spans, and project admin pages feed a **visibility heartbeat** (`ActivityHeartbeat`, 30s pings while the tab is visible; blocks die 90s after the last ping — an abandoned dashboard tab accrues nothing).
3. **Calendar** — `scripts/activity/collect-calendar.ts` fetches your Google Calendar private iCal feed, parses events (`~/lib/activity/ics`), and posts them; attendee emails match portal members → companies → a single active project. Location-bearing non-virtual events get a ±30 min travel buffer (`ACTIVITY_TRAVEL_MINUTES`).
4. **Desktop sampler** — `desktop/sampler` (Swift menubar app) samples foreground app + window title every 30s, splits on idle >2 min / lock / sleep, posts batches to `POST /api/activity/samples`. **It also runs the collector**: an in-process 10-minute timer shells out to `pi-usage-scan.ts` + `collect-calendar.ts` (bun), so pi tokens, calendar meetings, and desktop samples all flow through one app. Unresolved blocks ≥10 min trigger a **notification prompt** ("Which client?"), throttled to 1 per 15 min; answers upsert learned matchers so prompts decay over time.

Rollup (`/admin/activity`) merges overlapping events without double-counting (highest confidence wins: manual > exact > prompted > inferred) and reports **client / internal / personal / unassigned** buckets plus tokens and **API-equivalent cost** — with a coding plan that cost is a subscription-verification metric, not spend. Observed hours stay separate from `time_entries`; the review screen assigns unassigned blocks and can convert one into a real time entry.

## One-time setup

1. **mc_ key + calendar feed**: mint an mc_ key at `/admin/api-keys`, then write `~/.config/basalt/sampler.json`:
   ```json
   {
     "baseUrl": "https://basalt.ac",
     "apiKey": "mc_…",
     "deviceId": "collins-mac",
     "calendarIcalUrl": "https://calendar.google.com/calendar/ical/…/basic.ics"
   }
   ```
   (Google Calendar → Settings → your calendar → "Secret address in iCal format". Optional keys: `webDir` if the main checkout isn't `~/GitHub/basalt/web`, `bunPath` if bun isn't on the default PATH. The app's menu has **Open Config** and **Open Log**.)
2. **Seed the matchers** (workspaces → projects; correct the bucket lists in the script once):
   ```bash
   cd web && ACTIVITY_API_KEY=mc_… bun scripts/activity/seed-matchers.ts   # add --dry to preview
   ```
   Folders with no matching basalt project are printed — create/attach the project, re-run, then fix anything on `/admin/activity` (matcher CRUD is at the bottom of the page).
3. **Build and start the app** (this is the only daemon — sampling + collector + prompts all live in it):
   ```bash
   bash desktop/sampler/build.sh
   open desktop/sampler/BasaltSampler.app
   ```
   Grant Accessibility when prompted (window titles), allow notifications, and add as a login item. The menu shows collector status (✓/✗ + last run time) with **Run collector now** for testing.

## Notes

- All ingest routes authenticate with the revocable `mc_` bearer key and are idempotent (batch/event/day dedupe keys) — a failed collector run just replays the same window.
- Privacy: only timestamps, app names, ≤200-char titles, and idle seconds are stored, on your own server. The sampler does no screenshots/OCR/keystrokes.
- The sampler app is the only thing that needs to run: quitting it stops sampling, tokens, and calendar pickup until the next launch. Collector output logs to `~/.local/share/basalt/collector.log`.
