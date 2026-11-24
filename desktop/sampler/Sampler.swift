// Basalt Sampler (ASPTR-227) — the desktop activity signal.
//
// A menubar app that samples the foreground app + window title every 30s,
// splits on idle (>2 min) and lock/sleep, batches samples to the basalt
// server, and asks "which client?" via notification when the server can't
// attribute a block. Answers train learned matchers, so prompts decay.
//
// Build: bash build.sh  → BasaltSampler.app
// Config: ~/.config/basalt/sampler.json
//   { baseUrl, apiKey, deviceId, calendarIcalUrl?, webDir?, bunPath? }
// Runs EVERYTHING: 30s sampling, the pi-usage-scan + calendar collector
// (in-process timer, no launchd/cron), and the prompt loop. Privacy: only
// (timestamp, app name, ≤200-char title, idle seconds) leave this machine,
// and only to your own basalt server. No screenshots, no OCR, no keystrokes.
import AppKit
import CoreGraphics
import Foundation
import UserNotifications

let configPath = NSString(string: "~/.config/basalt/sampler.json").expandingTildeInPath
let queuePath = NSString(string: "~/.local/share/basalt/sampler-queue.jsonl").expandingTildeInPath
let sampleInterval: TimeInterval = 30
let uploadBatchesOf = 4 // 4 × 30s = one POST every 2 min
let promptCooldown: TimeInterval = 15 * 60
let collectorInterval: TimeInterval = 600 // 10 min — lives in the app, no launchd
let logPath = NSString(string: "~/.local/share/basalt/collector.log").expandingTildeInPath

struct SamplerConfig: Codable {
	var baseUrl: String
	var apiKey: String
	var deviceId: String
	// calendar: Google Calendar "Secret address in iCal format" (private)
	var calendarIcalUrl: String?
	// collector scripts live in the main basalt checkout, not this worktree
	var webDir: String?
	var bunPath: String?
}

func loadConfig() -> SamplerConfig? {
	guard let data = FileManager.default.contents(atPath: configPath) else { return nil }
	return try? JSONDecoder().decode(SamplerConfig.self, from: data)
}

// kCGAnyInputEventType — seconds since ANY HID event, mouse or keyboard.
func idleSeconds() -> Double? {
	guard let anyType = CGEventType(rawValue: ~0) else { return nil }
	return CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: anyType)
}

func frontmostAppAndTitle() -> (String?, String?) {
	guard let app = NSWorkspace.shared.frontmostApplication else { return (nil, nil) }
	var title: String?
	if let appRef = AXUIElementCreateApplication(app.processIdentifier) as AXUIElement? {
		var window: CFTypeRef?
		if AXUIElementCopyAttributeValue(appRef, kAXFocusedWindowAttribute as CFString, &window) == .success,
		   let win = window as! AXUIElement?
		{
			var value: CFTypeRef?
			if AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &value) == .success {
				title = value as? String
			}
		}
	}
	return (app.localizedName, title)
}

final class Sampler: NSObject, NSApplicationDelegate {
	var config: SamplerConfig!
	var statusItem: NSStatusItem!
	var timer: Timer?
	var paused = false
	var locked = false
	var samples: [[String: Any]] = []
	var lastPromptAt: Date?
	var pendingPrompt: [String: Any]? // eventId → candidates, while a notification is out

	func applicationDidFinishLaunching(_ n: Notification) {
		config = loadConfig()
		statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
		rebuildMenu()

		if !AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary) {
			statusItem.button?.title = "⚠︎"
		}

		let dist = DistributedNotificationCenter.default()
		dist.addObserver(self, selector: #selector(screenLocked), name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)
		dist.addObserver(self, selector: #selector(screenUnlocked), name: NSNotification.Name("com.apple.screenIsUnlocked"), object: nil)
		NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(slept), name: NSWorkspace.willSleepNotification, object: nil)

		UNUserNotificationCenter.current().delegate = self
		UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }

		resume()
		startCollector()
	}

	func rebuildMenu() {
		let menu = NSMenu()
		menu.addItem(withTitle: paused ? "Resume sampling" : "Pause sampling", action: #selector(togglePause), keyEquivalent: "")
		let collectorItem = NSMenuItem(title: "Collector: \(collectorStatus)", action: nil, keyEquivalent: "")
		collectorItem.isEnabled = false
		menu.addItem(collectorItem)
		menu.addItem(NSMenuItem.separator())
		menu.addItem(withTitle: "Run collector now", action: #selector(runCollectorNow), keyEquivalent: "")
		menu.addItem(withTitle: "Open Activity dashboard", action: #selector(openDashboard), keyEquivalent: "")
		menu.addItem(withTitle: "Open Config", action: #selector(openConfig), keyEquivalent: "")
		menu.addItem(withTitle: "Open Log", action: #selector(openLog), keyEquivalent: "")
		menu.addItem(NSMenuItem.separator())
		menu.addItem(withTitle: "Test prompt", action: #selector(testPrompt), keyEquivalent: "")
		menu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
		statusItem.menu = menu
		statusItem.button?.title = paused ? "◼" : "◉"
	}

	func resume() {
		timer?.invalidate()
		timer = Timer.scheduledTimer(withTimeInterval: sampleInterval, repeats: true) { [weak self] _ in self?.tick() }
	}

	@objc func togglePause() {
		paused.toggle()
		UserDefaults.standard.set(paused, forKey: "paused")
		rebuildMenu()
	}

	@objc func screenLocked() { locked = true }
	@objc func screenUnlocked() { locked = false }
	@objc func slept() { locked = true } // cleared by the next unlocked/active tick

	@objc func testPrompt() { showPrompt(appName: "Test", minutes: 12, eventId: nil) }

	func tick() {
		guard !paused, config != nil else { return }
		let (app, title) = frontmostAppAndTitle()
		let idle = idleSeconds() ?? 0
		samples.append([
			"at": ISO8601DateFormatter().string(from: Date()),
			"appName": app ?? NSNull(),
			"title": title ?? NSNull(),
			"idleSec": idle,
			"locked": locked,
		])
		if samples.count >= uploadBatchesOf { flush() }
	}

	func flush() {
		guard !samples.isEmpty else { return }
		let batchId = UUID().uuidString
		let body: [String: Any] = ["deviceId": config.deviceId, "batchId": batchId, "samples": samples]
		post(path: "/api/activity/samples", body: body) { [weak self] data in
			guard let self else { return }
			self.samples.removeAll()
			if let data, let ack = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
			   let prompts = ack["prompts"] as? [[String: Any]]
			{
				self.handlePrompts(prompts)
			}
		}
		// on failure, flush() re-queues via the post error path
	}

	func post(path: String, body: [String: Any], done: @escaping (Data?) -> Void) {
		var req = URLRequest(url: URL(string: config.baseUrl + path)!)
		req.httpMethod = "POST"
		req.setValue("Bearer \(config.apiKey)", forHTTPHeaderField: "Authorization")
		req.setValue("application/json", forHTTPHeaderField: "Content-Type")
		req.httpBody = try? JSONSerialization.data(withJSONObject: body)

		// machine callers retry with a local queue; samples upsert by batchId,
		// prompt answers by eventId, so replays are safe.
		let fail: (Error?) -> Void = { [weak self] _ in
			self?.queueForRetry(body)
			done(nil)
		}
		let task = URLSession.shared.dataTask(with: req) { data, resp, err in
			if let err { return fail(err) }
			guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode), let data else { return fail(nil) }
			done(data)
		}
		task.resume()
	}

	func queueForRetry(_ body: [String: Any]) {
		// only samples are queueable; prompt answers are dropped (the block
		// stays unassigned and the review screen catches it)
		guard body["samples"] != nil else { return }
		if let data = try? JSONSerialization.data(withJSONObject: body),
		   let handle = FileHandle(forWritingAtPath: queuePath) ?? {
			FileManager.default.createFile(atPath: queuePath, contents: nil)
			return FileHandle(forWritingAtPath: queuePath)
		}() {
			handle.seekToEndOfFile()
			handle.write(data)
			handle.write(Data("\n".utf8))
			try? handle.close()
		}
	}

	func replayQueue() {
		guard let lines = try? String(contentsOfFile: queuePath, encoding: .utf8) else { return }
		var kept = ""
		for line in lines.split(separator: "\n") {
			guard let data = line.data(using: .utf8),
			      let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
			var succeeded = false
			let sem = DispatchSemaphore(value: 0)
			post(path: "/api/activity/samples", body: body) { _ in sem.signal(); succeeded = true }
			_ = sem.wait(timeout: .now() + 30)
			if !succeeded { kept += line + "\n" }
		}
		try? kept.write(toFile: queuePath, atomically: true, encoding: .utf8)
	}

	// MARK: collector — the scheduled work launchd used to do, in-process

	var collectorTimer: Timer?
	var collectorStatus = "waiting"

	func startCollector() {
		replayQueue() // samples queued while offline last session
		collectorTimer = Timer.scheduledTimer(withTimeInterval: collectorInterval, repeats: true) { [weak self] _ in self?.runCollector() }
		runCollector() // first pass at launch
	}

	@objc func runCollectorNow() { runCollector() }

	/// Runs the two TS collectors via bun (they stay the single source of
	/// truth for scan/calendar logic). Runs even when sampling is paused —
	/// pause is about desktop sampling only.
	func runCollector() {
		guard config != nil else { return }
		let webDir = NSString(string: config.webDir ?? "~/GitHub/basalt/web").expandingTildeInPath
		let scripts = ["pi-usage-scan.ts", "collect-calendar.ts"]
		let key = config.apiKey
		let base = config.baseUrl
		let cal = config.calendarIcalUrl ?? ""
		let bun = config.bunPath ?? "/usr/bin/env"
		DispatchQueue.global(qos: .utility).async { [weak self] in
			var report = ""
			var allOk = true
			for script in scripts {
				let out = Pipe(), err = Pipe()
				let p = Process()
				p.executableURL = URL(fileURLWithPath: bun)
				p.arguments = bun == "/usr/bin/env" ? ["bun", "\(webDir)/scripts/activity/\(script)"] : ["\(webDir)/scripts/activity/\(script)"]
				p.environment = [
					"HOME": NSHomeDirectory(),
					"PATH": "/usr/bin:/bin:/usr/sbin:/usr/local/bin",
					"ACTIVITY_API_KEY": key,
					"ACTIVITY_BASE_URL": base,
					"ACTIVITY_CAL_URL": cal,
				]
				p.standardOutput = out
				p.standardError = err
				do { try p.run() } catch {
					report += "\(script): cannot launch bun — \(error.localizedDescription)\n"
					allOk = false
					continue
				}
				// watchdog: a hung network call must not stop the next tick
				DispatchQueue.main.asyncAfter(deadline: .now() + 540) { if p.isRunning { p.terminate() } }
				let outData = out.fileHandleForReading.readDataToEndOfFile()
				let errData = err.fileHandleForReading.readDataToEndOfFile()
				p.waitUntilExit()
				let text = String(data: outData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
				let errs = String(data: errData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
				report += "\(script): exit \(p.terminationStatus)\(text.isEmpty ? "" : " — \(text)")\(errs.isEmpty ? "" : " | \(errs)")\n"
				if p.terminationStatus != 0 { allOk = false }
			}
			DispatchQueue.main.async {
				guard let self else { return }
				self.collectorStatus = (allOk ? "✓ " : "✗ ") + DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .short)
				self.appendCollectorLog(report)
				self.rebuildMenu()
			}
		}
	}

	func appendCollectorLog(_ text: String) {
		if !FileManager.default.fileExists(atPath: logPath) { FileManager.default.createFile(atPath: logPath, contents: nil) }
		if let h = FileHandle(forWritingAtPath: logPath) {
			h.seekToEndOfFile()
			h.write(Data("\(Date()):\n\(text)\n".utf8))
			try? h.close()
		}
	}

	@objc func openDashboard() { NSWorkspace.shared.open(URL(string: config.baseUrl + "/admin/activity")!) }
	@objc func openConfig() { NSWorkspace.shared.open(URL(fileURLWithPath: configPath)) }
	@objc func openLog() { NSWorkspace.shared.open(URL(fileURLWithPath: logPath)) }

	// MARK: prompts

	func handlePrompts(_ prompts: [[String: Any]]) {
		guard let prompt = prompts.first else { return }
		if let last = lastPromptAt, Date().timeIntervalSince(last) < promptCooldown { return }
		if dndActive() { return }
		lastPromptAt = Date()
		let minutes = (prompt["minutes"] as? Int) ?? 0
		showPrompt(
			appName: prompt["appName"] as? String,
			minutes: minutes,
			eventId: prompt["eventId"] as? String,
			candidates: prompt["candidates"] as? [[String: Any]]
		)
	}

	func showPrompt(appName: String?, minutes: Int, eventId: String?, candidates: [[String: Any]]? = nil) {
		pendingPrompt = eventId.map { ["eventId": $0, "candidates": candidates ?? []] }
		let names: [String]
		if let candidates {
			names = candidates.compactMap { $0["name"] as? String }
		} else {
			names = ["Basalt", "CDL", "BCW"]
		}
		let actions = (0..<min(3, names.count)).map {
			UNNotificationAction(identifier: "candidate.\($0)", title: names[$0], options: [])
		} + [UNNotificationAction(identifier: "none", title: "None of these", options: [])]
		let category = UNNotificationCategory(identifier: "activity.assign", actions: actions, intentIdentifiers: [], options: [])
		UNUserNotificationCenter.current().setNotificationCategories([category])

		let content = UNMutableNotificationContent()
		content.title = "Which client was this?"
		content.body = "\(appName ?? "unknown app") · ~\(minutes) min — pick a project or None"
		content.categoryIdentifier = "activity.assign"
		content.userInfo = ["eventId": eventId ?? ""]
		let req = UNNotificationRequest(identifier: "activity-\(UUID().uuidString)", content: content, trigger: nil)
		UNUserNotificationCenter.current().add(req)
	}

	func dndActive() -> Bool {
		let out = Process()
		out.executableURL = URL(fileURLWithPath: "/usr/bin/defaults")
		out.arguments = ["read", "com.apple.notificationcenterui", "doNotDisturb"]
		let pipe = Pipe()
		out.standardOutput = pipe
		try? out.run()
		out.waitUntilExit()
		guard out.terminationStatus == 0, let s = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) else { return false }
		return s == "1"
	}
}

extension Sampler: UNUserNotificationCenterDelegate {
	func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
		defer { completionHandler() }
		guard response.actionIdentifier != UNNotificationDismissActionIdentifier,
		      let info = pendingPrompt,
		      let eventId = info["eventId"] as? String, !eventId.isEmpty
		else { pendingPrompt = nil; return }
		let candidates = info["candidates"] as? [[String: Any]] ?? []
		var body: [String: Any] = ["eventId": eventId, "remember": true]
		if response.actionIdentifier == "none" {
			body["projectId"] = NSNull()
		} else if let idx = Int(response.actionIdentifier.split(separator: ".").last ?? ""),
		          idx < candidates.count,
		          let projectId = candidates[idx]["id"] as? String
		{
			body["projectId"] = projectId
		} else {
			pendingPrompt = nil
			return
		}
		pendingPrompt = nil
		post(path: "/api/activity/prompt-answers", body: body) { _ in }
	}

	func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
		completionHandler([.banner, .sound])
	}
}

let app = NSApplication.shared
let delegate = Sampler()
app.delegate = delegate
app.setActivationPolicy(.prohibited) // menubar-only
app.run()
