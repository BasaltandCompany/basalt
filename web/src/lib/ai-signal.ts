// AI-signal scoring — pure functions, no IO. The locked promotion rule (see
// ICP.md): an employee who self-labels AI on LinkedIn is the ONLY promotion
// signal, any role — a small technical team using AI is the good case, not a
// disqualifier. The website scan corroborates only (upgrades some→high); a
// vendor hint (brand-matched .ai product domain, AI-product marketing) is
// note-only intelligence and never changes a verdict.
import type { ProspeoPerson, ProspeoRoster } from "./enrich-prospeo";

// Case-sensitive token on purpose: "AIR", "said", "Kai" must never match.
// Every other term goes through the case-insensitive phrases regex.
export const AI_TOKEN = /\bAI\b/;
export const AI_PHRASES =
	/\b(artificial intelligence|machine learning|chatgpt|copilot|gen[\s-]?ai|AI[\s-]?(?:powered|driven|enabled))\b/i;

export function aiHit(text: string): boolean {
	return AI_TOKEN.test(text) || AI_PHRASES.test(text);
}

export type AiMatch = { name: string; title: string | null; evidence: string; linkedinUrl: string | null };

/** Where the CURRENT self-label hits: headline, current title, or a listed
 *  skill. Returns the evidence source string, or null. Past titles never
 *  count here — they are note-only (pastMatches). */
function currentHit(p: ProspeoPerson): string | null {
	if (p.headline && aiHit(p.headline)) return `headline: ${p.headline}`;
	if (p.title && aiHit(p.title)) return `title: ${p.title}`;
	const skills = p.skills.filter(aiHit);
	if (skills.length) return `skills: ${skills.join(", ")}`;
	return null;
}

/** People whose headline, current title, or skills self-label AI, with the
 *  evidence verbatim for slot-time eyeballing. Capped at 3 examples — ≥1 is
 *  the rule; the full roster stays cached on the item. */
export function scoreRoster(people: ProspeoPerson[]): AiMatch[] {
	const out: AiMatch[] = [];
	for (const p of people) {
		const src = currentHit(p);
		if (!src) continue;
		out.push({ name: p.name, title: p.title, linkedinUrl: p.linkedinUrl, evidence: `${p.name} — ${p.title ?? "role n/a"} (${src})` });
	}
	return out.slice(0, 3);
}

/** Union rail-A search-time hits into roster matches: Prospeo's person
 *  search index and its roster endpoint disagree on coverage (search finds a
 *  self-labeler the roster pull never returns), so discovery evidence scores
 *  too — same strict current-self-label test, evidence tagged (search:).
 *  Pure — exported for tests. */
export function mergeSearchHits(matches: AiMatch[], hits: { name?: string; title?: string | null }[]): AiMatch[] {
	const out = [...matches];
	const seen = new Set(out.map((m) => m.name.toLowerCase()));
	for (const h of hits) {
		if (out.length >= 3) break;
		const title = h.title ?? "";
		if (!h.name || !aiHit(title) || seen.has(h.name.toLowerCase())) continue;
		seen.add(h.name.toLowerCase());
		out.push({ name: h.name, title: title || null, linkedinUrl: null, evidence: `${h.name} — ${title} (search: ${title})` });
	}
	return out;
}

/** Past AI job titles ("was \"ML Analyst\"") — never passes, note-only:
 *  still a good signal they could be doing something here now. Only people
 *  with NO current hit, else they'd already be in scoreRoster. */
export function pastMatches(people: ProspeoPerson[]): AiMatch[] {
	const out: AiMatch[] = [];
	for (const p of people) {
		if (currentHit(p)) continue;
		const was = p.historyTitles.find(aiHit);
		if (!was) continue;
		out.push({ name: p.name, title: p.title, linkedinUrl: p.linkedinUrl, evidence: `${p.name} (was "${was}")` });
	}
	return out.slice(0, 3);
}

// ponytail: fixed widget list — covers the chat vendors this ICP actually
// shows up with; extend when a new vendor class appears in rescue notes.
const WIDGET_RE = /(intercom|drift\.io|livechat|tidio|crisp\.chat|chatbase|voiceflow|botpress|tawk\.to|freshchat|hubspot.*conversations)/i;
// brand-matched outbound .ai links ("finemark.ai") — the vendor-hint signal
const AI_DOMAIN_RE = /href=["']https?:\/\/([a-z0-9.-]+\.ai)(\/|["'])/gi;
const GENERIC_TOKENS = new Set([
	"inc", "llc", "the", "and", "co", "corp", "company", "logistics", "freight",
	"transport", "transportation", "trucking", "express", "services", "group", "inc.",
]);

/** Brand tokens of a company name: split on non-alphanumerics, drop short and
 *  generic freight words. "FINEMARK INC" → ["finemark"]. */
export function brandTokens(companyName: string): string[] {
	return companyName
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
}

export type SiteScan = {
	/** Matched AI terms; weak ones are prefixed (POLICY:, widget:) and never corroborate. */
	evidence: string[];
	/** Note-only vendor hints: brand .ai domains + brand-AI marketing. */
	vendorHints: string[];
};

/** Corroborator ported from the validated study scanner. Strips <script> AND
 *  <style> (the Wix `--wbu-color-ai-0` trap lives in CSS). Privacy-page and
 *  widget hits are tagged weak — they feed the manual-rescue note, never the
 *  tier-1 upgrade. Non-brand-matched .ai links (glydr.ai directory embeds)
 *  are noise and ignored. */
export function scanSite(html: string, url: string, companyName: string): SiteScan {
	const isPrivacy = /privacy/i.test(url);
	const stripped = html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ");

	const evidence: string[] = [];
	if (!isPrivacy) {
		if (AI_TOKEN.test(stripped)) evidence.push("ai");
		for (const m of stripped.matchAll(new RegExp(AI_PHRASES.source, "gi"))) {
			const label = m[1].toLowerCase().replace(/\s+/g, " ");
			if (!evidence.includes(label)) evidence.push(label);
		}
		const widget = html.match(WIDGET_RE)?.[1];
		if (widget) evidence.push(`widget:${widget.toLowerCase()}`);
	} else {
		for (const m of stripped.matchAll(new RegExp(AI_PHRASES.source, "gi"))) {
			const label = `POLICY:${m[1].toLowerCase().replace(/\s+/g, " ")}`;
			if (!evidence.includes(label)) evidence.push(label);
		}
		if (AI_TOKEN.test(stripped) && !evidence.some((e) => e === "POLICY:ai"))
			evidence.push("POLICY:ai");
	}

	// vendor hints — reported, never scored
	const vendorHints: string[] = [];
	const tokens = brandTokens(companyName);
	for (const m of stripped.matchAll(AI_DOMAIN_RE)) {
		const stem = m[1].slice(0, -3); // drop ".ai"
		if (tokens.some((t) => stem.includes(t)) && !vendorHints.includes(m[1])) vendorHints.push(m[1]);
	}
	for (const t of tokens) {
		if (new RegExp(`${t}[\\s-]*\\bAI\\b`, "i").test(stripped)) {
			const hint = `${t} ai (marketing)`;
			if (!vendorHints.includes(hint)) vendorHints.push(hint);
		}
	}
	if (/\bour AI (platform|product|assistant)/i.test(stripped) && !vendorHints.includes("our AI platform"))
		vendorHints.push("our AI platform");

	return { evidence, vendorHints };
}

export type TierInput = {
	employeeMatches: AiMatch[];
	pastMatches: AiMatch[]; // past-AI titles: note-only, never passes
	siteEvidence: string[]; // merged evidence across pages (weak tags included)
	vendorHints: string[];
	roster: ProspeoRoster; // full (or partial) roster the scan ran over
	maxPages: number; // roster page cap — the "P" in the partial-roster caveat
	siteAttempted: boolean; // had a domain and fetched pages
};
export type TierResult = {
	tier: 1 | 2 | 3 | 4;
	verdict: "pass" | "fail";
	aiInterest: "high" | "some" | null;
	note: string;
};

/** The locked promotion table + the stage note. Vendor hints never change a
 *  verdict — they ride in the note for slot-time judgment. Note format:
 *  `tier{n}|<evidence>[; vendor-hint: <hints>]`, ≤300 chars; the tier prefix
 *  maps to aiInterest in applyVerdictConsequences (tier1→high, tier2→some). */
export function scoreAiSignal(input: TierInput): TierResult {
	// weak evidence (POLICY:, widget:) never corroborates — rescue note only
	const strong = input.siteEvidence.some((e) => !e.startsWith("POLICY:") && !e.startsWith("widget:"));
	let tier: 1 | 2 | 3 | 4;
	let verdict: "pass" | "fail";
	let aiInterest: "high" | "some" | null = null;
	if (input.employeeMatches.length >= 1 && strong) {
		tier = 1;
		verdict = "pass";
		aiInterest = "high";
	} else if (input.employeeMatches.length >= 1) {
		tier = 2;
		verdict = "pass";
		aiInterest = "some";
	} else if (input.siteEvidence.length >= 1) {
		tier = 2;
		verdict = "fail"; // site-only evidence — note for manual rescue
	} else if (input.roster.total > 0 || input.siteAttempted) {
		tier = 3;
		verdict = "fail";
	} else {
		tier = 4;
		verdict = "fail"; // barely have a phone
	}

	const parts = input.employeeMatches.map((m) => m.evidence);
	parts.push(...input.pastMatches.map((m) => `past-AI: ${m.evidence}`));
	if (!input.roster.complete) parts.push(`roster: ${input.roster.total}, scanned ${input.roster.pagesPulled} of ${input.maxPages} pages`);
	if (input.siteEvidence.length) parts.push(`site: ${[...new Set(input.siteEvidence)].join(",")}`);
	if (!parts.length)
		parts.push(`roster ${input.roster.people.length}, zero AI signal${input.siteAttempted ? "" : ", no site"}`);
	const hints = [...new Set(input.vendorHints)].join("; ");
	const note = `tier${tier}|${parts.join("; ")}${hints ? `; vendor-hint: ${hints}` : ""}`;
	return { tier, verdict, aiInterest, note: note.slice(0, 300) };
}

/** Plain-English decode of a stage note for humans. Returns null for notes it
 *  doesn't own (any other stage's format passes through untouched). */
export function humanizeAiSignalNote(note: string): string | null {
	const m = /^tier([1-4])\|/.exec(note);
	if (!m) return null;
	const tier = Number(m[1]);
	const body = note.slice(m[0].length);
	// tier2 splits by who carries the evidence: an employee part passes, only
	// past-AI/site/roster parts = the site-only manual-rescue fail
	const hasEmployee = body
		.split("; ")
		.some((p) => p && !/^(past-AI:|site:|roster:|vendor-hint:)/.test(p));
	let out =
		tier === 1
			? "PASS (high): employee self-labels AI + site corroborates"
			: tier === 2 && hasEmployee
				? "PASS (some): employee self-labels AI"
				: tier === 2
					? "FAIL — site-only evidence, worth a manual look"
					: tier === 3
						? "FAIL — visible, zero AI signal"
						: "FAIL — no site, no roster (barely have a phone)";
	const pages = /scanned (\d+) of (\d+) pages/.exec(body);
	if (pages) out += ` · scanned ${pages[1]} of ${pages[2]} pages`;
	if (body.includes("past-AI:")) out += " · past-AI experience (note only)";
	return out;
}
