import { describe, expect, test } from "bun:test";
import { bucketTotals, clipHeartbeats, mergeToSegments, msToHours, weekWindow, type MergeEvent } from "./rollup";

const ev = (over: Partial<MergeEvent> & Pick<MergeEvent, "startedAt" | "endedAt">): MergeEvent => ({
	id: over.id ?? Math.random().toString(36).slice(2),
	source: over.source ?? "desktop",
	confidence: over.confidence ?? "inferred",
	projectId: over.projectId ?? null,
	category: over.category ?? null,
	deviceId: over.deviceId ?? "mac",
	...over,
});

describe("mergeToSegments — no double-count", () => {
	test("overlapping events attribute each instant once, to the highest confidence", () => {
		const segs = mergeToSegments([
			ev({ startedAt: "2026-11-23T10:00:00", endedAt: "2026-11-23T11:00:00", projectId: "A", confidence: "inferred" }),
			ev({ startedAt: "2026-11-23T10:15:00", endedAt: "2026-11-23T10:45:00", projectId: "B", confidence: "exact" }),
		]);
		const a = bucketTotals(segs).get("p:A");
		const b = bucketTotals(segs).get("p:B");
		expect(msToHours(a!.ms)).toBe(0.5); // 10:00-10:15 + 10:45-11:00
		expect(msToHours(b!.ms)).toBe(0.5); // 10:15-10:45 (exact wins its overlap)
	});
	test("manual answer beats everything, including exact", () => {
		const segs = mergeToSegments([
			ev({ startedAt: "2026-11-23T10:00:00", endedAt: "2026-11-23T11:00:00", projectId: "B", confidence: "exact" }),
			ev({ startedAt: "2026-11-23T10:10:00", endedAt: "2026-11-23T10:20:00", projectId: "A", confidence: "manual" }),
		]);
		expect(msToHours(bucketTotals(segs).get("p:A")!.ms)).toBeCloseTo(1 / 6, 2);
		expect(msToHours(bucketTotals(segs).get("p:B")!.ms)).toBeCloseTo(5 / 6, 2);
	});
	test("contiguous same-bucket segments merge into one", () => {
		const segs = mergeToSegments([
			ev({ startedAt: "2026-11-23T10:00:00", endedAt: "2026-11-23T10:30:00", projectId: "A" }),
			ev({ startedAt: "2026-11-23T10:30:00", endedAt: "2026-11-23T11:00:00", projectId: "A" }),
		]);
		expect(segs).toHaveLength(1);
		expect(msToHours(segs[0]!.end - segs[0]!.start)).toBe(1);
	});
	test("unassigned is a bucket like any other", () => {
		const segs = mergeToSegments([ev({ startedAt: "2026-11-23T09:00:00", endedAt: "2026-11-23T10:00:00" })]);
		expect(bucketTotals(segs).get("unassigned")!.ms).toBe(3_600_000);
	});
});

describe("clipHeartbeats — OS truth beats web truth", () => {
	const day = "2026-11-23T";
	test("heartbeat extending past desktop clips to coverage ±2min", () => {
		const out = clipHeartbeats([
			ev({ startedAt: `${day}10:00:00`, endedAt: `${day}10:40:00`, source: "desktop", deviceId: "mac" }),
			ev({ startedAt: `${day}10:05:00`, endedAt: `${day}11:00:00`, source: "app_heartbeat", projectId: "A", confidence: "exact", deviceId: "mac" }),
		]);
		const hb = out.find((e) => e.source === "app_heartbeat")!;
		expect(new Date(hb.endedAt).getMinutes()).toBe(42); // desktop end 10:40 + 2min grace
		expect(new Date(hb.startedAt).getMinutes()).toBe(5);
	});
	test("heartbeat starting before desktop clips to coverage −2min", () => {
		const out = clipHeartbeats([
			ev({ startedAt: `${day}10:00:00`, endedAt: `${day}10:40:00`, source: "desktop", deviceId: "mac" }),
			ev({ startedAt: `${day}09:00:00`, endedAt: `${day}10:35:00`, source: "app_heartbeat", projectId: "A", confidence: "exact", deviceId: "mac" }),
		]);
		const hb = out.find((e) => e.source === "app_heartbeat")!;
		expect(new Date(hb.startedAt).getMinutes()).toBe(58); // desktop start 10:00 − 2min grace
	});
	test("no sampler running nearby → heartbeat survives whole", () => {
		const out = clipHeartbeats([ev({ startedAt: `${day}10:05:00`, endedAt: `${day}10:35:00`, source: "app_heartbeat", projectId: "A" })]);
		expect(new Date(out[0]!.endedAt).getMinutes()).toBe(35);
	});
	test("desktop on another device does not clip", () => {
		const out = clipHeartbeats([
			ev({ startedAt: `${day}10:00:00`, endedAt: `${day}10:40:00`, source: "desktop", deviceId: "other-mac" }),
			ev({ startedAt: `${day}10:05:00`, endedAt: `${day}10:35:00`, source: "app_heartbeat", projectId: "A", deviceId: "mac" }),
		]);
		const hb = out.find((e) => e.source === "app_heartbeat")!;
		expect(new Date(hb.endedAt).getMinutes()).toBe(35);
	});
	test("heartbeat with desktop running but no coverage is dropped (idle gap)", () => {
		const out = clipHeartbeats([
			ev({ startedAt: `${day}11:50:00`, endedAt: `${day}11:55:00`, source: "desktop", deviceId: "mac" }),
			ev({ startedAt: `${day}13:05:00`, endedAt: `${day}13:10:00`, source: "desktop", deviceId: "mac" }),
			ev({ startedAt: `${day}12:00:00`, endedAt: `${day}13:00:00`, source: "app_heartbeat", projectId: "A", confidence: "exact", deviceId: "mac" }),
		]);
		expect(out.filter((e) => e.source === "app_heartbeat")).toHaveLength(0);
	});
});

describe("week window", () => {
	test("starts Monday 00:00 and spans 7 days", () => {
		const { start, end } = weekWindow(new Date("2026-11-25T15:00:00")); // Wednesday
		expect(start.getDay()).toBe(1);
		expect(start.getDate()).toBe(23); // Mon Nov 23
		expect((end.getTime() - start.getTime()) / 86_400_000).toBe(7);
	});
	test("offset weeks move the window", () => {
		const thisWeek = weekWindow(new Date("2026-11-25T15:00:00"));
		const last = weekWindow(new Date("2026-11-25T15:00:00"), -1);
		expect((thisWeek.start.getTime() - last.start.getTime()) / 86_400_000).toBe(7);
	});
});
