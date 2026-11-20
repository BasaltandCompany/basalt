import { test, expect } from "bun:test";
import { composeQuoteMarkdown, computeQuoteTotals, money, quoteRateLine } from "./quotes";

const BCW_ITEMS = [
	{ group: "required" as const, name: "Data foundation", detail: "Supabase tables + RLS", hours: 5, unitRate: 120 },
	{ group: "required" as const, name: "Form renderer", detail: null, hours: 10, unitRate: 120 },
	{ group: "required" as const, name: "Cutover support", detail: "Embeds + rollback checklist", hours: 4, unitRate: 120 },
	{ group: "optional" as const, name: "Submission history import", detail: "Answer data only", hours: 4, unitRate: 120 },
	{ group: "optional" as const, name: "Survey mode", detail: "One question per step", hours: 8, unitRate: 120 },
];

test("group totals: Base subtotal vs Everything-in total", () => {
	const t = computeQuoteTotals(BCW_ITEMS);
	expect(t.required).toEqual({ hours: 19, subtotal: 2280, count: 3 });
	expect(t.optional).toEqual({ hours: 12, subtotal: 1440, count: 2 });
	expect(t.total).toBe(3720);
	expect(t.perItem).toEqual([600, 1200, 480, 480, 960]);
});

test("empty items → zero totals", () => {
	const t = computeQuoteTotals([]);
	expect(t.total).toBe(0);
	expect(t.required.count).toBe(0);
});

test("rate line only when every rate matches", () => {
	expect(quoteRateLine(BCW_ITEMS)).toBe("Rate: $120/hour. Fixed Price Quote Project.");
	expect(quoteRateLine([...BCW_ITEMS, { group: "optional", name: "x", detail: null, hours: 1, unitRate: 200 }])).toBeNull();
	expect(quoteRateLine([])).toBeNull();
});

test("money: whole dollars vs cents", () => {
	expect(money(9600)).toBe("$9,600");
	expect(money(747.5)).toBe("$747.50");
});

test("compose: BCW structure with required table, optional table, signature block", () => {
	const md = composeQuoteMarkdown({
		quote: { validDays: 30, quotedCapHours: null, createdAt: new Date("2026-11-17") },
		companyName: "BCW Supplies",
		bodyMarkdown: "## What we are building\n\nOne script tag, forms in the Hub.",
		items: BCW_ITEMS,
	});
	// header block
	expect(md).toContain("Prepared for: BCW Supplies");
	expect(md).toContain("Prepared by: Collin Pfeifer");
	expect(md).toContain("Rate: $120/hour. Fixed Price Quote Project.");
	expect(md).toContain("Quote valid: 30 days");
	// narrative passthrough
	expect(md).toContain("## What we are building");
	// required table with Base subtotal
	expect(md).toContain("| Part | Line item | Hours | Price |");
	expect(md).toContain("Data foundation — Supabase tables + RLS");
	expect(md).toContain("**Base subtotal** | **19** | **$2,280**");
	// optional add-ons with Everything-in total
	expect(md).toContain("## Optional add-ons");
	expect(md).toContain("| A | Submission history import");
	expect(md).toContain("**Everything-in total** | **12** | **$1,440**");
	expect(md).toContain("Everything-in total: $3,720 (31 hours).");
	// signature block, unsigned
	expect(md).toContain("## Signature");
	expect(md).toContain("By signing below, both parties agree to the terms outlined in this quote.");
	expect(md).toContain("Date: \\_\\_\\_");
});

test("compose: no optionals → required table closes with Total; signed swaps the client block", () => {
	const requiredOnly = BCW_ITEMS.filter((i) => i.group === "required");
	const unsigned = composeQuoteMarkdown({
		quote: { validDays: 30, quotedCapHours: 100, createdAt: new Date("2026-11-17") },
		companyName: "Customs Data Lock",
		bodyMarkdown: "body",
		items: requiredOnly,
	});
	expect(unsigned).toContain("**Total** | **19** | **$2,280**");
	expect(unsigned).not.toContain("## Optional add-ons");
	expect(unsigned).toContain("Quoted cap: 100 hours.");
	expect(unsigned).toContain("Customs Data Lock");

	const signed = composeQuoteMarkdown({
		quote: { validDays: 30, quotedCapHours: null, createdAt: new Date("2026-11-17") },
		companyName: "BCW Supplies",
		bodyMarkdown: "body",
		items: requiredOnly,
		signature: { signerName: "Eric Brownell", signedAt: new Date("2026-11-18") },
	});
	expect(signed).toContain("**Signed: Eric Brownell** — November 18, 2026 (Basalt client portal)");
});
