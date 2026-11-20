// Ported from cdl-pipeline tests/scraper-parse.test.ts (fixtures copied
// verbatim from there). The cdl-only confidentialityStatus classifier is
// dropped; everything else asserts identically.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	dmyToYm,
	extractRscPayload,
	isAllowed,
	parseCompanyPage,
	parseRobots,
	ScrapeFailed,
} from "./importyeti-scrape";

const AGG = {
	company_name: "Ikea Supply",
	company_also_known_names: ["017 D Tikea Supply", "017 Dt 1 Ikea Supply", "017 Dt 1 Ikea Supply"],
	company_address: "Savannah, Ga 31407, Us",
	company_website: "inter", // real value: ImportYeti truncates to a prefix
	company_email: "ikea2.usdo@inter.ikea.com",
	company_phone_number: "XXX-XXX-X015",
	total_shipments: 1348242,
	avg_teu_per_month: 2.12,
	manifest_confidentiality: [{ start: "01/06/2015", end: "01/03/2018" }],
	company_other_addresses: [
		{ shipments: 96396, address: "100 Ikea Dr, Westampton, Nj 08060, Us", other_companies: 1 },
		{ shipments: 25065, address: "Savannah, Ga 31407, Us", other_companies: 2 },
	],
	company_other_addresses_contact_info: [
		{
			address: "100 Ikea Dr, Westampton, Nj 08060, Us",
			most_recent_shipment_to: "04/05/2025",
			contact_info_data: { emails: [], phone_numbers: ["XXXXXXX750"] },
		},
	],
	trademarks: [{ name: "Kea", url: "https://trademarkfetch.com/company/kea", trademarks_count: 15 }],
	minimal_bol: [
		{
			date: "2026-08-26T00:00:01.000Z",
			bol: "MEDUYK922688",
			organization: { title: "Ikea Industrial Poland Sp Zoo", country: "Poland" },
			weight: 26880,
			description: "Flat-packed furniture",
		},
	],
	vendor_table: [
		{
			vendor_name: "Ikea Industrial Poland Z O O",
			vendor_address_country: "Poland",
			total_shipments_company: 322,
			shipments_12m: 6429,
			top_companies: [{ company_name: "Ikea Supply", total_shipments: 322, shipments_12m: 6429 }],
		},
	],
};

const OTHER_WEBSITES_ROW = {
	type: "company",
	website: "inter",
	otherWebsites: [
		{ website: "inter.ikea.com", frequency: 22768 },
		{ website: "ikea.com", frequency: 9580 },
		{ website: "inter.ikea.com", frequency: 1 }, // dup: dedupe must drop it
	],
};

const TIME_SERIES_ROW = {
	data: {
		"01/11/2015": { shipments: 5555 },
		"01/02/2015": { shipments: 4157 },
		"01/01/2015": { shipments: 5633 },
	},
	title: "Ikea Supply's Total Sea Shipments Over Time",
	showManifestConfidentiality: true,
};

/** Wrap payload rows the way the page does: one push per script tag. */
function toHtml(rows: unknown[]): string {
	return rows
		.map((r) => `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(r))}])</script>`)
		.join("");
}

const PAGE = toHtml([AGG, OTHER_WEBSITES_ROW, TIME_SERIES_ROW]);

describe("extractRscPayload", () => {
	it("decodes and joins the push chunks", () => {
		const payload = extractRscPayload(PAGE);
		expect(payload).toContain('"company_name":"Ikea Supply"');
		expect(payload).toContain("Total Sea Shipments Over Time");
	});

	it("skips chunks that do not decode", () => {
		const payload = extractRscPayload(`<script>self.__next_f.push([1,"not json"])</script>` + PAGE);
		expect(payload).toContain('"company_name"');
	});
});

describe("parseCompanyPage", () => {
	const data = parseCompanyPage(PAGE);

	it("reads the aggregate by anchor and maps the header fields", () => {
		expect(data.title).toBe("Ikea Supply");
		expect(data.canonicalAddress).toBe("Savannah, Ga 31407, Us");
		expect(data.totalShipments).toBe(1348242);
		expect(data.canonicalWebsite).toBe("inter.ikea.com");
	});

	it("dedupes alias names and websites", () => {
		expect(data.otherNames).toEqual(["017 D Tikea Supply", "017 Dt 1 Ikea Supply"]);
		expect(data.otherWebsites).toEqual(["inter.ikea.com", "ikea.com"]);
	});

	it("maps addresses with shipment counts and the shared-company signal", () => {
		expect(data.otherAddresses).toHaveLength(2);
		const first = data.otherAddresses[0]!;
		expect(first.address).toBe("100 Ikea Dr, Westampton, Nj 08060, Us");
		expect(first.totalShipments).toBe(96396);
		expect(first.companiesSharing).toBe(1);
	});

	it("attaches contact rows to their address and reports masked data honestly", () => {
		const first = data.otherAddresses[0]!;
		expect(first.dateCaptured).toBe("04/05/2025");
		expect(first.phones).toEqual([]); // "XXXXXXX750" is masked
		expect(data.contactDataMasked).toBe(false);
		expect(first.emails).toEqual(["ikea2.usdo@inter.ikea.com"]);
	});

	it("reads manifest confidentiality as exact dates", () => {
		expect(data.confidentialityPeriods).toEqual([{ start: "2015-06", end: "2018-03" }]);
	});

	it("reads the shipment series from the chart's own data row, sorted", () => {
		expect(data.shipmentPeriods).toEqual([
			{ period: "2015-01", shipments: 5633 },
			{ period: "2015-02", shipments: 4157 },
			{ period: "2015-11", shipments: 5555 },
		]);
	});

	it("maps bills of lading", () => {
		const sh = data.shipments[0]!;
		expect(sh.bolNumber).toBe("MEDUYK922688");
		expect(sh.arrivalDate).toBe("2026-08-26");
		expect(sh.supplierName).toBe("Ikea Industrial Poland Sp Zoo");
		expect(sh.supplierCountry).toBe("Poland");
		expect(sh.weight).toBe(26880);
	});

	it("maps suppliers with their peers", () => {
		const sup = data.suppliers[0]!;
		expect(sup.name).toBe("Ikea Industrial Poland Z O O");
		expect(sup.country).toBe("Poland");
		expect(sup.totalShipments).toBe(322);
		expect(sup.shipments12m).toBe(6429);
		expect(sup.peers).toEqual([{ company: "Ikea Supply", totalShipments: 322, shipments12m: 6429 }]);
	});

	it("reports trademark names, not their urls", () => {
		expect(data.trademarks).toEqual(["Kea"]);
	});

	it("throws ScrapeFailed when no aggregate is present", () => {
		expect(() => parseCompanyPage(toHtml([{ other: 1 }]))).toThrow(ScrapeFailed);
	});
});

/** Verbatim live wal-mart page captured 2026-09-14, after ImportYeti's redesign. */
const FIXTURE = join(dirname(import.meta.path), "fixtures", "importyeti-company-2026-09.html");

describe("parseCompanyPage against the 2026-09 live page", () => {
	const data = parseCompanyPage(readFileSync(FIXTURE, "utf8"));

	it("reads the header fields off the new payload", () => {
		expect(data.title).toBe("Wal Mart");
		expect(data.canonicalAddress).toBe("Bentonville, Ar 72716, Us");
		expect(data.totalShipments).toBe(691317);
	});

	it("reads suppliers, BOL rows, addresses and the chart series", () => {
		expect(data.suppliers.length).toBe(50);
		expect(data.suppliers[0]!.totalShipments).toBe(102129);
		expect(data.shipments.length).toBe(50);
		expect(data.otherAddresses.length).toBe(172);
		expect(data.shipmentPeriods.length).toBe(141);
	});

	it("reads exact confidentiality periods, including the open one", () => {
		expect(data.confidentialityPeriods).toEqual([
			{ start: "2015-02", end: "2018-06" },
			{ start: "2019-09", end: "2022-07" },
			{ start: "2025-07", end: null },
		]);
	});

	it("drops domain-truncated emails instead of storing them as contacts", () => {
		expect(data.otherAddresses[0]!.emails).toEqual([]);
		expect(data.contactDataMasked).toBe(true);
	});
});

/** Verbatim live lsi-distribution page captured 2026-09-15 — the small-company shape. */
const SMALL = join(dirname(import.meta.path), "fixtures", "importyeti-company-small-2026-09.html");

describe("parseCompanyPage against a small company", () => {
	const data = parseCompanyPage(readFileSync(SMALL, "utf8"));

	it("reads the header fields", () => {
		expect(data.title).toBe("Lsi Distribution");
		expect(data.totalShipments).toBe(8);
	});

	it("reads every supplier, not just the most recent one", () => {
		expect(data.suppliers.map((s) => [s.name, s.country, s.totalShipments])).toEqual([
			["Rodolfo Kirschner & Cia", "Brazil", 4],
			["Helvecia S A", "Argentina", 2],
			["Wenzhou Dawn Deer Technology Lt", "China", 1],
			["Madesp Industria E Comercio De Made", "Brazil", 1],
		]);
	});

	it("reads the whole chart series, not only the visible tail", () => {
		expect(data.shipmentPeriods).toEqual([
			{ period: "2015-01", shipments: 1 },
			{ period: "2017-04", shipments: 4 },
			{ period: "2024-09", shipments: 1 },
			{ period: "2025-11", shipments: 2 },
		]);
	});

	it("reads all three confidentiality periods, including the open one", () => {
		expect(data.confidentialityPeriods).toEqual([
			{ start: "2015-02", end: "2017-03" },
			{ start: "2017-05", end: "2025-10" },
			{ start: "2025-12", end: null },
		]);
	});

	it("reads every bill of lading the page carries", () => {
		expect(data.shipments).toHaveLength(8);
	});
});

describe("dmyToYm", () => {
	it("converts dd/mm/yyyy to yyyy-mm", () => {
		expect(dmyToYm("01/06/2015")).toBe("2015-06");
		expect(dmyToYm("26/08/2026")).toBe("2026-08");
	});
	it("rejects non-dates", () => {
		expect(dmyToYm(null)).toBeNull();
		expect(dmyToYm("2026-08-26")).toBeNull();
	});
});

describe("robots.txt", () => {
	// Verbatim from https://www.importyeti.com/robots.txt on 2026-08-19.
	const ROBOTS = `User-agent: *
Allow: /
Disallow: /search?q
Disallow: /api/addresses
Disallow: /api/ep
Disallow: /cdn-cgi/
Disallow: /mx/
Disallow: /us-export/
Disallow: /partnerships/`;

	const disallow = parseRobots(ROBOTS);

	it("permits company pages, which is what makes this approach viable", () => {
		expect(isAllowed("/company/ikea-supply", disallow)).toBe(true);
	});

	it("blocks the JSON endpoints we deliberately do not touch", () => {
		expect(isAllowed("/api/addresses", disallow)).toBe(false);
		expect(isAllowed("/api/ep", disallow)).toBe(false);
		expect(isAllowed("/us-export/foo", disallow)).toBe(false);
	});
});
