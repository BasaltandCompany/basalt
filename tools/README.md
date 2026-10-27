# Local jobs (this Mac)

Self-made launchd jobs. Each folder = one job: the script, a plist template,
`install.sh` (idempotent, safe to re-run on a new laptop), `status.sh`.

**Migration to a new Mac:** clone this repo → run each job's `install.sh` →
re-enter secrets (API keys live in the dashboard, never in this repo).

| Job | What it does | Schedule | Install | Status |
|---|---|---|---|---|
| `meeting-publisher/` | Finished Anarlog meetings with a client-matching title → draft (transcript + memo + audio) on the Mad Cactus dashboard | every 60s (`StartInterval`) | `./install.sh mc_<key>` | `./status.sh` |

**Migrating into the desktop app** (`desktop/`): the Tauri app now runs this
same script on a 60s timer (Bun sidecar — see `desktop/scripts/fetch-bun.sh`),
seeding config + state from the launchd install on first run. Until you cut
over (`launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.madcactus.meeting-publisher.plist`),
launchd is still the runtime; `install.sh` stays as rollback. Don't run both
for long — separate state dirs can double-push a meeting recorded mid-overlap.

Other personal automation that is NOT here: Orca automations (e.g. the
Siri→Linear voice-ideas pipeline) live inside the Orca app, not launchd —
they follow the laptop via Orca's own sync/setup, not this repo.

## Conventions

- Jobs install to `~/.<name>/` — never run from a repo checkout or worktree
  (worktrees disappear; `~/Library/LaunchAgents` must point at a stable path).
- Secrets are passed to `install.sh` as arguments and baked into the rendered
  plist only — nothing secret is committed.
- Every job appends human-readable activity to its own `state/log` and parks
  repeated failures in `state/failed.log`; `status.sh` surfaces both.
