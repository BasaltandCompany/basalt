import { describe, expect, test } from "bun:test";
import {
	billedAmount,
	cumulativeSavingsSeries,
	grossSavedForCompany,
	grossSavedForTool,
	netRoi,
	usd,
} from "./value";

// fixed clock so proration assertions are exact
const NOW = new Date("2025-07-16T12:00:00Z");
const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * MS_PER_DAY);

describe("grossSavedForTool", () => {
	test("prorates by day at 30.44 days/month", () => {
		const tool = { name: "Zoom", monthlyCost: 30, cutoverDate: daysAgo(DAYS_PER_MONTH) };
		expect(grossSavedForTool(tool, NOW)).toBeCloseTo(30, 5);
	});

	test("cutover exactly two months ago → two months of savings", () => {
		const tool = { name: "Zoom", monthlyCost: 49, cutoverDate: daysAgo(2 * DAYS_PER_MONTH) };
		expect(grossSavedForTool(tool, NOW)).toBeCloseTo(98, 5);
	});

	test("null cutoverDate → zero (planned)", () => {
		expect(grossSavedForTool({ name: "Zoom", monthlyCost: 49, cutoverDate: null }, NOW)).toBe(0);
	});

	test("future cutoverDate → zero", () => {
		const tool = { name: "Zoom", monthlyCost: 49, cutoverDate: new Date(NOW.getTime() + MS_PER_DAY) };
		expect(grossSavedForTool(tool, NOW)).toBe(0);
	});

	test("cutover today → zero", () => {
		expect(grossSavedForTool({ name: "Zoom", monthlyCost: 49, cutoverDate: NOW }, NOW)).toBe(0);
	});

	test("accepts ISO string dates", () => {
		const tool = { name: "Zoom", monthlyCost: 30, cutoverDate: daysAgo(DAYS_PER_MONTH).toISOString() };
		expect(grossSavedForTool(tool, NOW)).toBeCloseTo(30, 5);
	});
});

describe("grossSavedForCompany / netRoi", () => {
	test("sums across tools", () => {
		const tools = [
			{ name: "A", monthlyCost: 10, cutoverDate: daysAgo(DAYS_PER_MONTH) },
			{ name: "B", monthlyCost: 20, cutoverDate: daysAgo(DAYS_PER_MONTH) },
			{ name: "planned", monthlyCost: 500, cutoverDate: null },
		];
		expect(grossSavedForCompany(tools, NOW)).toBeCloseTo(30, 5);
	});

	test("net = gross − billable fees only", () => {
		const tools = [{ name: "A", monthlyCost: 100, cutoverDate: daysAgo(DAYS_PER_MONTH) }];
		const billed = [
			{ hours: 2, billable: true, hourlyRate: 10 },
			{ hours: 5, billable: false, hourlyRate: 10 },
		];
		expect(netRoi(tools, billed, NOW)).toBeCloseTo(80, 5);
	});

	test("negative early in an engagement — shown honestly", () => {
		const tools = [{ name: "A", monthlyCost: 10, cutoverDate: daysAgo(DAYS_PER_MONTH) }];
		const billed = [{ hours: 100, billable: true, hourlyRate: 10 }];
		expect(netRoi(tools, billed, NOW)).toBeCloseTo(-990, 5);
	});
});

describe("cumulativeSavingsSeries", () => {
	test("empty when nothing cut over", () => {
		expect(cumulativeSavingsSeries([{ name: "A", monthlyCost: 10, cutoverDate: null }], NOW)).toEqual([]);
	});

	test("starts at the earliest cutover month and grows monotonically", () => {
		// $30/mo cut over Mar 15 → bucket end Apr 1 = 17 days ≈ $16.75, Apr +$30…
		const tools = [
			{ name: "Zoom", monthlyCost: 30, cutoverDate: new Date("2025-03-15T00:00:00Z") },
			{ name: "Fathom", monthlyCost: 24, cutoverDate: new Date("2025-04-02T00:00:00Z") },
		];
		const series = cumulativeSavingsSeries(tools, NOW);
		expect(series[0].label).toBe("Mar 25");
		expect(series.length).toBe(5); // Mar, Apr, May, Jun, Jul
		const saved = series.map((p) => p.saved);
		expect(saved[0]).toBeCloseTo((30 * 17) / DAYS_PER_MONTH, 1);
		expect(saved[1]).toBeGreaterThan(saved[0]);
		expect(saved[4]).toBeCloseTo(grossSavedForCompany(tools, NOW), 5);
		expect(saved).toEqual([...saved].sort((a, b) => a - b));
	});
});

describe("usd", () => {
	test("rounds to whole dollars, negatives keep their sign", () => {
		expect(usd(14200.4)).toBe("$14,200");
		expect(usd(14200.6)).toBe("$14,201");
		expect(usd(-990.2)).toBe("-$990");
	});
});

expect(billedAmount([{ hours: 3, billable: true, hourlyRate: 5 }])).toBe(15);
