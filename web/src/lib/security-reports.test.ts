import { describe, expect, test } from "bun:test";
import { formatWeekOf, reportPathAllowed, summaryLine } from "./security-reports";

const CID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("summaryLine", () => {
	test("always shows open count", () => {
		expect(summaryLine({})).toBe("0 open");
		expect(summaryLine(null)).toBe("0 open");
	});
	test("shows nonzero deltas and KEV flag", () => {
		expect(summaryLine({ open: 3, new: 1, fixed: 2 })).toBe("3 open · 1 new · 2 fixed");
		expect(summaryLine({ open: 1, kev: 1 })).toBe("1 open · 1 actively exploited");
	});
});

describe("reportPathAllowed", () => {
	test("allows own-company paths", () => {
		expect(reportPathAllowed(`${CID}/2026-11-16/report.pdf`, [CID])).toBe(true);
		expect(reportPathAllowed(`${CID}/2026-11-16/report.html`, [CID, OTHER])).toBe(true);
	});
	test("rejects other companies and traversal", () => {
		expect(reportPathAllowed(`${OTHER}/2026-11-16/report.pdf`, [CID])).toBe(false);
		expect(reportPathAllowed(`../../etc/passwd`, [CID])).toBe(false);
		expect(reportPathAllowed("", [CID])).toBe(false);
	});
});

describe("formatWeekOf", () => {
	test("formats ISO date without TZ drift", () => {
		expect(formatWeekOf("2026-11-16")).toBe("Nov 16, 2026");
		expect(formatWeekOf("2026-01-05")).toBe("Jan 5, 2026");
	});
	test("passes through garbage", () => {
		expect(formatWeekOf("not-a-date")).toBe("not-a-date");
	});
});
