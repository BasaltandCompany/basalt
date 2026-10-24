// Prospeo company enrichment — the headcount + revenue driver.
// Why Prospeo over Apollo here: 1 credit per MATCHED company, 0 credits on
// no-match (our queue is mostly misses = free screening), and one call
// returns employee_count + revenue_range + founded + location.
// Docs: https://prospeo.io/api-docs/enrich-company
/** Strip legal suffixes — "10-4 GLOBAL LLC" finds nothing, "10-4 Global" does. */
export const cleanName = (n: string) => n.replace(/\s+(LLC|L\.L\.C|INC|INC\.|CORP|CORPORATION|LTD|CO\.)\s*$/i, "").trim();

// Prospeo plan limits — search-person 1/s + 30/min, enrich 5/s + 300/min —
// fixed spacing sits safely under each sustained cap; 429 still backs off.
const INTERVALS = { search: 2_200, enrich: 250 }; // ~27/min search, 4/s enrich
const lastCall = { search: 0, enrich: 0 };
export async function throttle(kind: keyof typeof INTERVALS) {
	const wait = INTERVALS[kind] - (Date.now() - lastCall[kind]);
	if (wait > 0) await Bun.sleep(wait);
	lastCall[kind] = Date.now();
}
/** Test hooks: clear the rate-limit spacing between mocked calls, or zero it
 *  for multi-page roster fetches (pagination would otherwise sleep per page). */
export function _resetThrottle() {
	lastCall.search = 0;
	lastCall.enrich = 0;
}
export function _setMinInterval(ms: number) {
	INTERVALS.search = ms;
	INTERVALS.enrich = ms;
}

export function prospeoConfigured() {
	return Boolean(process.env.PROSPEO_API_KEY);
}

export type ProspeoCompany = {
	// Prospeo's internal company id — the exact-match key for /search-person
	// roster lookups (names matching can pull in unrelated same-name companies).
	companyId: string | null;
	employeeCount: number | null;
	employeeRange: string | null;
	revenueMin: number | null;
	revenueMax: number | null;
	founded: number | null;
	city: string | null;
	state: string | null;
	domain: string | null;
	linkedinUrl: string | null;
	industry: string | null;
};

export function mapCompany(c: Record<string, unknown>): ProspeoCompany {
	const range = (c.employee_range as string | null) ?? null;
	const rev = (c.revenue_range as { min?: number; max?: number } | null) ?? {};
	const loc = (c.location as { city?: string; state?: string } | null) ?? {};
	return {
		companyId: typeof c.company_id === "string" ? c.company_id : null,
		employeeCount: typeof c.employee_count === "number" ? c.employee_count : null,
		employeeRange: range,
		revenueMin: typeof rev.min === "number" ? rev.min : null,
		revenueMax: typeof rev.max === "number" ? rev.max : null,
		founded: typeof c.founded === "number" ? c.founded : null,
		city: loc.city ?? null,
		state: loc.state ?? null,
		domain: typeof c.domain === "string" ? c.domain : null,
		linkedinUrl: typeof c.linkedin_url === "string" ? c.linkedin_url : null,
		industry: typeof c.industry === "string" ? c.industry : null,
	};
}

/** Bulk: up to 50 companies in ONE request (1 credit per match, 0 on miss,
 *  one rate-limit slot instead of 50). Map value null = not matched. */
export async function prospeoBulkEnrich(companyNames: string[]): Promise<Map<string, ProspeoCompany | null>> {
	const out = new Map<string, ProspeoCompany | null>();
	if (companyNames.length === 0) return out;
	for (let attempt = 0; ; attempt++) {
		await throttle("enrich");
		const r = await fetch("https://api.prospeo.io/bulk-enrich-company", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-KEY": process.env.PROSPEO_API_KEY! },
			body: JSON.stringify({ data: companyNames.map((n, i) => ({ identifier: String(i), company_name: cleanName(n) })) }),
		});
		if (r.status === 429 && attempt < 3) {
			await Bun.sleep(30_000 * (attempt + 1));
			continue;
		}
		const body = await r.text();
		if (!r.ok) throw new Error(`prospeo bulk HTTP ${r.status} (rate-limited? retry in a minute): ${body.slice(0, 120)}`);
		const d = JSON.parse(body) as { matched?: { identifier: string; company?: Record<string, unknown> }[] };
		const byIdx = new Map<string, ProspeoCompany>();
		for (const m of d.matched ?? []) if (m.company) byIdx.set(m.identifier, mapCompany(m.company));
		companyNames.forEach((n, i) => out.set(n, byIdx.get(String(i)) ?? null));
		return out;
	}
}

/** Enrich a batch: bulk when the plan allows it, else spaced singles.
 *  (Free plans meter bulk per record — a 50-record bulk 429s while 1-record
 *  bulks pass — so catch that and fall back rather than failing the run.) */
export async function prospeoEnrichBatch(companyNames: string[]): Promise<Map<string, ProspeoCompany | null>> {
	try {
		return await prospeoBulkEnrich(companyNames);
	} catch (e) {
		if (!(e instanceof Error && e.message.includes("429"))) throw e;
	}
	const out = new Map<string, ProspeoCompany | null>();
	for (const n of companyNames) out.set(n, await prospeoEnrichCompany(n));
	return out;
}

/** Enrich by company name. null = no match (costs 0 credits). */
export async function prospeoEnrichCompany(companyName: string): Promise<ProspeoCompany | null> {
	let body = "";
	for (let attempt = 0; ; attempt++) {
		await throttle("enrich");
		const r = await fetch("https://api.prospeo.io/enrich-company", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-KEY": process.env.PROSPEO_API_KEY! },
			body: JSON.stringify({ data: { company_name: cleanName(companyName) } }),
		});
		if (r.status === 429 && attempt < 4) {
			await Bun.sleep(15_000 * (attempt + 1));
			continue;
		}
		body = await r.text();
		if (r.status === 400) {
			const d = JSON.parse(body || "{}") as { error_code?: string };
			if (d.error_code === "NO_MATCH") return null;
			throw new Error(`prospeo: ${d.error_code ?? "bad request"}`);
		}
		if (!r.ok) throw new Error(`prospeo enrich HTTP ${r.status}: ${body.slice(0, 120)}`);
		break;
	}
	const d = JSON.parse(body) as { company?: Record<string, unknown> };
	return d.company ? mapCompany(d.company) : null;
}

/* ── People roster (/search-person) — the AI-signal stage's only source ──
 * One credit per request that returns ≥1 person, 0 on no-match; Prospeo
 * dedupes an identical result page free for 30 days. The roster is cached on
 * the funnel item, so re-runs and later reads cost nothing. */

export type ProspeoPerson = {
	name: string;
	title: string | null;
	headline: string | null;
	skills: string[];
	historyTitles: string[];
	linkedinUrl: string | null;
};

/** pagesPulled/complete: pagination state of this cache — a legacy page-1
 *  cache has no `complete` key, so it reads as partial and gets backfilled. */
export type ProspeoRoster = { people: ProspeoPerson[]; total: number; pagesPulled: number; complete: boolean };

export type RosterRefs = { companyId?: string | null; domain?: string | null; name: string };

/** Company filter, preference order: oid (exact) → website URL → name. The
 *  name fallback can overmatch same-name companies; the note names the people
 *  it returned, so a bad match is a 10-second eyeball away. */
function rosterCompanyFilter(refs: RosterRefs) {
	if (refs.companyId) return { company_oids: { include: [refs.companyId] } };
	if (refs.domain) {
		const host = refs.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
		return { websites: { include: [`https://${host}/`] } };
	}
	return { names: { include: [refs.name] } };
}

/** Everyone at the company, 25/page: 1 credit per page that returns ≥1 person
 *  (identical pages deduped free for 30d), capped at maxPages (10 pages = 250
 *  people ≥ the funnel's 250-headcount ceiling). Stops early on a short page
 *  or the API's total_page. Mid-run failure keeps what's paid for — partial
 *  beats throwing; a page-1 failure rethrows (nothing to keep). NO_RESULTS →
 *  empty roster, complete, not an error. */
export async function prospeoCompanyRoster(refs: RosterRefs, { maxPages = 10 }: { maxPages?: number } = {}): Promise<ProspeoRoster> {
	// One page = one throttled request; 429 backs off, other errors throw.
	const fetchPage = async (page: number): Promise<string> => {
		for (let attempt = 0; ; attempt++) {
			await throttle("search");
			const r = await fetch("https://api.prospeo.io/search-person", {
				method: "POST",
				headers: { "Content-Type": "application/json", "X-KEY": process.env.PROSPEO_API_KEY! },
				body: JSON.stringify({ page, filters: { company: rosterCompanyFilter(refs) } }),
			});
			if (r.status === 429 && attempt < 4) {
				await Bun.sleep(15_000 * (attempt + 1));
				continue;
			}
			const body = await r.text();
			if (r.ok) return body;
			const d = JSON.parse(body || "{}") as { error_code?: string };
			if (r.status === 400) {
				// NO_RESULTS = the company has no people on file: empty-but-complete
				if (d.error_code === "NO_RESULTS") return "";
				throw new Error(`prospeo search-person: ${d.error_code ?? "bad request"}`);
			}
			throw new Error(`prospeo search-person HTTP ${r.status}: ${body.slice(0, 120)}`);
		}
	};
	const people: ProspeoPerson[] = [];
	let total = 0;
	for (let page = 1; page <= maxPages; page++) {
		let raw = "";
		try {
			raw = await fetchPage(page);
		} catch (e) {
			// mid-roster failure (quota, network): keep the pages already paid for
			if (people.length) return { people, total, pagesPulled: page - 1, complete: false };
			throw e;
		}
		if (raw === "") return { people, total: 0, pagesPulled: page - 1, complete: true };
		const d = JSON.parse(raw) as {
			results?: { person?: Record<string, unknown> }[];
			pagination?: { total_count?: number; total_page?: number };
		};
		const batch = (d.results ?? [])
			.map((res) => res.person)
			.filter((p): p is Record<string, unknown> => Boolean(p))
			.map((p) => ({
				name: (p.full_name as string | undefined) ?? "",
				title: (p.current_job_title as string | null) ?? null,
				headline: (p.headline as string | null) ?? null,
				skills: Array.isArray(p.skills) ? (p.skills as unknown[]).filter((s): s is string => typeof s === "string") : [],
				linkedinUrl: (p.linkedin_url as string | null) ?? null,
				historyTitles: [...new Set(((p.job_history as { title?: string; current?: boolean }[] | undefined) ?? [])
					.filter((j) => !j.current && j.title)
					.map((j) => j.title!))].slice(0, 5),
			}));
		// short/empty page = end of the company's people, even if total_page lied
		if (batch.length === 0) return { people, total, pagesPulled: page - 1, complete: true };
		people.push(...batch);
		total = d.pagination?.total_count || people.length;
		if (page >= (d.pagination?.total_page ?? page)) return { people, total, pagesPulled: page, complete: true };
	}
	return { people, total, pagesPulled: maxPages, complete: false };
}

/** "11-50" → 30 (midpoint). Falls back when employee_count is null. */
export function rangeMidpoint(range: string | null): number | null {
	const m = range?.match(/(\d+)[^\d]+(\d+)/);
	return m ? Math.round((Number(m[1]) + Number(m[2])) / 2) : null;
}
