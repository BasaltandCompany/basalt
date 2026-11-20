// Pure decisions for the transaction-based UI engine (pool merge rules, tx
// diffing, drain backoff, /api/sync poll reducer). Zero solid imports on
// purpose: solid's server build stubs reactivity, so bun tests import THIS
// module, never the store-wiring files (same split as live-merge.test.ts).
//
// Model (Linear-style): the pool is a synchronized subset of the server DB.
// Every interaction applies to the pool first (the UI is the source of truth
// for what it shows), is recorded as a reversible tx, and syncs in the
// background. The server stays the authority — change_events.id is the
// total-order sync id, conflicts resolve last-writer-wins.

export type PoolRow = Record<string, unknown>;

// ── tx guards ─────────────────────────────────────────────────────
// Fields a local tx has written but the server hasn't confirmed (or a poll
// hasn't echoed) yet. Remote rows never clobber them — createRemoteSync's
// dirty-field rule, generalized to the pool. After a tx syncs its guards
// convert to a short grace window: a poll that raced the write (fetch started
// before the commit landed) must not flash the row old→new. Versioned rows
// (email_outbox.version) get the stronger strictly-greater guard in
// mergeRowDecision; grace covers unversioned tables.
export type Guard = { to: unknown; until?: number }; // until = grace expiry (epoch ms)
export type GuardMap = Map<string, Guard>; // field → guard ("__row" = whole row, create/delete)
export type Overlay = Map<string, Map<string, GuardMap>>; // kind → rowId → guards

export const GUARD_GRACE_MS = 10_000;

/** Drop grace-expired guards (in place). Returns true when anything went. */
export function sweepGuards(overlay: Overlay, now: number = Date.now()): boolean {
	let swept = false;
	for (const [kind, rows] of overlay) {
		for (const [id, guards] of rows) {
			for (const [field, guard] of guards) {
				if (guard.until !== undefined && guard.until <= now) {
					guards.delete(field);
					swept = true;
				}
			}
			if (!guards.size) rows.delete(id);
		}
		if (!rows.size) overlay.delete(kind);
	}
	return swept;
}

/** Fields currently guarded for one row (pending or unexpired grace). */
export function guardedFields(overlay: Overlay, kind: string, id: string, now: number = Date.now()): Set<string> {
	const guards = overlay.get(kind)?.get(id);
	if (!guards) return new Set();
	sweepGuards(overlay, now);
	return new Set(guards.keys());
}

/** Row ids with any live guard for a kind (pending txs keep their rows alive
 *  in reconcile — the server hasn't confirmed or rejected the change yet). */
export function guardedRowIds(overlay: Overlay, kind: string, now: number = Date.now()): Set<string> {
	const rows = overlay.get(kind);
	if (!rows) return new Set();
	sweepGuards(overlay, now);
	return new Set(rows.keys());
}

/** An incoming value equal to a guard's `to` is the server echoing our own tx
 *  back — lift that guard so the field follows the server again. */
export function echoClearedFields(guards: GuardMap, incoming: PoolRow): string[] {
	const cleared: string[] = [];
	for (const [field, guard] of guards) {
		if (field === "__row") continue; // whole-row guards lift only on settle
		if (incoming[field] === guard.to) cleared.push(field);
	}
	return cleared;
}

// ── merge decision ─────────────────────────────────────────────────

export type MergeDecision = { action: "apply"; fields: string[] } | { action: "skip" };

/**
 * Which fields of `incoming` should overwrite `existing`.
 * - missing row → apply everything (seed path)
 * - versioned rows: strictly-greater versions only — a poll that raced a save
 *   delivers an equal-or-older version and must be ignored (#198's flicker,
 *   generalized from createRemoteSync)
 * - otherwise server-authoritative last-writer-wins, minus tx-guarded fields
 */
export function mergeRowDecision(existing: PoolRow | undefined, incoming: PoolRow, guarded: Set<string>): MergeDecision {
	if (!existing) return { action: "apply", fields: Object.keys(incoming) };
	const ev = existing.version;
	const iv = incoming.version;
	if (typeof ev === "number" && typeof iv === "number" && iv <= ev) return { action: "skip" };
	const fields = Object.keys(incoming).filter((f) => !guarded.has(f) && incoming[f] !== existing[f]);
	return fields.length ? { action: "apply", fields } : { action: "skip" };
}

/**
 * Pool row ids absent from a full-corpus ingest (the inbox-query revalidate
 * swaps the list wholesale today; reconcile reproduces that for the pool),
 * minus rows with live guards.
 */
export function removedIds(existingIds: string[], incomingIds: Iterable<string>, guarded: Set<string>): string[] {
	const fresh = new Set(incomingIds);
	return existingIds.filter((id) => !fresh.has(id) && !guarded.has(id));
}

// ── tx helpers ─────────────────────────────────────────────────────

export type TxChanges = Record<string, { from: unknown; to: unknown }>;

/** Snapshot diff for one tx: only fields the patch actually changes. */
export function diffChanges(row: PoolRow | undefined, patch: Record<string, unknown>): TxChanges {
	const changes: TxChanges = {};
	for (const [field, to] of Object.entries(patch)) {
		const from = row?.[field];
		if (from !== to) changes[field] = { from, to };
	}
	return changes;
}

/** Has the server already applied this tx? (Boot replay dedupe: the ack can
 *  be lost to a crash after the commit — replay must not double-apply.) */
export function txApplied(row: PoolRow | undefined, tx: { op: string; changes?: TxChanges }): boolean {
	if (tx.op === "delete") return !row;
	if (tx.op === "create") return !!row;
	if (!row) return false;
	return Object.entries(tx.changes ?? {}).every(([field, c]) => row[field] === c.to);
}

// ── drain backoff ──────────────────────────────────────────────────

/** 1s → 2s → 5s → 10s cap. */
export function nextBackoffMs(current: number): number {
	const steps = [1_000, 2_000, 5_000, 10_000];
	const i = steps.findIndex((s) => s > current);
	return steps[i === -1 ? steps.length - 1 : i];
}

// ── /api/sync poll reducer (same shape as live-queries applyPoll) ──

export type SyncPollResult =
	| { ok: true; last: number; truncate?: boolean; rowCount: number }
	| { ok: false };

/**
 * cursor === null (first poll after mount): sync to the head without merging —
 * the pages just seeded the pool from their own queries. truncate: the server
 * hit its event/row cap, so events were skipped — full refetch instead of a
 * silent gap. Errors keep the cursor; the next tick retries.
 */
export function syncPollDecision(
	cursor: number | null,
	res: SyncPollResult,
): { merge: boolean; refetchAll: boolean; next: number } {
	if (!res.ok) return { merge: false, refetchAll: false, next: cursor ?? 0 };
	if (cursor === null) return { merge: false, refetchAll: false, next: res.last };
	return { merge: res.rowCount > 0 && !res.truncate, refetchAll: !!res.truncate, next: res.last };
}
