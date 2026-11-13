# LinkedIn sourcing automation (Orca browser loop)

One Orca automation drives the logged-in LinkedIn session inside Orca's
embedded browser to source ICP candidates. Connecting is MANUAL (Collin,
~20/day by hand — Nov 2026 decision; the connect automation was retired).

```
Automation A (daily ~07:30)                     You
scrape ~10 ICP candidates  ──────▶  review /admin/outreach,
POST /api/outreach/candidates        toggle "Approve fit"
                                     then connect on LinkedIn yourself
```

## One-time setup

1. Set `DASHBOARD_URL` and `ADMIN_API_KEY` (an admin, memberless `mc_` key
   from /admin/api-keys) in the automation's environment or the repo `.env`.
2. Save the LinkedIn people-search URL (title: CEO/Founder/Owner, Midwest
   geo, target industries) in the automation prompt where marked.
3. Register the automation:

```bash
orca automations create --name "LinkedIn source" --trigger weekdays --time 07:30 \
  --repo id:<repoId> --provider claude --prompt "$(cat scripts/linkedin-source.prompt.md)"
```

## Safety rails

- Hard abort on any CAPTCHA, login wall, "your account is restricted" banner,
  or an unexpected markup change — report the failure and stop. No retries
  against a suspicious page.
- Rows stay in `candidate` until the dashboard confirms receipt. A crashed
  run loses nothing.

The invite-queue API (`/api/outreach/invite-queue`, `/invited`) remains: it
serves the server-enforced weekly budget (cap 20/run, 100/week) and the
manual workflow's bookkeeping — POST the ids you connected by hand to flip
rows to `proposed` with the +3-day acceptance check.
