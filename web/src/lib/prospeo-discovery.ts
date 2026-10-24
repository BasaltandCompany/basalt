// Discovery rails via Prospeo's search endpoints:
//   Rail A — /search-person: Indiana people whose job title self-labels AI
//     (every hit IS an ai_signal match; the company arrives pre-qualified,
//     with the person's LinkedIn URL for the connect loop)
//   Rail B — /search-company: industry lists (Indiana + industry + headcount)
// Credits: 1 per 25-result page that returns rows. Canonical filter values
// (location/industry enums) resolve through the FREE /search-suggestions
// endpoint, cached per process — enum drift never 400s a discovery run.
import { mapCompany, prospeoConfigured, throttle, type ProspeoCompany } from "./enrich-prospeo";
import type { ImportRow } from "./funnels";

// Fallbacks if the suggestions endpoint is unreachable — the documented STATE
// pattern is "California, United States", the industry example style is
// "Software Development". A stale fallback surfaces as INVALID_FILTERS in the
// scheduler log and is a one-string fix.
const INDIANA_FALLBACK = "Indiana, United States";

/** One FREE /search-suggestions call. Returns null on any failure. */
async function suggestions<T>(body: Record<string, string>, pick: (d: Record<string, unknown>) => T[] | null | undefined): Promise<T[] | null> {
	try {
		const r = await fetch("https://api.prospeo.io/search-suggestions", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-KEY": process.env.PROSPEO_API_KEY! },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(10_000),
		});
		if (!r.ok) return null;
		const picked = pick((await r.json()) as Record<string, unknown>);
		return picked ?? null;
	} catch {
		return null;
	}
}

let indianaPromise: Promise<string> | null = null;
/** Exact Prospeo location string for Indiana (STATE-type suggestion), cached per process. */
export function indianaLocation(): Promise<string> {
	indianaPromise ??= (async () => {
		const s = await suggestions({ location_search: "indiana" }, (d) => d.location_suggestions as { name: string; type: string }[] | null);
		return s?.find((l) => l.type === "STATE" && /indiana/i.test(l.name))?.name ?? INDIANA_FALLBACK;
	})();
	return indianaPromise;
}

const industryCache = new Map<string, Promise<string>>();
/** Exact Prospeo industry enum value for a term, cached per process. Falls back to the term itself. */
export function industryValue(term: string): Promise<string> {
	if (!industryCache.has(term)) {
		industryCache.set(
			term,
			(async () => {
				const s = await suggestions({ industry_search: term }, (d) => d.industry_suggestions as string[] | null);
				return s?.find((i) => i.toLowerCase() === term.toLowerCase()) ?? s?.[0] ?? term;
			})(),
		);
	}
	return industryCache.get(term)!;
}

/** Paginate a search endpoint (1 credit/25-result page): stop on NO_RESULTS,
 *  empty page, or the API's own total_page. Mid-run failure keeps what's paid
 *  for — same policy as the roster pull. */
async function paginateSearch<T>(path: string, filters: unknown, maxPages: number): Promise<T[]> {
	const out: T[] = [];
	for (let page = 1; page <= maxPages; page++) {
		await throttle("search");
		const r = await fetch(`https://api.prospeo.io${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-KEY": process.env.PROSPEO_API_KEY! },
			body: JSON.stringify({ page, filters }),
		});
		const body = await r.text();
		if (r.status === 400) {
			const d = JSON.parse(body || "{}") as { error_code?: string; filter_error?: string };
			if (d.error_code === "NO_RESULTS") return out;
			throw new Error(`prospeo ${path}: ${d.error_code ?? "bad request"}${d.filter_error ? ` — ${d.filter_error}` : ""}`);
		}
		if (!r.ok) throw new Error(`prospeo ${path} HTTP ${r.status}: ${body.slice(0, 120)}`);
		const d = JSON.parse(body) as { results?: T[]; pagination?: { total_page?: number } };
		const batch = d.results ?? [];
		if (batch.length === 0) return out;
		out.push(...batch);
		if (page >= (d.pagination?.total_page ?? page)) return out;
	}
	return out;
}

// ── Rail A: AI-labeled people ──

export const AI_TITLE_TERMS = ["AI", "machine learning", "generative AI", "chatgpt"];

export type SearchPersonHit = { person: Record<string, unknown>; company: Record<string, unknown> | null };

/** Search-person hits → one ImportRow per company, with the self-labeling
 *  people as aiHits evidence (name/title/LinkedIn) and the Prospeo payload
 *  pre-cached (exact companyId for the roster, free headcount/revenue).
 *  Pure — exported for tests. */
export function aiPeopleToRows(hits: SearchPersonHit[]): ImportRow[] {
	const byCompany = new Map<string, ImportRow>();
	for (const { person, company } of hits) {
		const co = company as Record<string, unknown> | null;
		const name = typeof co?.name === "string" ? (co.name as string).trim() : "";
		if (!co || !name) continue; // no current employer → nothing to target
		const hit = {
			name: ((person.full_name as string | undefined) ?? "").trim(),
			title: (person.current_job_title as string | null) ?? null,
			linkedinUrl: (person.linkedin_url as string | null) ?? null,
		};
		const existing = byCompany.get(name.toLowerCase());
		if (existing) {
			const aiHits = (existing.rawData!.aiHits as unknown[]) ?? [];
			if (aiHits.length < 3) aiHits.push(hit); // cap evidence — ≥1 is the rule
			continue;
		}
		const loc = (co.location as { city?: string; state?: string } | null | undefined) ?? {};
		byCompany.set(name.toLowerCase(), {
			companyName: name,
			city: loc.city?.trim() || null,
			state: loc.state?.trim() || null,
			sourceUrl: null,
			sourceKind: "prospeo_ai",
			rawData: {
				prospeo: { matched: true, ...mapCompany(co) },
				aiHits: [hit],
			},
		});
	}
	return [...byCompany.values()];
}

/** Rail A driver: Indiana + AI-self-labeling titles. ~10 credits at 10 pages. */
export async function discoverAiPeople({ maxPages = 10 } = {}): Promise<ImportRow[]> {
	if (!prospeoConfigured()) return [];
	const hits = await paginateSearch<SearchPersonHit>(
		"/search-person",
		{
			person_job_title: { include: AI_TITLE_TERMS, match_mode: "CONTAINS" },
			person_location_search: { include: [await indianaLocation()] },
		},
		maxPages,
	);
	return aiPeopleToRows(hits);
}

// ── Rail B: industry company lists ──

export type SearchCompanyHit = { company: Record<string, unknown> };

/** Search-company hits → ImportRows with the Prospeo payload pre-cached.
 *  Pure — exported for tests. */
export function companiesToRows(hits: SearchCompanyHit[]): (ImportRow & { prospeo: ProspeoCompany })[] {
	const out: (ImportRow & { prospeo: ProspeoCompany })[] = [];
	for (const h of hits) {
		const co = h.company as Record<string, unknown> | null;
		if (typeof co?.name !== "string" || !co.name.trim()) continue;
		const loc = (co.location as { city?: string; state?: string } | null | undefined) ?? {};
		const prospeo = mapCompany(co);
		out.push({
			companyName: co.name.trim(),
			city: loc.city?.trim() || null,
			state: loc.state?.trim() || null,
			sourceUrl: null,
			sourceKind: "prospeo_company",
			rawData: { prospeo: { matched: true, ...prospeo } },
			prospeo,
		});
	}
	return out;
}

/** Rail B driver: Indiana + industry + headcount bands (ICP 11-200 by default).
 *  ~1 credit per 25 companies. */
export async function discoverCompanies(
	{ industry = "Legal Services", headcount = ["11-20", "21-50", "51-100", "101-200"], maxPages = 5 } = {},
): Promise<ImportRow[]> {
	if (!prospeoConfigured()) return [];
	const [location, industryEnum] = await Promise.all([indianaLocation(), industryValue(industry)]);
	const hits = await paginateSearch<SearchCompanyHit>(
		"/search-company",
		{
			company_industry: { include: [industryEnum] },
			company_headcount_range: headcount,
			company_location_search: { include: [location] },
		},
		maxPages,
	);
	return companiesToRows(hits).map(({ prospeo, ...row }) => row);
}
