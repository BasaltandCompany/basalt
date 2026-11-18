// Tests for the pure half of the GitHub PR webhook: DEL-<n> extraction and
// the deliverable status transition table. The DB half (applyPullRequest) is
// exercised by the manual end-to-end webhook replay.
import { describe, expect, test } from "bun:test";
import { nextDeliverableStatus, parseDeliverableNumbers } from "./github-prs";

const pr = (headRef: string, title: string, body: string | null = null) => ({
	head: { ref: headRef },
	title,
	body,
});

describe("parseDeliverableNumbers", () => {
	test("branch name is the primary source", () => {
		expect(parseDeliverableNumbers(pr("collin/del-12-fix-thing", "some title"))).toEqual([12]);
	});

	test("title match when branch is empty", () => {
		expect(parseDeliverableNumbers(pr("main", "Ship DEL-7 onboarding"))).toEqual([7]);
	});

	test("body match", () => {
		expect(parseDeliverableNumbers(pr("feature/x", "no keys here", "Closes DEL-3"))).toEqual([3]);
	});

	test("dedupes across sources, branch order first", () => {
		expect(parseDeliverableNumbers(pr("del-5-x", "DEL-9 also", "and DEL-5 again"))).toEqual([5, 9]);
	});

	test("multiple deliverables in one PR", () => {
		expect(parseDeliverableNumbers(pr("del-1-del-2", "DEL-3 + DEL-4"))).toEqual([1, 2, 3, 4]);
	});

	test("case-insensitive key", () => {
		expect(parseDeliverableNumbers(pr("Del-42-branch", "del-42"))).toEqual([42]);
	});

	test("no false match: MODEL-12 or DELLOYD-3 stay out", () => {
		expect(parseDeliverableNumbers(pr("model-12-branch", "DELLOYD-3 anyone?"))).toEqual([]);
	});

	test("no refs → empty", () => {
		expect(parseDeliverableNumbers(pr("main", "chore: deps", null))).toEqual([]);
	});
});

describe("nextDeliverableStatus", () => {
	test("PR opened: planned → in_progress", () => {
		expect(nextDeliverableStatus("planned", "opened", false)).toBe("in_progress");
	});

	test("PR reopened: planned → in_progress", () => {
		expect(nextDeliverableStatus("planned", "reopened", false)).toBe("in_progress");
	});

	test("opened: in_progress/review/completed/blocked untouched", () => {
		expect(nextDeliverableStatus("in_progress", "opened", false)).toBeNull();
		expect(nextDeliverableStatus("review", "opened", false)).toBeNull();
		expect(nextDeliverableStatus("completed", "opened", false)).toBeNull();
		expect(nextDeliverableStatus("blocked", "opened", false)).toBeNull();
	});

	test("merged: planned and in_progress → review", () => {
		expect(nextDeliverableStatus("planned", "closed", true)).toBe("review");
		expect(nextDeliverableStatus("in_progress", "closed", true)).toBe("review");
	});

	test("merged: review/completed never regressed", () => {
		expect(nextDeliverableStatus("review", "closed", true)).toBeNull();
		expect(nextDeliverableStatus("completed", "closed", true)).toBeNull();
	});

	test("closed without merge: no-op", () => {
		expect(nextDeliverableStatus("planned", "closed", false)).toBeNull();
		expect(nextDeliverableStatus("in_progress", "closed", false)).toBeNull();
	});

	test("unrelated actions are no-ops", () => {
		expect(nextDeliverableStatus("planned", "synchronize", false)).toBeNull();
		expect(nextDeliverableStatus("planned", "edited", false)).toBeNull();
	});
});
