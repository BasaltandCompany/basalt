// Popup: settings row (dashboard URL + mc_ key, paste-once into chrome.storage.sync)
// and today's approved connect list. "Connected ✓" POSTs /invited {ids} which
// flips the row to proposed with a +3-day acceptance check; the server caps
// 20/run and 100/wk and we surface both in the header.
const DEFAULTS = { dashboardUrl: "https://basalt.ac", apiKey: "" };
const $ = (id) => document.getElementById(id);

async function settings() {
	return chrome.storage.sync.get(DEFAULTS);
}

async function api(method, path, body) {
	const { dashboardUrl, apiKey } = await settings();
	if (!apiKey) return { ok: false, error: "no-key" };
	try {
		const r = await fetch(`${dashboardUrl.replace(/\/+$/, "")}${path}`, {
			method,
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
			body: body ? JSON.stringify(body) : undefined,
		});
		const data = await r.json().catch(() => ({}));
		return r.ok ? { ok: true, data } : { ok: false, error: data.error ?? `HTTP ${r.status}` };
	} catch {
		return { ok: false, error: `Can't reach ${dashboardUrl}` };
	}
}

// notes hold "li: <url>" (or li-owner:) — surface it as the profile link
const profileUrl = (notes) => notes?.match(/^li[-\w]*:\s*(\S+)/m)?.[1] ?? null;

async function render() {
	const { dashboardUrl, apiKey } = await settings();
	$("url").value = dashboardUrl;
	$("key").placeholder = apiKey ? "key saved — paste to replace" : "mc_ admin key";
	const list = $("list");
	if (!apiKey) {
		list.innerHTML = '<div class="msg">Paste an admin <b>mc_</b> key above (once) — then the approved connect list appears here.</div>';
		$("cap").textContent = "";
		return;
	}
	const res = await api("GET", "/api/outreach/invite-queue");
	if (!res.ok) {
		list.innerHTML = `<div class="msg err">${res.error === "no-key" ? "Paste a key above." : res.error}</div>`;
		$("cap").textContent = "";
		return;
	}
	const { queue, cap, invitedLast7Days } = res.data;
	$("cap").textContent = `${cap} left today · ${invitedLast7Days}/100 this week`;
	$("cap").className = cap === 0 ? "cap zero" : "cap";
	if (!queue.length) {
		list.innerHTML = '<div class="msg">Queue empty — approve fit on more rows at /admin/outreach.</div>';
		return;
	}
	list.replaceChildren(
		...queue.map((row) => {
			const el = document.createElement("div");
			el.className = "row";
			const who = document.createElement("div");
			who.style.flex = "1";
			const name = document.createElement("b");
			name.textContent = `${row.contactName ?? "—"} @ ${row.company}`;
			who.appendChild(name);
			const url = profileUrl(row.notes);
			if (url) {
				const a = document.createElement("a");
				a.href = url;
				a.target = "_blank";
				a.textContent = "profile ↗";
				who.appendChild(a);
			}
			const done = document.createElement("button");
			done.className = "done";
			done.textContent = "Connected ✓";
			done.onclick = async () => {
				done.disabled = true;
				done.textContent = "…";
				const r = await api("POST", "/api/outreach/invited", { ids: [row.id] });
				if (r.ok) el.remove();
				else {
					done.disabled = false;
					done.textContent = "✗ retry";
				}
			};
			el.append(who, done);
			return el;
		}),
	);
}

$("save").onclick = async () => {
	const patch = { dashboardUrl: $("url").value.trim() || DEFAULTS.dashboardUrl };
	if ($("key").value.trim()) patch.apiKey = $("key").value.trim();
	await chrome.storage.sync.set(patch);
	$("key").value = "";
	render();
};
render();
