import { describe, expect, mock, test } from "bun:test";

// ingestDesktopSamples touches the db through a narrow insert().values()
// .onConflictDoUpdate() chain — capture it and assert the built blocks.
const inserted: Record<string, any>[] = [];
const db = {
	insert: () => ({
		values: (rows: Record<string, any>[]) => ({
			onConflictDoUpdate: (opts: { target: any }) => {
				expect(opts.target).toBeDefined(); // dedupe upsert must be present
				inserted.push(...rows);
				return Promise.resolve();
			},
		}),
	}),
	select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }),
	update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
};
mock.module("~/db", () => ({ db }));
const { ingestDesktopSamples, IDLE_LIMIT_SECONDS } = await import("./record");
const { indexMatchers } = await import("./match");

const T0 = "2026-11-23T10:00:00Z";
const at = (i: number) => new Date(Date.parse(T0) + i * 30_000).toISOString();
const index = indexMatchers([{ kind: "title", pattern: "BCW", projectId: "p-bcw", category: null }]);

describe("ingestDesktopSamples", () => {
	test("builds attributed blocks, splits on idle, never stores idle spans", async () => {
		inserted.length = 0;
		const n = await ingestDesktopSamples("mac", "batch-1", [
			{ at: at(0), appName: "Safari", title: "BCW hub — Figma", idleSec: 5, locked: false },
			{ at: at(1), appName: "Safari", title: "BCW hub — docs", idleSec: 10, locked: false },
			{ at: at(2), appName: "Safari", title: "BCW hub — docs", idleSec: 240, locked: false }, // idle 4 min
			{ at: at(3), appName: "Safari", title: "BCW hub — docs", idleSec: 8, locked: false }, // new block
			{ at: at(4), appName: "Slack", title: "random chat", idleSec: 3, locked: false }, // attribution change
		], index);
		expect(n).toBe(3);
		expect(inserted[0]).toMatchObject({ projectId: "p-bcw", source: "desktop", deviceId: "mac" });
		expect(new Date(inserted[0].endedAt).getTime() - new Date(inserted[0].startedAt).getTime()).toBe(60_000); // 2 samples
		// idle sample ends the block but is never stored itself
		expect(new Date(inserted[1].startedAt).toISOString()).toBe(at(3));
		// title matcher miss → unassigned
		expect(inserted[2].projectId).toBeNull();
		expect(inserted[2].titleSnippet).toBe("random chat");
	});

	test("locked samples are skipped entirely", async () => {
		inserted.length = 0;
		const n = await ingestDesktopSamples("mac", "batch-2", [
			{ at: at(0), appName: "Safari", title: "BCW", idleSec: 5, locked: true },
			{ at: at(1), appName: "Safari", title: "BCW", idleSec: 5, locked: false },
		], index);
		expect(n).toBe(1);
		expect(new Date(inserted[0].startedAt).toISOString()).toBe(at(1));
	});

	test("batch dedupe keys are stable across replays", async () => {
		inserted.length = 0;
		const samples = [
			{ at: at(0), appName: "Safari", title: "BCW", idleSec: 1, locked: false },
			{ at: at(1), appName: "Safari", title: "BCW", idleSec: 1, locked: false },
		];
		await ingestDesktopSamples("mac", "batch-3", samples, index);
		const first = inserted.map((r) => r.dedupeKey);
		await ingestDesktopSamples("mac", "batch-3", samples, index); // replay
		expect(inserted.slice(first.length).map((r) => r.dedupeKey)).toEqual(first);
		expect(IDLE_LIMIT_SECONDS).toBe(120);
	});
});
