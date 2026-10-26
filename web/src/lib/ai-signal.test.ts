// Assert-based tests for the AI-signal stage (bun test src/lib/ai-signal.test.ts).
// Fixtures from the study: BCW (Director of Ecommerce, headline self-labels AI —
// the pass case), Finemark (vendor with finemark.ai outbound — vendor-hint, not
// a fail), Koola (zero signal — fail), Wix (--wbu-color-ai-0 CSS trap).
import { test } from "bun:test";
import assert from "node:assert/strict";
import {
	AI_TOKEN,
	AI_PHRASES,
	aiHit,
	scoreRoster,
	pastMatches,
	scanSite,
	scoreAiSignal,
	humanizeAiSignalNote,
	mergeSearchHits,
	brandTokens,
	type AiMatch,
	type TierInput,
} from "./ai-signal";
import {
	prospeoCompanyRoster,
	_resetThrottle,
	_setMinInterval,
	type ProspeoPerson,
	type ProspeoRoster,
} from "./enrich-prospeo";

const person = (over: Partial<ProspeoPerson>): ProspeoPerson => ({
	name: "Brett Mathews",
	title: "Director of Ecommerce",
	headline: null,
	skills: [],
	historyTitles: [],
	linkedinUrl: null,
	...over,
});

const ros = (people: ProspeoPerson[], total = people.length, over: Partial<ProspeoRoster> = {}): ProspeoRoster => ({
	people,
	total,
	pagesPulled: 1,
	complete: true,
	...over,
});

const score = (over: Partial<TierInput>) =>
	scoreAiSignal({
		employeeMatches: [],
		pastMatches: [],
		siteEvidence: [],
		vendorHints: [],
		roster: ros([]),
		maxPages: 10,
		siteAttempted: true,
		...over,
	});

test("AI token is case-sensitive: AIR, said, Kai never match", () => {
	assert.equal(AI_TOKEN.test("AIR freight"), false);
	assert.equal(AI_TOKEN.test("He said"), false);
	assert.equal(AI_TOKEN.test("Kai"), false);
	assert.equal(aiHit("kai airport said"), false);
});

test("BCW-style headline 'AI & SEO Digital Optimization' matches", () => {
	assert.equal(aiHit("AI & SEO Digital Optimization"), true);
});

test("phrase terms match case-insensitively", () => {
	for (const t of ["we use Artificial Intelligence", "Machine Learning ops", "Try ChatGPT", "GitHub Copilot", "our GenAI stack", "gen ai tools", "AI-powered dispatch", "ai driven routing", "AI-enabled billing"])
		assert.equal(aiHit(t), true, t);
});

test("Wix CSS var trap: --wbu-color-ai-0 is not a hit after style-strip", () => {
	const html = `<html><head><style>:root{--wbu-color-ai-0:#123456}</style></head><body><p>We move freight.</p></body></html>`;
	const scan = scanSite(html, "https://example.com/", "Example Freight");
	assert.deepEqual(scan.evidence, []);
	const scanWithStyleLeak = scanSite(html.replace("<p>We move freight.</p>", "<p>We move freight</p>"), "https://example.com/", "Example Freight");
	assert.deepEqual(scanWithStyleLeak.evidence, []);
	// and the token regex alone can't fire on lowercase css
	assert.equal(AI_TOKEN.test("--wbu-color-ai-0"), false);
	assert.equal(AI_PHRASES.test("--wbu-color-ai-0"), false);
});

test("skills self-label passes (scoreRoster) with the skills named in evidence", () => {
	const m = scoreRoster([person({ title: "Ops Manager", skills: ["Artificial Intelligence", "ChatGPT", "Freight"] })]);
	assert.equal(m.length, 1);
	assert.equal(m[0].linkedinUrl, null);
	assert.equal(m[0].evidence.includes("skills: Artificial Intelligence, ChatGPT"), true, m[0].evidence);
});

test("past AI title never passes — it rides in the note as past-AI", () => {
	const p = person({ title: "Ops Manager", historyTitles: ["Machine Learning Analyst", "Driver"] });
	assert.equal(scoreRoster([p]).length, 0);
	const past = pastMatches([p]);
	assert.equal(past.length, 1);
	assert.equal(past[0].evidence, `Brett Mathews (was "Machine Learning Analyst")`);
	const r = score({ roster: ros([p]), pastMatches: past, siteAttempted: false });
	assert.equal(r.verdict, "fail");
	assert.equal(r.tier, 3);
	assert.equal(r.note.includes(`past-AI: Brett Mathews (was "Machine Learning Analyst")`), true, r.note);
	// a current hit outranks it: same person with a current AI title isn't past-only
	const cur = person({ title: "Ops Manager", headline: "AI & SEO", historyTitles: ["ML Analyst"] });
	assert.equal(pastMatches([cur]).length, 0);
	assert.equal(scoreRoster([cur]).length, 1);
});

test("humanizeAiSignalNote decodes each tier and passes other notes through", () => {
	assert.equal(humanizeAiSignalNote("tier1|Brett — Director (headline: AI); site: ai"), "PASS (high): employee self-labels AI + site corroborates");
	assert.equal(humanizeAiSignalNote("tier2|Brett — Director (headline: AI)"), "PASS (some): employee self-labels AI");
	assert.equal(humanizeAiSignalNote("tier2|site: ai,chatgpt"), "FAIL — site-only evidence, worth a manual look");
	assert.equal(humanizeAiSignalNote("tier3|roster 12, zero AI signal"), "FAIL — visible, zero AI signal");
	assert.equal(humanizeAiSignalNote("tier4|roster 0, zero AI signal, no site"), "FAIL — no site, no roster (barely have a phone)");
	// suffixes
	assert.equal(
		humanizeAiSignalNote(`tier3|past-AI: B (was "Machine Learning Analyst"); roster: 60, scanned 4 of 10 pages`),
		`FAIL — visible, zero AI signal · scanned 4 of 10 pages · past-AI experience (note only)`,
	);
	// passthrough for other stages' notes
	assert.equal(humanizeAiSignalNote("$12–$30M (Prospeo)"), null);
	assert.equal(humanizeAiSignalNote(""), null);
});

test("site-only evidence never passes (manual rescue note)", () => {
	const r = score({ siteEvidence: ["ai", "machine learning"], roster: ros([], 12) });
	assert.equal(r.verdict, "fail");
	assert.equal(r.aiInterest, null);
	assert.equal(r.note.startsWith("tier2|"), true);
});

test("privacy and widget evidence are weak: they corroborate nothing", () => {
	const r = score({ siteEvidence: ["POLICY:ai", "widget:livechat"], roster: ros([], 8) });
	assert.equal(r.verdict, "fail");
	// …and they cannot upgrade an employee match to high
	const m: AiMatch = { name: "Brett Mathews", title: "Director of Ecommerce", linkedinUrl: null, evidence: "Brett — Director (headline: AI & SEO)" };
	const r2 = score({ employeeMatches: [m], siteEvidence: ["POLICY:ai", "widget:livechat"], roster: ros([], 8) });
	assert.equal(r2.verdict, "pass");
	assert.equal(r2.aiInterest, "some");
	assert.equal(r2.tier, 2);
});

test("Finemark fixture: employee match + finemark.ai outbound → pass with vendor-hint in the note, not a fail", () => {
	// variant A: anchor text "Finemark AI" is strong copy → tier1/high, hint rides along
	const scan = scanSite(`<a href="https://finemark.ai/">Finemark AI</a>`, "https://finemarkgroup.com/", "FINEMARK INC");
	assert.deepEqual(scan.vendorHints, ["finemark.ai", "finemark ai (marketing)"]);
	assert.deepEqual(scan.evidence, ["ai"]);
	const privacy = scanSite("<p>We use artificial intelligence to match loads.</p>", "https://finemarkgroup.com/privacy", "FINEMARK INC");
	assert.deepEqual(privacy.evidence, ["POLICY:artificial intelligence"]);
	const matches = scoreRoster([person({ headline: "AI & SEO Digital Optimization" })]);
	assert.equal(matches.length, 1);
	const rA = score({
		employeeMatches: matches,
		siteEvidence: [...scan.evidence, ...privacy.evidence],
		vendorHints: scan.vendorHints,
		roster: ros([person({ headline: "AI & SEO Digital Optimization" })], 3),
	});
	assert.equal(rA.verdict, "pass");
	assert.equal(rA.tier, 1);
	assert.equal(rA.aiInterest, "high");
	assert.equal(rA.note.includes("vendor-hint: finemark.ai"), true);

	// variant B: .ai link with neutral anchor — only weak POLICY evidence →
	// still passes on the employee match, still carries the vendor-hint
	const scanB = scanSite(`<a href="https://finemark.ai/track">Track loads</a>`, "https://finemarkgroup.com/", "FINEMARK INC");
	assert.deepEqual(scanB.vendorHints, ["finemark.ai"]);
	assert.deepEqual(scanB.evidence, []);
	const rB = score({
		employeeMatches: matches,
		siteEvidence: [...scanB.evidence, ...privacy.evidence],
		vendorHints: scanB.vendorHints,
		roster: ros([person({ headline: "AI & SEO Digital Optimization" })], 3),
	});
	assert.equal(rB.verdict, "pass");
	assert.equal(rB.tier, 2);
	assert.equal(rB.aiInterest, "some");
	assert.equal(rB.note.includes("vendor-hint: finemark.ai"), true);
	assert.equal(rB.note.startsWith("tier2|"), true);
});

test("directory vendor embeds (glydr.ai) are ignored, not vendor-hints", () => {
	const scan = scanSite(`<a href="https://glydr.ai/">Powered by Glydr</a>`, "https://bluestone transport.com/".replace(/ /g, ""), "BLUESTONE TRANSPORT");
	assert.deepEqual(scan.vendorHints, []);
	assert.deepEqual(scan.evidence, []);
});

test("BCW fixture: employee match, no site evidence → pass, tier2, some, no vendor-hint", () => {
	const matches = scoreRoster([
		person({ headline: "AI & SEO Digital Optimization" }),
		person({ name: "Offshore Dev", title: "Developer", headline: "full-stack dev" }),
	]);
	const r = score({ employeeMatches: matches, roster: ros(matches.map((m) => person({ name: m.name })), 9) });
	assert.equal(r.verdict, "pass");
	assert.equal(r.aiInterest, "some");
	assert.equal(r.note.includes("vendor-hint"), false);
	assert.equal(r.note.includes("Brett Mathews — Director of Ecommerce (headline: AI & SEO Digital Optimization)"), true);
});

test("employee + strong site → tier1, high", () => {
	const r = score({
		employeeMatches: [{ name: "B", title: "Ops", linkedinUrl: null, evidence: "B — Ops (headline: AI-powered dispatch)" }],
		siteEvidence: ["ai-powered", "widget:livechat"],
		roster: ros([], 4),
	});
	assert.equal(r.tier, 1);
	assert.equal(r.aiInterest, "high");
});

test("Koola fixture: visible, zero signal → tier3 fail; invisible → tier4 fail", () => {
	const t3 = score({ roster: ros([], 6) });
	assert.equal(t3.verdict, "fail");
	assert.equal(t3.note.startsWith("tier3|"), true);
	const t4 = score({ roster: ros([]), siteAttempted: false });
	assert.equal(t4.verdict, "fail");
	assert.equal(t4.note.startsWith("tier4|"), true);
});

test("complete roster carries no pagination caveat; partial one names pages scanned", () => {
	const done = score({ roster: ros([], 60) });
	assert.equal(done.note.includes("scanned"), false, done.note);
	const partial = score({ roster: ros([], 60, { complete: false, pagesPulled: 4 }) });
	assert.equal(partial.note.includes("roster: 60, scanned 4 of 10 pages"), true, partial.note);
	// maxPages is runtime-tunable and shows up as the cap
	const tuned = score({ roster: ros([], 60, { complete: false, pagesPulled: 2 }), maxPages: 3 });
	assert.equal(tuned.note.includes("roster: 60, scanned 2 of 3 pages"), true, tuned.note);
});

test("notes stay ≤300 chars even with a fat evidence list", () => {
	const r = score({
		employeeMatches: Array.from({ length: 3 }, (_, i) => ({ name: `Person ${i} With A Long Name`, title: "Senior Vice President of Operations and Logistics".repeat(2), linkedinUrl: null, evidence: `Person ${i} — ${"very long evidence ".repeat(20)}` })),
		pastMatches: Array.from({ length: 3 }, (_, i) => ({ name: `Was ${i}`, title: null, linkedinUrl: null, evidence: `Was ${i} (was "Machine Learning Analyst")` })),
		siteEvidence: ["ai", "machine learning", "artificial intelligence", "chatgpt", "copilot"],
		vendorHints: ["vendor.ai", "brand ai (marketing)", "our AI platform"],
		roster: ros([], 30, { complete: false, pagesPulled: 1 }),
	});
	assert.equal(r.note.length <= 300, true, `note was ${r.note.length}`);
});

test("brandTokens drop generic freight words", () => {
	assert.deepEqual(brandTokens("FINEMARK INC"), ["finemark"]);
	assert.deepEqual(brandTokens("Alpha Logistics LLC"), ["alpha"]);
});

test("roster fetch: NO_RESULTS → empty but complete; person mapping carries skills + linkedin", async () => {
	process.env.PROSPEO_API_KEY ??= "test-key";
	const realFetch = globalThis.fetch;
	try {
		_setMinInterval(0);
		_resetThrottle();
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: true, error_code: "NO_RESULTS" }), { status: 400 })) as unknown as typeof fetch;
		assert.deepEqual(await prospeoCompanyRoster({ name: "KOOLA" }), { people: [], total: 0, pagesPulled: 0, complete: true });

		_resetThrottle();
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					error: false,
					results: [
						{
							person: {
								full_name: "Eoghan Mccabe",
								current_job_title: "Director of Ecommerce",
								headline: "AI & SEO at BCW",
								skills: ["Artificial Intelligence", "SEO"],
								linkedin_url: "https://www.linkedin.com/in/eoghanmccabe",
								job_history: [
									{ title: "Director of Ecommerce", current: true },
									{ title: "SEO Manager", current: false },
									{ title: "SEO Analyst", current: false },
									{ title: "SEO Manager", current: false },
								],
							},
						},
					],
					pagination: { total_count: 271 },
				}),
				{ status: 200 },
			)) as unknown as typeof fetch;
		const roster = await prospeoCompanyRoster({ companyId: "cccc7c7da6116a8830a07100", domain: "bcw.com", name: "BCW" });
		assert.equal(roster.total, 271);
		assert.equal(roster.pagesPulled, 1);
		assert.equal(roster.complete, true);
		assert.deepEqual(roster.people, [
			{
				name: "Eoghan Mccabe",
				title: "Director of Ecommerce",
				headline: "AI & SEO at BCW",
				skills: ["Artificial Intelligence", "SEO"],
				linkedinUrl: "https://www.linkedin.com/in/eoghanmccabe",
				historyTitles: ["SEO Manager", "SEO Analyst"],
			},
		]);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("roster fetch paginates to total_page, merges people, stamps complete", async () => {
	process.env.PROSPEO_API_KEY ??= "test-key";
	const realFetch = globalThis.fetch;
	try {
		_setMinInterval(0);
		_resetThrottle();
		const pagesSeen: number[] = [];
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			pagesSeen.push((JSON.parse(String(init?.body)) as { page: number }).page);
			const n = pagesSeen.length;
			const mk = (prefix: string, count: number) =>
				Array.from({ length: count }, (_, i) => ({ person: { full_name: `${prefix}${i}` } }));
			return new Response(
				JSON.stringify({
					error: false,
					results: n === 1 ? mk("P", 25) : mk("Q", 5),
					pagination: { total_page: 2, total_count: 30 },
				}),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;
		const roster = await prospeoCompanyRoster({ name: "BIG CO" });
		assert.deepEqual(pagesSeen, [1, 2]);
		assert.equal(roster.people.length, 30);
		assert.equal(roster.total, 30);
		assert.equal(roster.pagesPulled, 2);
		assert.equal(roster.complete, true);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("roster fetch stops at maxPages (partial); mid-run failure keeps paid pages", async () => {
	process.env.PROSPEO_API_KEY ??= "test-key";
	const realFetch = globalThis.fetch;
	try {
		_setMinInterval(0);
		_resetThrottle();
		globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
			const page = (JSON.parse(String(init?.body)) as { page: number }).page;
			return new Response(
				JSON.stringify({ error: false, results: Array.from({ length: 25 }, (_, i) => ({ person: { full_name: `P${page}-${i}` } })), pagination: { total_page: 5, total_count: 125 } }),
				{ status: 200 },
			);
		}) as unknown as typeof fetch;
		const capped = await prospeoCompanyRoster({ name: "HUGE CO" }, { maxPages: 2 });
		assert.equal(capped.people.length, 50);
		assert.equal(capped.pagesPulled, 2);
		assert.equal(capped.complete, false);

		_resetThrottle();
		let calls = 0;
		globalThis.fetch = (async () => {
			calls++;
			if (calls === 1)
				return new Response(
					JSON.stringify({ error: false, results: Array.from({ length: 25 }, (_, i) => ({ person: { full_name: `K${i}` } })), pagination: { total_page: 4, total_count: 100 } }),
					{ status: 200 },
				);
			return new Response("kaboom", { status: 500 });
		}) as unknown as typeof fetch;
		const partial = await prospeoCompanyRoster({ name: "QUOTA DEATH" });
		assert.equal(partial.people.length, 25);
		assert.equal(partial.pagesPulled, 1);
		assert.equal(partial.complete, false);
	} finally {
		globalThis.fetch = realFetch;
	}
});

test("mergeSearchHits unions search-time evidence under the strict rule", () => {
	const rosterMatch = { name: "Shannon Gacke", title: "Director", linkedinUrl: null, evidence: "roster hit" };
	const merged = mergeSearchHits([rosterMatch], [
		{ name: "Patrick Hedrick", title: "AI Lead" }, // search hit → merged
		{ name: "Patrick Hedrick", title: "AI Lead" }, // dup → skipped
		{ name: "Justin Smith", title: "Sales Manager" }, // no AI self-label → skipped
		{ name: "Brad Smith", title: "VP of Machine Learning" }, // phrase hit → merged
	]);
	assert.equal(merged.length, 3); // roster match + 2 search hits, cap 3
	assert.ok(merged[1].evidence.includes("search:"));
	assert.equal(merged[1].name, "Patrick Hedrick");
});
