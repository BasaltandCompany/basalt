# Outreach playbook — importer-exporter funnel (LinkedIn + email)

How leads flow, how to log connects, and where everything lives. Created Nov 2026 after the LinkedIn custom-feed work.

## The loop (in-dashboard, no Orca)

```
"Made in Indiana ICP" funnel (basalt dashboard, in-app scheduler):   You (dashboard)
monthly Purdue-MEP directory pull lands companies in an open funnel  /admin/funnels board:
run — deduped against everything already promoted to outreach.        review, record stage verdicts, promote survivors
Enrichment budgets are 0 (no Prospeo spend) — humans verify + promote.  → stage=candidate in /admin/outreach,
                                                                           approve fit, then YOU connect manually.
```

No LinkedIn automation exists anymore (removed Nov 2026 — pi-agent login never worked; Collin does connections by hand, 1-2/day). The queue API (`/api/outreach/invite-queue`, `/invited`) still exists for a future agent if wanted.

- **candidate** — in the funnel, not yet touched. 31 rows added Nov 8-9 sit here.
- **proposed** — LinkedIn invite sent (you, manually). Flip the stage + append `invited <date>` to notes when you send.
- **sent** — cold email gone out (dispatcher rung 1).
- **watching / replied / meeting / won / shutdown** — progress as they happen.

Connect invites are **default connections only** — no note text ever (Collin, Nov 2026: a bare invite reads as peer curiosity; personalization lives in the follow-up after acceptance).

## How to log a manual connect (you send 1-2/day)

1. Before inviting: edit the row in `/admin/outreach`, read the `notes` (`li:` = the person's profile URL). Automation sends default invites (no note); if you invite manually, default connection too — save the personalization for the follow-up.
2. After inviting: flip the row's stage **candidate → proposed** in the dashboard and append `invited <date>` to notes. That's the log.
3. When they accept: note it ("accepted 11/14"), set nextActionAt +3 days, follow up with value (Loom, brain link, or the Claude-kit gift).
4. Never re-invite: the automation skips any row already at stage proposed or whose notes say PENDING. Known pending-but-unlogged: Kfir Gavrieli, Nathan Engelking, Talia Cogan, Kelly Wendorff (WeldFab), Kris Kegerize (Bomgaars), Rob Caron (Caron).

## Where the leads came from (source_note tags)

| Tag | Meaning | Wave size |
| --- | --- | --- |
| `mep-madefit 2026-11-08` | Purdue MEP Made-in-Indiana top-20 (owners in MEP-OWNERS.md) | 20 |
| `li-group-mining … arm A` | Magento Commerce group, US-verified (US-WAVE.md) | 3 |
| `li-group-mining … arm B` | Indiana AI Innovation Network (ARM-B-INDIANA-AI.md) | 5 |
| `li-manual …` | One-off profile reviews (WeldFab) | 1 |
| `mep-monthly …` | Future: monthly automation adds | — |

Compare accept + reply rates per tag against the ~1% cold-email baseline (CDL: 0/3,500). That comparison IS the experiment.

## The steady channel (automated)

- `outreach/mep-refresh.py` — pulls the 350-company Made in Indiana DB, dedupes vs `outreach/mep-state.json`, writes `MEP-NEW.md`.
- **In-app funnel (the steady channel now):** the "Made in Indiana ICP" funnel in the basalt dashboard pulls the Purdue MEP directory every 30 days via the app's own scheduler (`web/src/lib/mep-discovery.ts` + `funnel-scheduler.ts`; migration `20261113122530_warm_frog_thor.sql` adds the `mep` discovery source). Ships with the next deploy — migration must apply before/with it. Manual fallback until then: `python3 outreach/mep-refresh.py`.
- Backlog: 20 bench companies + 35 VERIFYs (MEP-ENRICH-1/2/3.md), 335 remaining MEP-DATABASE companies, tariff-post search, award lists (BizTimes Future 50 etc.).

## Reference files

CUSTOM-FEED.md (feed + channel map) · ARM-A/B, US-WAVE (mined people) · BCW-SIGNALS.md (lookalike recipes) · MEP-DATABASE/PROSPECTS/TOP20/OWNERS/ENRICH-1/2/3 (the manufacturer list) · scripts/mep-monthly.prompt.md (automation copy).
