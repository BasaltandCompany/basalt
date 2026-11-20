// Object pool — the client-side subset of the server DB the migrated admin
// surfaces read from directly. Seeded from existing server queries (SSR
// output unchanged), then kept fresh by the /api/sync poll (sync-client).
// Interactions write here FIRST via the tx queue (transactions.ts) — the pool
// is what the UI renders, so it reflects an interaction before any network
// round trip; the server reconciles underneath.
//
// Pure merge rules live in ./merge (bun-testable); this file is the thin
// Solid-store wiring around them. Solid 2 stores mutate via a draft function
// (set(state => …)), so every write below is computed read-only first, then
// applied inside one draft mutation.
import { createStore } from "solid-js";
import {
	echoClearedFields,
	guardedFields,
	guardedRowIds,
	GUARD_GRACE_MS,
	mergeRowDecision,
	removedIds,
	sweepGuards,
	type Guard,
	type GuardMap,
	type Overlay,
	type PoolRow,
	type TxChanges,
} from "./merge";

const [pool, setPool] = createStore<Record<string, Record<string, PoolRow>>>({});
const overlay: Overlay = new Map();

export function poolSeeded(kind: string): boolean {
	return !!pool[kind];
}

export function poolRows<T = PoolRow>(kind: string): T[] {
	return Object.values(pool[kind] ?? {}) as T[];
}

export function poolRow<T = PoolRow>(kind: string, id: string): T | undefined {
	return pool[kind]?.[id] as T | undefined;
}

/**
 * Feed one kind from its server query. First non-empty call seeds (replaces —
 * pool empty until then, so pages fall back to query data for SSR); later
 * calls merge under the guard/version rules. reconcile reproduces today's
 * wholesale-list-swap for full-corpus ingests (search-filtered ingests pass
 * reconcile: false — they're a subset).
 */
export function ingestKind(kind: string, rows: PoolRow[] | undefined | null, opts: { reconcile?: boolean } = {}): void {
	if (!rows) return;
	if (!poolSeeded(kind)) {
		setPool((draft) => {
			const map: Record<string, PoolRow> = {};
			for (const row of rows) map[String(row.id)] = row;
			draft[kind] = map;
		});
	} else {
		mergeIntoPool(kind, rows, opts.reconcile ?? false);
	}
}

// internal merge + reconcile (used by ingestKind and by sync-client for poll rows)
export function mergeIntoPool(kind: string, rows: PoolRow[], resync: boolean): void {
	const now = Date.now();
	sweepGuards(overlay, now);
	const writes: { id: string; field: string; value: unknown }[] = [];
	for (const row of rows) {
		const id = String(row.id);
		const guards = overlay.get(kind)?.get(id);
		if (guards?.has("__row")) continue; // create/delete tx in flight — the row is ours until it settles
		if (guards) {
			for (const field of echoClearedFields(guards, row)) guards.delete(field);
			if (!guards.size) overlay.get(kind)!.delete(id);
		}
		const decision = mergeRowDecision(poolRow(kind, id), row, guardedFields(overlay, kind, id, now));
		if (decision.action !== "apply") continue;
		for (const field of decision.fields) writes.push({ id, field, value: row[field] });
	}
	const drop = resync ? removedIds(Object.keys(pool[kind] ?? {}), rows.map((r) => String(r.id)), guardedRowIds(overlay, kind, now)) : [];
	setPool((draft) => {
		const map = draft[kind];
		if (!map) return;
		for (const w of writes) {
			const row = (map[w.id] ??= { id: w.id });
			row[w.field] = w.value;
		}
		for (const id of drop) delete map[id];
	});
}

// ── tx application (called by transactions.ts) ────────────────────

/** Optimistic half of a tx: write the change into the pool so the UI shows it
 *  now. update = set fields; create = insert row; delete = remove row. */
export function applyTxToPool(tx: { kind: string; rowId: string; op: string; changes?: TxChanges; row?: PoolRow }): void {
	setPool((draft) => {
		const map = (draft[tx.kind] ??= {});
		if (tx.op === "update") {
			const row = (map[tx.rowId] ??= { id: tx.rowId });
			for (const [field, change] of Object.entries(tx.changes ?? {})) row[field] = change.to;
		} else if (tx.op === "create" && tx.row) {
			map[tx.rowId] = { ...tx.row };
		} else if (tx.op === "delete") {
			delete map[tx.rowId];
		}
	});
}

/** Roll the pool back when the server rejects a tx — `from` values restore
 *  updates, snapshots restore creates/deletes. */
export function revertTxInPool(tx: { kind: string; rowId: string; op: string; changes?: TxChanges; row?: PoolRow }): void {
	setPool((draft) => {
		const map = (draft[tx.kind] ??= {});
		if (tx.op === "update") {
			const row = (map[tx.rowId] ??= { id: tx.rowId });
			for (const [field, change] of Object.entries(tx.changes ?? {})) row[field] = change.from;
		} else if (tx.op === "create") {
			delete map[tx.rowId];
		} else if (tx.op === "delete" && tx.row) {
			map[tx.rowId] = { ...tx.row };
		}
	});
}

function guardsFor(kind: string, id: string): GuardMap {
	let rows = overlay.get(kind);
	if (!rows) {
		rows = new Map();
		overlay.set(kind, rows);
	}
	let guards = rows.get(id);
	if (!guards) {
		guards = new Map();
		rows.set(id, guards);
	}
	return guards;
}

/** Guard a tx's fields/row while it's pending. */
export function guardTx(tx: { kind: string; rowId: string; op: string; changes?: TxChanges }): void {
	const guards = guardsFor(tx.kind, tx.rowId);
	if (tx.op !== "update") {
		guards.set("__row", { to: tx.op });
		return;
	}
	for (const [field, change] of Object.entries(tx.changes ?? {})) guards.set(field, { to: change.to });
}

/** Convert a synced tx's guards to grace (the echo may still be in flight), or
 *  drop them entirely (failed — the pool was reverted, nothing to guard). */
export function settleTxGuards(tx: { kind: string; rowId: string; op: string; changes?: TxChanges }, synced: boolean): void {
	const guards = overlay.get(tx.kind)?.get(tx.rowId);
	if (!guards) return;
	if (!synced) {
		overlay.get(tx.kind)!.delete(tx.rowId);
		return;
	}
	const until = Date.now() + GUARD_GRACE_MS;
	if (guards.has("__row")) {
		guards.set("__row", { to: guards.get("__row")!.to, until });
		return;
	}
	for (const [field, guard] of guards) guards.set(field, { to: guard.to, until } satisfies Guard);
}

export function hasLiveGuards(kind: string, id: string): boolean {
	return guardedFields(overlay, kind, id).size > 0;
}
