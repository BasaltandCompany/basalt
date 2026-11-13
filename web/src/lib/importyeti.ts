// ImportYeti data API client — official API (docs.importyeti.com; spec mirrored
// at docs/research/importyeti-openapi.json). Auth: IYApiKey header, paid data
// credits (PowerQuery companies ≈ 0.2 credits per non-empty call, free when
// empty; response carries requestCost + creditsRemaining).
// Discovery source for the Importers ICP (ICP-BCW.md): zero Prospeo credits at
// discovery. NOTE: the live PowerQuery companies response is aggregation
// buckets (key/company_address/company_link/...), not the swagger DTO — mapped
// below as AggCompany. Deep per-company data comes from the scraper
// (importyeti-scrape.ts) via the company_link slug.
const BASE = "https://data.importyeti.com/v1.0";

export type ImporterRow = {
	companyName: string;
	city: string | null;
	state: string | null;
	sourceUrl: string | null;
	sourceKind: string;
	rawData: Record<string, unknown>;
};

type Bucket = { key: string; doc_count?: number };

type AggCompany = {
	key?: string;
	name_variations?: string[];
	company_address?: Bucket[];
	company_link?: string;
	company_website?: Bucket[];
	company_contact_info?: { emails?: Bucket[]; phone_numbers?: Bucket[] };
	company_main_phone_number?: string;
	total_shipments?: number;
	doc_count?: number;
};

type CompaniesResponse = {
	requestCost: number;
	creditsRemaining: number;
	data?: { data?: AggCompany[]; totalCompanies?: number };
};

export const TIER1_STATES = ["IN"];
export const TIER2_STATES = ["OH", "IL", "MI", "KY", "WI"];

/** Any-state match over a company's addresses. */
const anyAddress = (c: AggCompany) => (c.company_address ?? []).map((a) => a.key ?? "");

/** "6435 South Scatterfield Road 46013 In Anderson In U S A" → {state:"IN", city:"Anderson"} */
const parseAddr = (addr?: string): { state: string | null; city: string | null } => {
	const m = (addr ?? "").match(/\b(\d{5})\s+([A-Za-z]{2})\s+([A-Za-z .'-]+?)\s+\2\b/);
	if (!m) return { state: null, city: null };
	return { state: m[2].toUpperCase(), city: m[3].trim() };
};

const addressIn = (addr: string, states: Set<string>) => {
	const { state } = parseAddr(addr);
	return state !== null && states.has(state);
};

export async function discoverImporterCompanies(
	opts: {
		hsCode?: string;
		product?: string;
		// ImportYeti range syntax, e.g. "[20 TO 5000]" — a calibration knob, not code
		shipmentsRange?: string;
		/** ISO date e.g. "2024-01-01" — converted to ImportYeti's mm/dd/yyyy start_date. */
		startDate?: string;
		tier?: 1 | 2;
		limit?: number;
		/** Hard floor on creditsRemaining — the pull stops early below it. */
		minCredits?: number;
	},
): Promise<{ rows: ImporterRow[]; creditsRemaining: number; totalCompanies: number }> {
	const key = process.env.IMPORTYETI_API_KEY ?? process.env.IY_API_KEY;
	if (!key) throw new Error("IMPORTYETI_API_KEY is not set — get one at data.importyeti.com");
	const limit = opts.limit ?? 200;
	const minCredits = opts.minCredits ?? 100;
	const states = new Set(opts.tier === 2 ? [...TIER1_STATES, ...TIER2_STATES] : TIER1_STATES);

	const params = new URLSearchParams({ page_size: "100" });
	if (opts.hsCode) params.set("hs_code", opts.hsCode);
	if (opts.product) params.set("product_description", opts.product);
	if (opts.shipmentsRange) params.set("company_total_shipments", opts.shipmentsRange);
	if (opts.startDate) {
		const [y, m, d] = opts.startDate.split("-");
		params.set("start_date", `${m}/${d}/${y}`);
	}

	const rows: ImporterRow[] = [];
	let creditsRemaining = Infinity;
	let totalCompanies = 0;
	for (let page = 1; rows.length < limit; page++) {
		params.set("page", String(page));
		const res = await fetch(`${BASE}/powerquery/us-import/companies?${params}`, {
			headers: { IYApiKey: key, Accept: "application/json" },
		});
		if (!res.ok) throw new Error(`ImportYeti HTTP ${res.status}: ${await res.text()}`);
		const body = (await res.json()) as CompaniesResponse;
		creditsRemaining = body.creditsRemaining;
		totalCompanies = body.data?.totalCompanies ?? totalCompanies;
		const batch = body.data?.data ?? [];
		if (batch.length === 0) break;
		for (const c of batch) {
			const addrs = anyAddress(c);
			const hit = addrs.find((a) => addressIn(a, states));
			const name = c.key?.trim();
			if (!hit || !name) continue;
			const { city } = parseAddr(hit);
			const slug = c.company_link?.replace(/^\//, "").replace(/^company\//, "") ?? null;
			rows.push({
				companyName: name,
				city,
				state: parseAddr(hit).state,
				sourceUrl: c.company_link ? `https://www.importyeti.com${c.company_link}` : null,
				sourceKind: "importyeti",
				rawData: {
					shipments: c.total_shipments ?? null,
					docCount: c.doc_count ?? null,
					importyetiSlug: slug,
					website: c.company_website?.[0]?.key ?? null,
					phone: c.company_main_phone_number ?? c.company_contact_info?.phone_numbers?.[0]?.key ?? null,
					// BOL contact data arrives unmasked (the scraped page masks it) — outreach gold
					emails: (c.company_contact_info?.emails ?? []).map((e) => e.key).filter(Boolean),
					nameVariations: c.name_variations ?? [],
					address: hit,
					industryType: "Importer / wholesale product company (ImportYeti BOL consignee)",
				},
			});
			if (rows.length >= limit) break;
		}
		if (creditsRemaining < minCredits) {
			console.error(`[importyeti] stopping at ${creditsRemaining} credits (floor ${minCredits})`);
			break;
		}
	}
	return { rows, creditsRemaining, totalCompanies };
}

// self-check: bun src/lib/importyeti.ts
if (import.meta.main) {
	const a = parseAddr("6435 South Scatterfield Road 46013 In Anderson In U S A");
	const b = parseAddr("no zip here");
	console.assert(a.state === "IN" && a.city === "Anderson", `parse failed: ${JSON.stringify(a)}`);
	console.assert(b.state === null && b.city === null, `parse should fail: ${JSON.stringify(b)}`);
	console.log("parse self-check ok");
}
