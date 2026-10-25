#!/bin/bash
# Fetch the Bun sidecar binary into src-tauri/binaries/ (gitignored).
#
# Tauri externalBin requires the naming <name>-<rust-target-triple>, so this
# downloads the official Bun release matching `rustc`'s host triple. Pass a
# triple to fetch for another target, e.g.:
#   ./fetch-bun.sh x86_64-apple-darwin
set -euo pipefail
cd "$(dirname "$0")/../.." # repo root

TRIPLE="${1:-$(rustc -vV 2>/dev/null | awk '/host:/ {print $2}')}"
[ -n "$TRIPLE" ] || { echo "rustc not found — pass a target triple: $0 aarch64-apple-darwin"; exit 1; }

case "$TRIPLE" in
	aarch64-apple-darwin) ASSET=bun-darwin-aarch64.zip ;;
	x86_64-apple-darwin) ASSET=bun-darwin-x64.zip ;;
	x86_64-pc-windows-msvc) ASSET=bun-windows-x64.zip ;;
	x86_64-unknown-linux-gnu) ASSET=bun-linux-x64.zip ;;
	aarch64-unknown-linux-gnu) ASSET=bun-linux-aarch64.zip ;;
	*) echo "no bun release asset mapped for $TRIPLE — add it to this script"; exit 1 ;;
esac

DEST="desktop/src-tauri/binaries/bun-$TRIPLE"
if [ -x "$DEST" ]; then
	echo "$DEST already present"
	exit 0
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fL "https://github.com/oven-sh/bun/releases/latest/download/$ASSET" -o "$TMP/bun.zip"
unzip -o -q "$TMP/bun.zip" -d "$TMP"
BIN="$(find "$TMP" -type f -name 'bun*' | head -1)"
[ -n "$BIN" ] || { echo "no bun binary found inside $ASSET"; exit 1; }

mkdir -p "$(dirname "$DEST")"
chmod +x "$BIN"
mv "$BIN" "$DEST"
echo "Installed $DEST ($(du -h "$DEST" | cut -f1))"
