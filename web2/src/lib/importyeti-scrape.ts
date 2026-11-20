// ImportYeti company-page scraper — ported from cdl-pipeline (src/providers/
// scraper.ts, PRD §4.2 there). Replaces the API's 1-credit-per-record company
// endpoint with the free public page: a Next.js RSC flight payload fetched with
// wreq-js (browser TLS fingerprint — plain fetch gets Cloudflare-403'd), parsed
// without ever running JS. Roles: API = discovery/sweep (importyeti.ts),
// scraper = per-company depth (this file), at gate-fire/promotion only.
//
// Auth: IMPORTYETI_COOKIE = the logged-in `importyeti_token` session JWT.
// Anonymous is walled after ~25 pageviews/IP. Empirical rate limits from CDL's
// ASPTR-135: 5s shared pacer, 429 backs off 60s, every failure class retries 3x
// with a 60s cooldown, then the page is skipped — nothing blocks a run.
// robots.txt honored (/company/{slug} allowed). Nothing here solves CAPTCHAs.
import type { fetch as WreqFetch } from "wreq-js";

// wreq-js is a native NAPI module — loaded lazily; vite SSR externalizes
// node_modules by default, which is what a native module needs (cdl-pipeline's
// turbopackIgnore note doesn't apply to this bundler).
let wreqFetchCached: typeof WreqFetch | null = null;
async function wreqFetch(...args: Parameters<typeof WreqFetch>) {
	wreqFetchCached ??= (await import("wreq-js")).fetch;
	return wreqFetchCached(...args);
}

const ORIGIN = "https://www.importyeti.com";
const TOKEN = process.env.IMPORTYETI_COOKIE ?? "";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 5s between requests — the shared budget ImportYeti tolerates before 429s. */
export const importYetiPacer = (() => {
	let last = 0;
	let chain: Promise<unknown> = Promise.resolve();
	return {
		run<T>(fn: () => Promise<T>): Promise<T> {
			const next = chain.then(async () => {
				const wait = 5000 - (Date.now() - last);
				if (wait > 0) await sleep(wait);
				try {
					return await fn();
				} finally {
					last = Date.now();
				}
			});
			chain = next.catch(() => {});
			return next;
		},
	};
})();

export function importyetiTokenExpiry(cookie = process.env.IMPORTYETI_COOKIE): number | null {
	const payload = cookie?.split(".")[1];
	if (!payload) return null;
	try {
		const exp = (JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number }).exp;
		return typeof exp === "number" ? exp : null;
	} catch {
		return null;
	}
}

/** Scraping is structurally dead: no cookie, or one past its exp claim. */
export function cookieDead(cookie = process.env.IMPORTYETI_COOKIE): boolean {
	const exp = importyetiTokenExpiry(cookie);
	return exp == null || exp * 1000 <= Date.now();
}

/** True once the token has been wall-rejected enough times to call it structural. */
let consecutiveWallAttempts = 0;
export function wallTripped(): boolean {
	return consecutiveWallAttempts >= 6;
}

export class ScrapeFailed extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ScrapeFailed";
	}
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

let robotsCache: { fetchedAt: number; disallow: string[] } | null = null;

export function parseRobots(txt: string, agent = "*"): string[] {
	const lines = txt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
	const disallow: string[] = [];
	let active = false;
	for (const line of lines) {
		const ua = line.match(/^user-agent:\s*(.+)$/i);
		if (ua) {
			const val = (ua[1] ?? "").trim().toLowerCase();
			active = val === "*" || val === agent.toLowerCase();
			continue;
		}
		const dis = line.match(/^disallow:\s*(.*)$/i);
		if (dis && active) {
			const path = (dis[1] ?? "").trim();
			if (path) disallow.push(path);
		}
	}
	return disallow;
}

export function isAllowed(path: string, disallow: string[]): boolean {
	return !disallow.some((d) => path.startsWith(d));
}

async function loadRobots(): Promise<string[]> {
	if (robotsCache && Date.now() - robotsCache.fetchedAt < 24 * 3600 * 1000) {
		return robotsCache.disallow;
	}
	const res = await wreqFetch(`${ORIGIN}/robots.txt`, { browser: BROWSER, os: OS });
	if (!res.ok) throw new ScrapeFailed(`robots.txt returned HTTP ${res.status}`);
	const disallow = parseRobots(await res.text());
	robotsCache = { fetchedAt: Date.now(), disallow };
	console.log(`[importyeti-scrape] robots.txt loaded (${disallow.length} disallow rules)`);
	return disallow;
}

// ---------------------------------------------------------------------------
// Public data shapes (unchanged from cdl-pipeline — consumers depend on them)
// ---------------------------------------------------------------------------

export interface ScrapedAddress {
	address: string;
	dateCaptured: string | null;
	totalShipments: number | null;
	companiesSharing: number | null;
	emails: string[];
	phones: string[];
}

export interface ConfidentialityPeriod {
	start: string | null; // yyyy-mm
	end: string | null; // yyyy-mm, null when still active
}

export interface ShipmentPeriod {
	period: string; // yyyy-mm
	shipments: number;
}

export interface SupplierPeer {
	company: string;
	totalShipments: number | null;
	shipments12m: number | null;
}

export interface ScrapedSupplier {
	name: string;
	country: string | null;
	totalShipments: number | null;
	shipments12m: number | null;
	peers: SupplierPeer[];
}

export interface ScrapedShipment {
	bolNumber: string;
	arrivalDate: string | null; // yyyy-mm-dd
	supplierName: string | null;
	supplierCountry: string | null;
	weight: number | null;
	productDescription: string | null;
}

export interface ScrapedCompany {
	slug: string;
	title: string | null;
	canonicalAddress: string | null;
	canonicalWebsite: string | null;
	totalShipments: number | null;
	counts: Record<string, number>;
	otherNames: string[];
	otherWebsites: string[];
	trademarks: string[];
	otherAddresses: ScrapedAddress[];
	contactDataMasked: boolean;
	confidentialityPeriods: ConfidentialityPeriod[];
	shipmentPeriods: ShipmentPeriod[];
	shipments: ScrapedShipment[];
	suppliers: ScrapedSupplier[];
	scrapedAt: number;
}

// ---------------------------------------------------------------------------
// RSC payload parsing. Pure — unit-tested against saved payloads, no network.
// ---------------------------------------------------------------------------

export function extractRscPayload(html: string): string {
	const chunks: string[] = [];
	for (const m of html.matchAll(/self\.__next_f\.push\(\[1,(.*?)\]\)<\/script>/gs)) {
		try {
			chunks.push(JSON.parse(m[1]!.trim()));
		} catch {
			// A chunk we cannot decode is skipped; the aggregate spans many chunks.
		}
	}
	return chunks.join("");
}

export function braceWalk(payload: string, anchor: string): Record<string, unknown> | null {
	const idx = payload.indexOf(`"${anchor}"`);
	if (idx === -1) return null;
	let depth = 0;
	let start = -1;
	for (let i = idx; i >= 0; i--) {
		if (payload[i] === "}") depth++;
		else if (payload[i] === "{") {
			if (depth === 0) {
				start = i;
				break;
			}
			depth--;
		}
	}
	if (start === -1) return null;
	let d = 0;
	for (let i = start; i < payload.length; i++) {
		if (payload[i] === "{") d++;
		else if (payload[i] === "}") {
			d--;
			if (d === 0) {
				try {
					return JSON.parse(payload.slice(start, i + 1)) as Record<string, unknown>;
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}

/** Anchors tried in order; the first object that carries company_name wins. */
const AGG_ANCHORS = ["avg_teu_per_month", "total_shipments", "company_name"];

/** "01/06/2015" (dd/mm/yyyy) -> "2015-06". Null on anything else. */
export function dmyToYm(s: string | null | undefined): string | null {
	const m = (s ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
	return m ? `${m[3]}-${m[2]}` : null;
}

/** "2026-08-26T00:00:01.000Z" -> "2026-08-26". */
function isoToYmd(s: string | null | undefined): string | null {
	const m = (s ?? "").match(/^(\d{4}-\d{2}-\d{2})T/);
	return m ? m[1]! : null;
}

function isMaskedValue(v: string | null | undefined): boolean {
	if (!v) return true;
	const s = v.trim();
	if (!s || s === "---" || s === "-") return true;
	if (/^X{3,}/i.test(s)) return true;
	const bare = s.replace(/[^A-Za-z0-9]/g, "");
	if (!bare) return true;
	const xs = (bare.match(/x/gi) ?? []).length;
	return xs / bare.length >= 0.4;
}

function unmasked(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return values
		.map((v) => {
			// 2026-09 payload: entries arrive as objects {email} / {phone_number}.
			if (typeof v === "object" && v !== null) {
				const e = v as { email?: unknown; phone_number?: unknown };
				return String(e.email ?? e.phone_number ?? "").trim();
			}
			return String(v ?? "").trim();
		})
		.filter(
			(v) =>
				v.length > 1 &&
				!isMaskedValue(v) &&
				// ImportYeti truncates at the domain ("name@wal-mart.") — incomplete,
				// not usable data.
				!v.endsWith("."),
		);
}

interface RawWebsiteEntry {
	website?: string;
	frequency?: number;
}

interface RawAddress {
	shipments?: number;
	address?: string;
	other_companies?: number;
}

interface RawContactInfo {
	address?: string;
	most_recent_shipment_to?: string;
	contact_info_data?: { emails?: unknown[]; phone_numbers?: unknown[] };
}

interface RawBol {
	date?: string;
	bol?: string;
	organization?: { title?: string; country?: string };
	weight?: number;
	description?: string;
}

interface RawVendor {
	vendor_name?: string;
	vendor_address_country?: string | null;
	country?: string | null;
	total_shipments_company?: number;
	shipments_12m?: number;
	top_companies?: { company_name?: string; total_shipments?: number; shipments_12m?: number }[];
}

interface RawTimeSeriesRow {
	data?: Record<string, { shipments?: number }>;
	title?: string;
}

/**
 * Parse a fetched company page into a ScrapedCompany. Pure. Throws ScrapeFailed
 * when the page carries no company aggregate (challenge, 404 shell, redesign).
 */
export function parseCompanyPage(html: string): Omit<ScrapedCompany, "slug" | "scrapedAt"> {
	const payload = extractRscPayload(html);

	let agg: Record<string, unknown> | null = null;
	for (const anchor of AGG_ANCHORS) {
		const candidate = braceWalk(payload, anchor);
		if (candidate && "company_name" in candidate) {
			agg = candidate;
			break;
		}
	}
	if (!agg) throw new ScrapeFailed("no company aggregate in RSC payload");

	const otherNames = stringList(agg.company_also_known_names);
	const trademarks = (Array.isArray(agg.trademarks)
		? (agg.trademarks as { name?: string }[]).map((t) => (t.name ?? "").trim()).filter(Boolean)
		: []);

	// otherWebsites is inline in a props row, not in the aggregate (the agg field
	// holds an RSC $ref). Find the literal array in the payload.
	const otherWebsitesRaw: string[] = [];
	{
		const idx = payload.indexOf('"otherWebsites":');
		if (idx > -1) {
			const arrStart = payload.indexOf("[", idx);
			if (arrStart > -1) {
				let d = 0;
				for (let i = arrStart; i < payload.length; i++) {
					if (payload[i] === "[") d++;
					else if (payload[i] === "]") {
						d--;
						if (d === 0) {
							try {
								const entries = JSON.parse(payload.slice(arrStart, i + 1)) as RawWebsiteEntry[];
								for (const e of entries) {
									const w = (e.website ?? "").trim();
									if (w) otherWebsitesRaw.push(w);
								}
							} catch {
								// no websites is a survivable gap
							}
							break;
						}
					}
				}
			}
		}
	}
	const otherWebsites = [...new Set(otherWebsitesRaw)];

	// Addresses: aggregate rows carry shipment counts; contact-info rows carry
	// (masked) emails/phones. The 2026-09 redesign made contact info ONE
	// account-level object — accept either shape; unmatched rows attach to the
	// canonical address below, like company_email.
	const contacts = new Map<string, RawContactInfo>();
	const rawContacts: unknown = agg.company_other_addresses_contact_info;
	const contactRows = Array.isArray(rawContacts)
		? rawContacts
		: rawContacts && typeof rawContacts === "object"
			? [rawContacts]
			: [];
	for (const c of contactRows as RawContactInfo[]) {
		if (c?.address) contacts.set(c.address, c);
	}
	const otherAddresses: ScrapedAddress[] = ((agg.company_other_addresses as RawAddress[]) ?? [])
		.filter((a) => (a.address ?? "").trim().length > 2)
		.map((a) => {
			const info = contacts.get(a.address ?? "");
			return {
				address: (a.address ?? "").trim(),
				dateCaptured: info?.most_recent_shipment_to ?? null,
				totalShipments: typeof a.shipments === "number" ? a.shipments : null,
				companiesSharing: typeof a.other_companies === "number" ? a.other_companies : null,
				emails: unmasked(info?.contact_info_data?.emails),
				phones: unmasked(info?.contact_info_data?.phone_numbers),
			};
		});

	// The account-level contact fields are the one place unmasked data appears.
	const companyEmails = unmasked([agg.company_email]);
	const companyPhones = unmasked([agg.company_phone_number]);
	if ((companyEmails.length || companyPhones.length) && otherAddresses[0]) {
		otherAddresses[0].emails = [...new Set([...otherAddresses[0].emails, ...companyEmails])];
		otherAddresses[0].phones = [...new Set([...otherAddresses[0].phones, ...companyPhones])];
	}
	const anyContact =
		companyEmails.length + companyPhones.length +
		otherAddresses.reduce((n, a) => n + a.emails.length + a.phones.length, 0);
	const contactDataMasked = anyContact === 0;

	const confidentialityPeriods: ConfidentialityPeriod[] = (
		(agg.manifest_confidentiality as { start?: string; end?: string }[]) ?? []
	)
		.map((p) => ({ start: dmyToYm(p?.start), end: dmyToYm(p?.end) }))
		.filter((p) => p.start !== null);

	// Monthly shipment series: the chart's own data row, located by its
	// showManifestConfidentiality key; falls back to the inline agg field.
	let seriesData: Record<string, { shipments?: number }> | undefined;
	const tsRow = braceWalk(payload, "showManifestConfidentiality") as RawTimeSeriesRow | null;
	seriesData = tsRow?.data;
	if (!seriesData && agg.company_time_series && typeof agg.company_time_series === "object") {
		seriesData = (agg.company_time_series as RawTimeSeriesRow).data;
	}
	const shipmentPeriods: ShipmentPeriod[] = seriesData
		? Object.entries(seriesData)
				.map(([k, v]) => ({ period: dmyToYm(k) ?? "", shipments: Number(v?.shipments ?? 0) }))
				.filter((p) => p.period !== "" && p.shipments > 0)
				.sort((a, b) => a.period.localeCompare(b.period))
		: [];

	const shipments: ScrapedShipment[] = ((agg.minimal_bol as RawBol[]) ?? [])
		.filter((b) => (b.bol ?? "").trim())
		.map((b) => ({
			bolNumber: (b.bol ?? "").trim(),
			arrivalDate: isoToYmd(b.date),
			supplierName: (b.organization?.title ?? "").trim() || null,
			supplierCountry: (b.organization?.country ?? "").trim() || null,
			weight: typeof b.weight === "number" && b.weight > 0 ? b.weight : null,
			productDescription: (b.description ?? "").trim() || null,
		}));

	const suppliers: ScrapedSupplier[] = ((agg.vendor_table as RawVendor[]) ?? [])
		.filter((v) => (v.vendor_name ?? "").trim())
		.map((v) => ({
			name: (v.vendor_name ?? "").trim(),
			country: (v.vendor_address_country ?? v.country ?? null) || null,
			totalShipments: typeof v.total_shipments_company === "number" ? v.total_shipments_company : null,
			shipments12m: typeof v.shipments_12m === "number" ? v.shipments_12m : null,
			peers: (v.top_companies ?? [])
				.map((p) => ({
					company: (p.company_name ?? "").trim(),
					totalShipments: typeof p.total_shipments === "number" ? p.total_shipments : null,
					shipments12m: typeof p.shipments_12m === "number" ? p.shipments_12m : null,
				}))
				.filter((p) => p.company),
		}));

	const counts: Record<string, number> = {
		"Other names": otherNames.length,
		"Other websites": otherWebsites.length,
		Trademarks: trademarks.length,
		"Other addresses": otherAddresses.length,
	};

	// company_website is frequently a truncated prefix ("inter"); fall back to
	// the highest-frequency otherWebsites entry.
	const websiteRaw = String(agg.company_website ?? "").trim();
	const looksLikeDomain = /^[\w-]+(\.[\w-]+)+$/.test(websiteRaw);
	const canonicalWebsite = looksLikeDomain ? websiteRaw : (otherWebsites[0] ?? null);

	return {
		title: (String(agg.company_name ?? "").trim() || null),
		canonicalAddress: (String(agg.company_address ?? "").trim() || null),
		canonicalWebsite,
		totalShipments: typeof agg.total_shipments === "number" ? agg.total_shipments : null,
		counts,
		otherNames,
		otherWebsites,
		trademarks,
		otherAddresses,
		contactDataMasked,
		confidentialityPeriods,
		shipmentPeriods,
		shipments,
		suppliers,
	};
}

function stringList(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return [...new Set(v.map((x) => String(x ?? "").trim()).filter((x) => x.length > 1))];
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

const BROWSER = "chrome_149";
const OS = "macos";
const MAX_ATTEMPTS = 3;
const CF_BACKOFF_MS = 60_000;

async function fetchPage(path: string): Promise<{ status: number; html: string }> {
	let lastErr = "";
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const blockedClass = /429|403|404|wall|challenge/.test(lastErr);
		if (attempt > 0) await sleep(blockedClass ? CF_BACKOFF_MS : attempt === 1 ? 2_000 : 5_000);
		try {
			const res = await wreqFetch(`${ORIGIN}${path}`, {
				browser: BROWSER,
				os: OS,
				headers: TOKEN ? { Cookie: `importyeti_token=${TOKEN}` } : {},
			});
			if (res.status === 200) {
				const html = await res.text();
				// The 25/IP wall is a 200 whose payload is a login demand.
				if (html.includes("people scraping")) {
					if (TOKEN) consecutiveWallAttempts++;
					lastErr = TOKEN ? "wall (25/IP despite token - cookie rejected)" : "wall (25/IP anonymous)";
					continue;
				}
				// Real Cloudflare interstitials render one of these strings. The
				// /cdn-cgi/challenge-platform beacon is NOT a marker (it's on every
				// proxied page — counting it caused CDL runs #182-184 to hard-stop).
				if (html.includes("Verify your account") || html.includes("Just a moment")) {
					lastErr = "challenge";
					continue;
				}
				return { status: res.status, html };
			}
			lastErr = `HTTP ${res.status}`;
		} catch (e) {
			lastErr = String(e);
		}
	}
	throw new ScrapeFailed(`failed after ${MAX_ATTEMPTS} attempts on ${path}: ${lastErr}`);
}

/**
 * Scrape one company page. Best-effort by contract: a throw means "continue
 * without deep data", never "stop the run". Slug is the ImportYeti URL segment
 * (/company/<slug>) — usually the slugified company name.
 */
export async function scrapeCompanyPage(slug: string): Promise<{ data: ScrapedCompany; html: string }> {
	const path = `/company/${slug}`;
	const disallow = await loadRobots();
	if (!isAllowed(path, disallow)) {
		throw new ScrapeFailed(`robots.txt disallows ${path}`);
	}

	return importYetiPacer.run(async () => {
		const { status, html } = await fetchPage(path);
		let data: Omit<ScrapedCompany, "slug" | "scrapedAt">;
		try {
			data = parseCompanyPage(html);
			consecutiveWallAttempts = 0;
		} catch {
			// Challenges were screened in fetchPage; a page that loads but does
			// not parse is a parser problem (ImportYeti redesign?) — fail this one.
			throw new ScrapeFailed(`no company aggregate on ${path} - page loaded but does not match the parser`);
		}
		if (status !== 200) throw new ScrapeFailed(`HTTP ${status} on ${path}`);
		const full: ScrapedCompany = { ...data, slug, scrapedAt: Math.floor(Date.now() / 1000) };
		return { data: full, html };
	});
}
