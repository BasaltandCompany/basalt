// Self-checks for the sync engine's pure layer (merge.ts + sync-server.ts).
// Run: cd web && bun run test src/lib/sync/merge.test.ts
import { describe, expect, test } from "bun:test";
import {
	diffChanges,
	echoClearedFields,
	guardedFields,
	guardedRowIds,
	mergeRowDecision,
	nextBackoffMs,
	removedIds,
	sweepGuards,
	syncPollDecision,
	txApplied,
	type Overlay,
} from "./merge";

describe("mergeRowDecision", () => {
	test("missing row applies everything (seed)", () => {
		expect(mergeRowDecision(undefined, { id: "a", name: "x" }, new Set())).toEqual({
			action: "apply",
			fields: ["id", "name"],
		});
	});

	test("versioned rows: strictly-greater versions only", () => {
		const existing = { id: "a", body: "saved", version: 5 };
		// a poll that raced a save delivers an equal-or-older version → ignored
		expect(mergeRowDecision(existing, { id: "a", body: "old", version: 4 }, new Set())).toEqual({ action: "skip" });
		expect(mergeRowDecision(existing, { id: "a", body: "old", version: 5 }, new Set())).toEqual({ action: "skip" });
		// a real remote change bumps the version → applied
		expect(mergeRowDecision(existing, { id: "a", body: "agent", version: 6 }, new Set())).toEqual({
			action: "apply",
			fields: ["body", "version"],
		});
	});

	test("unversioned rows: server-authoritative minus guarded fields, unchanged fields skipped", () => {
		const existing = { id: "a", unread: true, archived: false };
		expect(mergeRowDecision(existing, { id: "a", unread: false, archived: false }, new Set())).toEqual({
			action: "apply",
			fields: ["unread"],
		});
		expect(
			mergeRowDecision(existing, { id: "a", unread: false, archived: false }, new Set(["unread"])),
		).toEqual({ action: "skip" });
	});
});

describe("tx guards", () => {
	const overlay: Overlay = new Map();
	overlay.set("email-thread", new Map([["t1", new Map([["unread", { to: false }]])]]));

	test("guardedFields lists pending guards", () => {
		expect(guardedFields(overlay, "email-thread", "t1")).toEqual(new Set(["unread"]));
		expect(guardedFields(overlay, "email-thread", "other")).toEqual(new Set());
	});

	test("echo (incoming value === guard.to) clears the guard", () => {
		const guards = overlay.get("email-thread")!.get("t1")!;
		expect(echoClearedFields(guards, { id: "t1", unread: false })).toEqual(["unread"]);
		expect(echoClearedFields(guards, { id: "t1", unread: true })).toEqual([]);
	});

	test("grace expiry sweeps; pending guards never expire", () => {
		const now = Date.now();
		const o: Overlay = new Map([
			["k", new Map([["r1", new Map([["f", { to: 1, until: now - 1 }]])], ["r2", new Map([["f", { to: 1 }]])]])],
		]);
		expect(sweepGuards(o, now)).toBe(true);
		expect(o.get("k")!.has("r1")).toBe(false);
		expect(guardedFields(o, "k", "r2")).toEqual(new Set(["f"]));
	});

	test("reconcile keeps guarded rows", () => {
		expect(removedIds(["a", "b", "c"], ["b"], new Set(["a", "c"]))).toEqual([]);
		expect(removedIds(["a", "b", "c"], ["b", "d"], new Set())).toEqual(["a", "c"]);
	});

	test("guardedRowIds scopes per kind", () => {
		expect(guardedRowIds(overlay, "email-thread", Date.now())).toEqual(new Set(["t1"]));
	});
});

describe("diffChanges + txApplied", () => {
	test("diffChanges snapshots only real changes", () => {
		expect(diffChanges({ id: "p", stage: "proposed" }, { stage: "proposed", extra: undefined })).toEqual({});
		expect(diffChanges({ id: "p", stage: "proposed" }, { stage: "sent" })).toEqual({
			stage: { from: "proposed", to: "sent" },
		});
	});

	test("txApplied dedupes boot replay", () => {
		const tx = { op: "update", changes: { unread: { from: true, to: false } } };
		expect(txApplied({ id: "t", unread: false }, tx)).toBe(true);
		expect(txApplied({ id: "t", unread: true }, tx)).toBe(false);
		expect(txApplied(undefined, tx)).toBe(false);
		expect(txApplied(undefined, { op: "delete" })).toBe(true);
		expect(txApplied({ id: "t" }, { op: "delete" })).toBe(false);
		expect(txApplied({ id: "n" }, { op: "create" })).toBe(true);
	});
});

describe("nextBackoffMs", () => {
	test("1s → 2s → 5s → 10s cap", () => {
		expect(nextBackoffMs(0)).toBe(1_000);
		expect(nextBackoffMs(1_000)).toBe(2_000);
		expect(nextBackoffMs(2_000)).toBe(5_000);
		expect(nextBackoffMs(5_000)).toBe(10_000);
		expect(nextBackoffMs(10_000)).toBe(10_000);
	});
});

describe("syncPollDecision", () => {
	test("first poll establishes the cursor without merging", () => {
		expect(syncPollDecision(null, { ok: true, last: 42, rowCount: 3 })).toEqual({
			merge: false,
			refetchAll: false,
			next: 42,
		});
	});

	test("events merge, silence doesn't, truncate forces a full refetch", () => {
		expect(syncPollDecision(42, { ok: true, last: 50, rowCount: 4 })).toEqual({ merge: true, refetchAll: false, next: 50 });
		expect(syncPollDecision(42, { ok: true, last: 50, rowCount: 0 })).toEqual({ merge: false, refetchAll: false, next: 50 });
		expect(syncPollDecision(42, { ok: true, last: 90, rowCount: 2, truncate: true })).toEqual({
			merge: false,
			refetchAll: true,
			next: 90,
		});
	});

	test("errors keep the cursor", () => {
		expect(syncPollDecision(42, { ok: false })).toEqual({ merge: false, refetchAll: false, next: 42 });
	});
});
