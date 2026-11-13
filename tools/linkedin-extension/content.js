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

	// 2026 LinkedIn top card (verified against the live DOM): class names are
	// hashed garbage and there is no <h1> — the stable shape is
	// <div aria-label="<name>"><p><name></p><div><p><headline></p></div></div>
	// i.e. the name div's aria-label equals its first <p>'s text. That self-
	// validating match is the anchor; headline "Title at Company" gives the company.
	function topCard() {
		for (const div of document.querySelectorAll("div[aria-label]")) {
			const p = div.querySelector("p");
			if (p && clean(p.textContent) === clean(div.getAttribute("aria-label") ?? "")) return div;
		}
		return null;
	}

	function scrapeName() {
		return topCard()?.getAttribute("aria-label") ?? null;
	}

	function scrapeCompany() {
		const card = topCard();
		const headline = card ? clean(card.querySelectorAll("p")[1]?.textContent ?? "") : "";
		if (headline) {
			const m = headline.match(/(?:\bat\b|@|·)\s*([^@·|]+)/i);
			if (m && clean(m[1]).length > 1) return clean(m[1]);
		}
		// older DOMs: right-panel current position / headline div
		for (const sel of [".pv-text-details__right-panel-item", ".text-body-medium.break-words"]) {
			const t = clean(text(sel));
			if (t && t.length <= 160) {
				const m = t.match(/(?:\bat\b|@|·)\s*([^@·|]+)/i);
				if (m && clean(m[1]).length > 1) return clean(m[1]);
			}
		}
		const exp = document.querySelectorAll("section[aria-label*='xperience' i] .pvs-entity strong");
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
