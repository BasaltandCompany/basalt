// Sync client — the read half of the engine. Pages seed the pool from their
// existing server queries (ingestKind); this module subscribes those kinds
// and polls GET /api/sync every 3s while the tab is visible, merging changed
// rows into the pool. Same total-order cursor discipline as the legacy
// /api/changes poll (live-queries.ts), which still serves unmigrated pages.
import { syncPollDecision, type PoolRow } from "./merge";
import { ingestKind as poolIngest, mergeIntoPool, poolSeeded } from "./pool";
import { bootSyncQueue, kickDrain } from "./transactions";

const POLL_MS = 3_000; // knob: same cadence as the legacy live poll

const subscribed = new Map<string, () => void>(); // kind → full refetch (truncate recovery)
let cursor: number | null = null;
let inFlight = false;
let started = false;

/**
 * Pages call this in an effect tracking their query data. First call seeds
 * the pool and registers `refetch` as the kind's truncate recovery; later
 * calls merge (guards + version rules in pool.ts). A pending tx replayed from
 * IndexedDB re-applies over a first seed so a fresh page load can't erase
 * locally-pending changes.
 */
export function ingestKind(
	kind: string,
	rows: PoolRow[] | undefined | null,
	opts: { reconcile?: boolean; refetch?: () => void } = {},
): void {
	const wasSeeded = poolSeeded(kind);
	poolIngest(kind, rows, opts);
	if (opts.refetch && !subscribed.has(kind)) subscribed.set(kind, opts.refetch);
	if (!wasSeeded && poolSeeded(kind)) start();
}

async function poll(): Promise<void> {
	if (inFlight || document.hidden || subscribed.size === 0) return;
	inFlight = true;
	try {
		const res = await fetch(`/api/sync?since=${cursor ?? 0}&kinds=${encodeURIComponent([...subscribed.keys()].join(","))}`);
		const body = res.ok ? ((await res.json()) as { last: number; truncate?: boolean; rows?: { kind: string; row: PoolRow }[] }) : null;
		const decision = syncPollDecision(cursor, body ? { ok: true, last: body.last, truncate: body.truncate, rowCount: body.rows?.length ?? 0 } : { ok: false });
		cursor = decision.next;
		if (decision.refetchAll) {
			for (const refetch of subscribed.values()) refetch(); // page effects re-ingest
		} else if (decision.merge) {
			for (const { kind, row } of body!.rows ?? []) mergeIntoPool(kind, [row], false);
		}
	} catch {
		// endpoint down / network gone — pages keep working; next tick retries
	} finally {
		inFlight = false;
	}
}

function start(): void {
	if (started || typeof window === "undefined") return;
	started = true;
	void bootSyncQueue(); // replay durable pending txs from IndexedDB
	void poll();
	setInterval(() => void poll(), POLL_MS);
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) {
			void poll(); // covers iOS PWA resume + missed polls while hidden
			kickDrain(); // queue drain retries too
		}
	});
}
