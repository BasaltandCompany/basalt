// Tests for the revenue_band gate — the fallback when Prospeo matches a
// company but has no revenue_range (most private companies). The stage used to
// throw there, which records no verdict and leaves the item re-erroring in the
// queue forever; now it estimates from headcount (the ICP's own rev/employee
// sanity) or fails honestly.
import { describe, expect, test } from "bun:test";
import { opsTriggerVerdict, revenueBandVerdict } from "./funnel-stages";

const rev = (min: number | null, max: number | null) => ({
	revenueMin: min,
	revenueMax: max,
	employeeCount: null,
	employeeRange: null,
});

describe("revenueBandVerdict", () => {
	test("real Prospeo range in band → pass", () => {
		const r = revenueBandVerdict(rev(12e6, 30e6));
		expect(r.verdict).toBe("pass");
		expect(r.note).toBe("$12–$30M (Prospeo)");
	});

	test("real range overlapping the band → pass (existing semantics)", () => {
		expect(revenueBandVerdict(rev(5e6, 15e6)).verdict).toBe("pass");
	});

	test("real range above band → fail", () => {
		expect(revenueBandVerdict(rev(80e6, 120e6)).verdict).toBe("fail");
	});

	test("no revenue → headcount estimate boundaries 30/31/215/216", () => {
		const v = (n: number | null) =>
			revenueBandVerdict({ revenueMin: null, revenueMax: null, employeeCount: n, employeeRange: null });
		expect(v(30).verdict).toBe("fail"); // $9.75M
		expect(v(31).verdict).toBe("pass"); // $10.075M
		expect(v(215).verdict).toBe("pass"); // $69.875M
		expect(v(216).verdict).toBe("fail"); // $70.2M
		expect(v(50).note).toBe("est. $16M from ~50 employees @ $325k/emp (Prospeo has no revenue)");
	});

	test("employeeRange midpoint estimates when no exact count", () => {
		// "51-100" midpoint 75 → $24.375M → pass
		const r = revenueBandVerdict({ revenueMin: null, revenueMax: null, employeeCount: null, employeeRange: "51-100" });
		expect(r.verdict).toBe("pass");
		expect(r.note).toContain("est.");
	});

	test("one-sided range falls back to the estimate", () => {
		const r = revenueBandVerdict({ revenueMin: null, revenueMax: 40e6, employeeCount: 100, employeeRange: null });
		expect(r.verdict).toBe("pass");
		expect(r.note).toContain("est.");
	});

	test("nothing at all → honest fail, not a throw", () => {
		const r = revenueBandVerdict(null);
		expect(r.verdict).toBe("fail");
		expect(r.note).toBe("no revenue or headcount data (Prospeo)");
	});

	test("runtime-tuned params retune the band and estimator", () => {
		// band widened to $5-20M: a $3-6M range now overlaps → pass
		expect(revenueBandVerdict(rev(3e6, 6e6), { min: 5e6, max: 20e6 }).verdict).toBe("pass");
		// estimator at 50 × $400k = $20M, exactly on the tuned max → pass
		const est = revenueBandVerdict(
			{ revenueMin: null, revenueMax: null, employeeCount: 50, employeeRange: null },
			{ min: 5e6, max: 20e6, perEmp: 400_000 },
		);
		expect(est.verdict).toBe("pass");
		expect(est.note).toContain("$400k/emp");
	});
});

const person = (title: string) => ({
	name: title,
	title,
	headline: null,
	skills: [],
	historyTitles: [],
	linkedinUrl: null,
});
const rosterOf = (...titles: string[]) => ({
	people: titles.map(person),
	total: titles.length,
	pagesPulled: 1,
	complete: true,
});

describe("opsTriggerVerdict", () => {
	test("finance buyer layer → pass, titles named in the note", () => {
		const r = opsTriggerVerdict(rosterOf("CFO", "Staff Accountant", "Dispatcher"));
		expect(r.verdict).toBe("pass");
		expect(r.note).toContain("fin:1");
		expect(r.note).toContain("CFO");
	});

	test("manual hiring machine (≥2 recruiting titles) → pass with no finance", () => {
		expect(opsTriggerVerdict(rosterOf("Recruiter", "Onboarding Specialist")).verdict).toBe("pass");
	});

	test("one recruiter alone → fail (below minHiring)", () => {
		expect(opsTriggerVerdict(rosterOf("Recruiter", "Driver")).verdict).toBe("fail");
	});

	test("nothing visible → honest fail with sample size", () => {
		const r = opsTriggerVerdict(rosterOf("Driver", "Dispatcher"));
		expect(r.verdict).toBe("fail");
		expect(r.note).toContain("2-person sample");
	});

	test("a project controller is not a finance buyer", () => {
		expect(opsTriggerVerdict(rosterOf("Project Controller", "Dispatcher")).verdict).toBe("fail");
	});

	test("runtime params retune the thresholds", () => {
		expect(opsTriggerVerdict(rosterOf("Recruiter", "Driver"), { minFinance: 1, minHiring: 1 }).verdict).toBe("pass");
	});
});
