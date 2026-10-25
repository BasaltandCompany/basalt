// Discovery mapper tests (bun test src/lib/prospeo-discovery.test.ts) — the
// pure result→ImportRow halves of both rails. Fixtures mirror Prospeo's raw
// search-response shapes (person: full_name/current_job_title/linkedin_url;
// company: name/location/company_id/domain/employee_count...).
import { test } from "bun:test";
import assert from "node:assert/strict";
import { aiPeopleToRows, companiesToRows, type SearchPersonHit, type SearchCompanyHit } from "./prospeo-discovery";

const person = (over: Record<string, unknown> = {}) => ({ full_name: "Brett Mathews", current_job_title: "Director of AI", linkedin_url: "https://linkedin.com/in/brett", ...over });

const company = (over: Record<string, unknown> = {}) => ({
	name: "Smoke Brokerage LLC",
	location: { city: "Indianapolis", state: "IN" },
	company_id: "cccc7c7da6116a8830a07100",
	domain: "smokebrokerage.com",
	employee_count: 42,
	...over,
});

test("aiPeopleToRows: one row per company, prospeo payload + aiHit carried", () => {
	const rows = aiPeopleToRows([{ person: person(), company: company() }]);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].companyName, "Smoke Brokerage LLC");
	assert.equal(rows[0].state, "IN");
	assert.equal(rows[0].sourceKind, "prospeo_ai");
	assert.equal((rows[0].rawData!.prospeo as Record<string, unknown>).companyId, "cccc7c7da6116a8830a07100");
	assert.equal((rows[0].rawData!.prospeo as Record<string, unknown>).matched, true);
	const hits = rows[0].rawData!.aiHits as { name: string; linkedinUrl: string }[];
	assert.equal(hits[0].name, "Brett Mathews");
	assert.equal(hits[0].linkedinUrl, "https://linkedin.com/in/brett");
});

test("aiPeopleToRows: dedups same company, caps evidence at 3, skips no-company hits", () => {
	const hits: SearchPersonHit[] = [
		{ person: person({ full_name: "A" }), company: company() },
		{ person: person({ full_name: "B" }), company: company({ name: "Smoke Brokerage LLC" }) }, // same company, different casing
		{ person: person({ full_name: "C" }), company: company({ name: "Smoke Brokerage LLC" }) },
		{ person: person({ full_name: "D" }), company: company({ name: "Smoke Brokerage LLC" }) }, // 4th hit → dropped (cap 3)
		{ person: person({ full_name: "E" }), company: null }, // no current employer
	];
	const rows = aiPeopleToRows(hits);
	assert.equal(rows.length, 1);
	assert.equal((rows[0].rawData!.aiHits as unknown[]).length, 3);
	assert.deepEqual((rows[0].rawData!.aiHits as { name: string }[]).map((h) => h.name), ["A", "B", "C"]);
});

test("companiesToRows: maps company object to ImportRow with cached payload", () => {
	const rows = companiesToRows([{ company: company({ name: "Flora Law", employee_count: 18 }) }] as SearchCompanyHit[]);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].companyName, "Flora Law");
	assert.equal(rows[0].sourceKind, "prospeo_company");
	const prospeo = rows[0].rawData!.prospeo as Record<string, unknown>;
	assert.equal(prospeo.matched, true);
	assert.equal(prospeo.employeeCount, 18);
	assert.equal(prospeo.domain, "smokebrokerage.com");
});

test("companiesToRows: drops rows without a company name", () => {
	assert.equal(companiesToRows([{ company: { name: "  " } }, { company: {} }] as SearchCompanyHit[]).length, 0);
});
