#!/usr/bin/env bash
# Builds BasaltSampler.app from the single Sampler.swift — no Xcode project.
#   bash desktop/sampler/build.sh
set -euo pipefail
cd "$(dirname "$0")"

APP="BasaltSampler.app"
swiftc -O -o "$APP/Contents/MacOS/BasaltSampler" Sampler.swift \
	-framework AppKit -framework CoreGraphics -framework Foundation \
	-framework UserNotifications 2>/dev/null || {
	mkdir -p "$APP/Contents/MacOS"
	swiftc -O -o "$APP/Contents/MacOS/BasaltSampler" Sampler.swift \
		-framework AppKit -framework CoreGraphics -framework Foundation \
		-framework UserNotifications
}

cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>com.basalt.sampler</string>
	<key>CFBundleName</key>
	<string>Basalt Sampler</string>
	<key>CFBundleExecutable</key>
	<string>BasaltSampler</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>LSMinimumSystemVersion</key>
	<string>13.0</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSUserNotificationsUsageDescription</key>
	<string>Basalt asks which client an unattributed block of work belongs to.</string>
</dict>
</plist>
EOF

echo "built $APP — first run:"
echo "  1. open $APP  (grant Accessibility when macOS asks — window titles need it)"
echo "  2. mkdir -p ~/.config/basalt && cat > ~/.config/basalt/sampler.json <<CFG"
echo '     {"baseUrl": "https://basalt.ac", "apiKey": "mc_...", "deviceId": "<mac-name>"}'
echo "  3. System Settings → Notifications → Basalt Sampler → allow"
echo "  4. Login item: System Settings → General → Login Items → add $APP"
