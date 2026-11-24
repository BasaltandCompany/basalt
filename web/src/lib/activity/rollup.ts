// Rollup + merge engine (ASPTR-227). Pure functions over already-loaded
// event rows — the queries layer fetches, this decides. Rules:
//   1. Never double-count: overlapping events attribute each instant to the
//      highest-confidence covering event (manual > exact > prompted > inferred).
//   2. OS truth beats web truth: heartbeat spans clip to desktop coverage
//      when the sampler was running nearby on the same device.
//   3. Mutations are point events stored as fixed 5-minute spans; the merge
//      above deduplicates them against longer spans.
import type { ActivityConfidence, ActivityEvent } from "~/db/schema";
import type { Bucket } from "./match";

const WEIGHT: Record<ActivityConfidence, number> = { manual: 4, exact: 3, prompted: 2, inferred: 1 };

/** 5-minute credit for a single mutation (email sent, doc saved). */
export const MUTATION_MINUTES = 5;

export type Segment = { start: number; end: number; bucket: Bucket };

export type MergeEvent = {
	id: string;
	startedAt: Date | string;
	endedAt: Date | string;
	source: ActivityEvent["source"];
	confidence: ActivityConfidence;
	projectId: string | null;
	category: ActivityEvent["category"];
	deviceId: string | null;
};

const ms = (t: Date | string) => new Date(t).getTime();

export const bucketKey = (b: Bucket): string | null =>
	b === null ? null : "projectId" in b ? `p:${b.projectId}` : `c:${b.category}`;

/** Clip heartbeat spans to desktop coverage: OS truth beats web truth. A
 * heartbeat span keeps only its intersection with (desktop spans +2min) on
 * the same device, but ONLY if desktop data exists near it — a missing
 * sampler (other machine, app quit) must not erase the whole span. */
export function clipHeartbeats(events: MergeEvent[]): MergeEvent[] {
	const desktop = events.filter((e) => e.source === "desktop");
	return events.map((e) => {
		if (e.source !== "app_heartbeat") return e;
		const start = ms(e.startedAt);
		const end = ms(e.endedAt);
		// sampler coverage on this device within ±10 min of the span?
		const near = desktop.filter(
			(d) => d.deviceId === e.deviceId && ms(d.endedAt) >= start - 10 * 60_000 && ms(d.startedAt) <= end + 10 * 60_000,
		);
		if (near.length === 0) return e;
		// union of near desktop spans expanded 2 min, intersected with the span
		const ranges: [number, number][] = [];
		for (const d of near.sort((a, b) => ms(a.startedAt) - ms(b.startedAt))) {
			const s = Math.max(start, ms(d.startedAt) - 2 * 60_000);
			const en = Math.min(end, ms(d.endedAt) + 2 * 60_000);
			const last = ranges[ranges.length - 1];
			if (last && s <= last[1]) last[1] = Math.max(last[1], en);
			else ranges.push([s, en]);
		}
		const kept = ranges.filter(([s, en]) => en > s);
		if (kept.length === 0) return null;
		// longest surviving range wins; a heartbeat split by an idle gap is
		// really two blocks, and the rollup only needs the hours.
		const [s, en] = kept.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
		return { ...e, startedAt: new Date(s), endedAt: new Date(en) };
	}).filter((e): e is MergeEvent => e !== null);
}

/** Sweep overlapping events into attributed segments. Zero double-count:
 * every instant goes to exactly one bucket — the highest-weight cover. */
export function mergeToSegments(events: MergeEvent[]): Segment[] {
	if (events.length === 0) return [];
	const boundaries = new Set<number>();
	for (const e of events) {
		boundaries.add(ms(e.startedAt));
		boundaries.add(ms(e.endedAt));
	}
	const points = [...boundaries].sort((a, b) => a - b);
	const segments: Segment[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const start = points[i];
		const end = points[i + 1];
		if (end <= start) continue;
		let best: { weight: number; bucket: Bucket } | null = null;
		for (const e of events) {
			if (ms(e.startedAt) > start || ms(e.endedAt) < end) continue;
			const weight = WEIGHT[e.confidence];
			if (!best || weight > best.weight) best = { weight, bucket: e.projectId ? { projectId: e.projectId } : e.category ? { category: e.category } : null };
		}
		if (!best) continue;
		const key = bucketKey(best.bucket);
		const prev = segments[segments.length - 1];
		if (prev && prev.end === start && bucketKey(prev.bucket) === key) prev.end = end;
		else segments.push({ start, end, bucket: best.bucket });
	}
	return segments;
}

export type BucketTotals = { ms: number; segments: number };

/** Merged milliseconds per bucket key. */
export function bucketTotals(segments: Segment[]): Map<string, BucketTotals> {
	const totals = new Map<string, BucketTotals>();
	for (const s of segments) {
		const key = bucketKey(s.bucket) ?? "unassigned";
		const t = totals.get(key) ?? { ms: 0, segments: 0 };
		t.ms += s.end - s.start;
		t.segments += 1;
		totals.set(key, t);
	}
	return totals;
}

export const msToHours = (ms: number): number => Math.round((ms / 3_600_000) * 100) / 100;

/** Week window (Mon 00:00 local) containing `date`, plus the n-th offset week. */
export function weekWindow(date: Date, offsetWeeks = 0): { start: Date; end: Date } {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offsetWeeks * 7);
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	return { start, end };
}
