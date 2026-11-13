// Floating "＋ MadCactus" on LinkedIn profile pages. Scrapes person + current
// company and posts it to /api/outreach/candidates as a stage=candidate row
// (fit review still happens by hand at /admin/outreach). LinkedIn reshuffles
// its DOM regularly; when nothing readable matches, the button disables with
// a tooltip instead of posting a junk row.
(() => {
	const btn = document.createElement("button");
	btn.className = "mc-fab";
	btn.textContent = "＋ MadCactus";
	btn.title = "Add this person to the outreach funnel";
	document.body.appendChild(btn);

	const clean = (s) => s.replace(/\s+/g, " ").trim();
	const text = (sel) => (document.querySelector(sel)?.textContent ?? "");

	function scrapeName() {
		return clean(text("main h1")) || null;
	}

	// Best-effort current company, most-stable anchor first:
	// 1. top-card "current position" right panel — "Title at Company"
	// 2. headline — "VP Ops at Acme Corp"
	// 3. first experience entry's bold company line
	function scrapeCompany() {
		const panel = clean(text(".pv-text-details__right-panel-item, .pv-text-details__right-panel"));
		const headline = clean(text(".text-body-medium.break-words"));
		for (const t of [panel, headline]) {
			if (!t || t.length > 160) continue;
			const m = t.match(/(?:\bat\b|@|·)\s*([^@·|]+)/i);
			if (m && clean(m[1]).length > 1) return clean(m[1]);
		}
		const exp = document.querySelectorAll("section[aria-label*='xperience' i] .pvs-entity strong, #experience strong");
		return exp.length ? clean(exp[0].textContent) : null;
	}

	// LinkedIn is a SPA: keep the button valid as the user moves between
	// profiles (and hide it off-profile) without waiting for a reload.
	function refresh() {
		btn.hidden = !location.pathname.startsWith("/in/");
		const company = scrapeCompany();
		btn.disabled = !company;
		btn.title = company ? "Add this person to the outreach funnel" : "Couldn't read a company on this profile — add it at /admin/outreach";
	}
	setInterval(refresh, 2000);
	refresh();

	btn.addEventListener("click", async () => {
		const company = scrapeCompany();
		if (!company) return refresh();
		btn.disabled = true;
		btn.textContent = "…";
		const res = await chrome.runtime.sendMessage({
			path: "/api/outreach/candidates",
			body: { candidates: [{ company, contactName: scrapeName(), profileUrl: location.href.split("?")[0] }] },
		});
		if (res?.ok) {
			const { created, skipped } = res.data;
			btn.textContent = skipped > 0 && created === 0 ? "✓ already in funnel" : "✓ added";
			btn.classList.add("mc-ok");
		} else {
			btn.textContent = `✗ ${res?.error ?? "failed"}`;
			btn.classList.add("mc-err");
		}
		setTimeout(() => {
			btn.textContent = "＋ MadCactus";
			btn.classList.remove("mc-ok", "mc-err");
			refresh();
		}, 2500);
	});
})();
