#!/usr/bin/env bash
# One launchd tick: pi usage scan + calendar fetch. Lives next to the
# scripts so the plist has a single entry point.
set -uo pipefail
cd "$(dirname "$0")/../.." # → web/
mkdir -p ~/.local/share/basalt
bun scripts/activity/pi-usage-scan.ts || echo "pi-usage-scan failed"
bun scripts/activity/collect-calendar.ts || echo "collect-calendar failed"
exit 0 # launchd should keep ticking even when the network is down
