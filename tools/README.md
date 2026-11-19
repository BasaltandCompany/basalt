# Local jobs (this Mac)

There are none anymore. The meeting publisher (Anarlog → dashboard) moved
into the desktop app (`desktop/`): native Rust inside the Tauri binary —
no launchd, no sidecar, no bun script. Install the app and the sync is
running; config/state live in the app data folder
(`~/Library/Application Support/org.madcactus.aspectrr-admin/`).

Other personal automation that is NOT here: Orca automations (e.g. the
Siri→Linear voice-ideas pipeline) live inside the Orca app, not launchd —
they follow the laptop via Orca's own sync/setup, not this repo.

## Conventions
