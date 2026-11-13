// Fetch relay for the content script. Two reasons it lives here and not in
// content.js: MV3 content scripts are subject to the page's CORS (host
// permissions don't exempt them), and the mc_ key must never enter the
// LinkedIn page context. The popup (an extension page) fetches directly.
const DEFAULTS = { dashboardUrl: "https://basalt.ac", apiKey: "" };

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
	(async () => {
		const { dashboardUrl, apiKey } = await chrome.storage.sync.get(DEFAULTS);
		if (!apiKey) return sendResponse({ ok: false, error: "No mc_ key saved — open the MadCactus popup once." });
		try {
			const r = await fetch(`${dashboardUrl.replace(/\/+$/, "")}${msg.path}`, {
				method: msg.method ?? "POST",
				headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
				body: msg.body ? JSON.stringify(msg.body) : undefined,
			});
			const data = await r.json().catch(() => ({}));
			sendResponse(r.ok ? { ok: true, data } : { ok: false, error: data.error ?? `HTTP ${r.status}` });
		} catch {
			sendResponse({ ok: false, error: `Can't reach ${dashboardUrl}` });
		}
	})();
	return true; // keep the channel open for the async sendResponse
});
