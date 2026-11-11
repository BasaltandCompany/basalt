import { describe, expect, test } from "bun:test";
import { applyPoll, type ChangeEvent, type PollResult } from "./live-queries";

const ok = (events: ChangeEvent[], last?: number): PollResult =>
	({ ok: true, events, last: last ?? (events.at(-1)?.id ?? 0) }) as PollResult;

describe("applyPoll (live-queries reducer)", () => {
	test("first poll syncs cursor without revalidating", () => {
		expect(applyPoll(null, ok([{ id: 40, table: "docs", op: "UPDATE" }], 42))).toEqual({ revalidate: false, next: 42 });
	});

	test("new events after the cursor revalidate and advance", () => {
		expect(applyPoll(42, ok([{ id: 43, table: "videos", op: "INSERT" }], 43))).toEqual({ revalidate: true, next: 43 });
	});

	test("no new events keeps the cursor and stays quiet", () => {
		expect(applyPoll(43, ok([], 43))).toEqual({ revalidate: false, next: 43 });
	});

	test("error result keeps the cursor, never revalidates", () => {
		expect(applyPoll(43, { ok: false })).toEqual({ revalidate: false, next: 43 });
		expect(applyPoll(null, { ok: false })).toEqual({ revalidate: false, next: 0 });
	});
});
