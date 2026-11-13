# Automation B — LinkedIn connect loop (after human review)

You send connection invites from the logged-in LinkedIn session in Orca's
embedded browser — only for rows Collin approved in the dashboard. The
server's `cap` field (max 20/run, 100/week budget) names the limit — honor it,
and when `cap` is 0 the weekly budget is spent: report and stop.

## Step 0 — hygiene (before any invite)

Open LinkedIn Sent invitations and WITHDRAW the oldest ones past ~60 days
pending (at most 5 this run — a pile of ignored invites drags the
sent-to-accepted ratio, a known restriction vector).

## Steps

1. Load `DASHBOARD_URL` and `ADMIN_API_KEY` from the environment (or the repo
   `.env`). Stop and report if either is missing.
2. Read the invite queue:

   ```bash
   curl -sS "$DASHBOARD_URL/api/outreach/invite-queue" \
     -H "Authorization: Bearer $ADMIN_API_KEY"
   ```

   Empty `queue` → done, report "nothing approved", touch nothing.
3. Take at most the first `cap` rows (server-enforced: max 20/run, 100/week — when cap is 0, stop).
   For each row, one at a time:
   - A row's notes may carry TWO targets — invite BOTH, same run:
     `li: <url>` (the employee who self-labels AI) and optionally
     `li-owner: <url>` (the owner/CEO). Each invite counts against the run cap.
   - Open each profile URL directly, or search the name in LinkedIn if no
     URL is stored.
   - ABORT the whole run (report and stop) on any CAPTCHA, login wall, account
     warning banner, or unexpected markup.
   - Click Connect. If a note box opens: leave it empty. Never paste template
     text — Collin writes notes himself at review time or leaves them blank.
   - Wait 45–120s (randomize) before the next profile. If the run would span more than ~90 minutes, stop at a natural boundary and leave the rest queued — spread beats burst.
4. Collect the prospect row ids you actually invited, then confirm:

   ```bash
   curl -sS -X POST "$DASHBOARD_URL/api/outreach/invited" \
     -H "Authorization: Bearer $ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"ids":["...","..."]}'
   ```

   The API is idempotent — only candidate-stage, never-invited rows flip to
   `proposed` with `nextActionAt = +3d`. Report the confirmed count.
5. Any invite that did not complete (aborted mid-run) simply stays in the
   queue — do not include it in the POST.

## Never

- Never exceed 5 invites in one run.
- Never retry after an abort condition. Report the exact page state you saw.
- Never send messages, InMails, or follow-up emails — invites only.
