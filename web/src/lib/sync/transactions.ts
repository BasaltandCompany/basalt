// Transaction queue — the write half of the engine. Every interaction builds
// a reversible Tx: apply to the pool instantly (UI updates before any
// network), guard its fields against incoming remote rows, queue, and sync in
// the background. Durable txs persist to IndexedDB (survive refresh/offline,
// replay on boot); workflow txs (Gmail side effects — archive/spam/etc.) skip
// persistence and replay: a queued HTTP POST to Gmail is not safe to retry.
//
// Server path: POST /api/tx applies the batch inside one db.transaction().
// Ops are idempotent by construction (set values / upsert-by-uuid /
// delete-if-exists) so a lost ack can't double-apply on replay.
import { createStore } from "solid-js";
import { diffChanges, nextBackoffMs, txApplied, type PoolRow, type TxChanges } from "./merge";
import { applyTxToPool, guardTx, poolRow, revertTxInPool, settleTxGuards } from "./pool";
import { idbQueue } from "./idb-queue";
import { toast } from "~/lib/toast";

export type TxStatus = "pending" | "synced" | "failed";

export type Tx = {
	id: string;
	kind: string;
	rowId: string;
	op: "update" | "create" | "delete";
	changes?: TxChanges; // update: field → { from, to }
	row?: PoolRow; // create: the row; delete: snapshot for rollback
	status: TxStatus;
	createdAt: number;
	durable: boolean; // false = workflow commit — no IndexedDB, no /api/tx replay
	label?: string;
	error?: string;
};

export type WireTx = Pick<Tx, "id" | "kind" | "rowId" | "op"> & {
	changes?: TxChanges;
	row?: PoolRow;
};

const [txStore, setTxStore] = createStore<Record<string, Tx>>({});
const queue: string[] = []; // durable pending tx ids, FIFO
const waiters = new Map<string, (outcome: "synced" | "failed") => void>();
let draining = false;
let backoff = 0;
let booted = false;

export function pendingCount(kind?: string): number {
	return queue.filter((id) => !kind || txStore[id]?.kind === kind).length;
}

/**
 * One UI interaction = one transaction. Applies the patch to the pool
 * immediately and resolves "synced"|"failed" after the server round trip.
 * - update: `patch` — only fields that actually change the row (a no-op patch
 *   resolves immediately without a round trip)
 * - create: `row` (client-generated uuid id — replay-safe upsert)
 * - delete: op: "delete" (snapshot taken from the pool)
 * - `commit`: workflow override (side-effectful endpoints, e.g. Gmail ops) —
 *   the tx never hits /api/tx or IndexedDB
 * Failure reverts the pool, toasts, and resolves "failed".
 */
export function transact(opts: {
	kind: string;
	rowId: string;
	patch?: Record<string, unknown>;
	row?: PoolRow;
	op?: "update" | "create" | "delete";
	commit?: (wire: WireTx) => Promise<Response>;
	label?: string;
}): Promise<"synced" | "failed"> {
	const op = opts.op ?? (opts.row ? "create" : "update");
	const changes = op === "update" ? diffChanges(poolRow(opts.kind, opts.rowId), opts.patch ?? {}) : undefined;
	if (op === "update" && Object.keys(changes ?? {}).length === 0) return Promise.resolve("synced");

	const durable = !opts.commit;
	const tx: Tx = {
		id: crypto.randomUUID(),
		kind: opts.kind,
		rowId: opts.rowId,
		op,
		...(changes ? { changes } : {}),
		...(op === "create" && opts.row ? { row: opts.row } : {}),
		...(op === "delete" ? { row: poolRow(opts.kind, opts.rowId) } : {}),
		status: "pending",
		createdAt: Date.now(),
		durable,
		...(opts.label ? { label: opts.label } : {}),
	};

	setTxStore((draft) => {
		draft[tx.id] = tx;
	});
	applyTxToPool(tx);
	guardTx(tx);
	waiters.set(tx.id, () => {});

	if (durable) {
		void idbQueue.put(tx);
		queue.push(tx.id);
		kickDrain();
	} else {
		// workflow commit — fire immediately, the pool already shows it
		void opts
			.commit!(toWire(tx))
			.then(async (res) => {
				if (!res.ok) {
					const body = (await res.json().catch(() => ({}))) as { error?: string };
					settle(tx, false, body.error ?? `HTTP ${res.status}`);
					return;
				}
				settle(tx, true);
			})
			.catch((e: unknown) => settle(tx, false, e instanceof Error ? e.message : String(e)));
	}

	return new Promise((resolve) => {
		waiters.set(tx.id, resolve);
	});
}

function toWire(tx: Tx): WireTx {
	return {
		id: tx.id,
		kind: tx.kind,
		rowId: tx.rowId,
		op: tx.op,
		...(tx.changes ? { changes: tx.changes } : {}),
		...(tx.row ? { row: tx.row } : {}),
	};
}

export function kickDrain(): void {
	void drain();
}

async function drain(): Promise<void> {
	if (draining || !queue.some((id) => txStore[id]?.status === "pending")) return;
	draining = true;
	try {
		const batch = queue.map((id) => txStore[id]).filter((tx) => tx?.durable && tx.status === "pending");
		const res = await fetch("/api/tx", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ txs: batch.map(toWire) }),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const { results } = (await res.json()) as { results: { id: string; ok: boolean; error?: string }[] };
		for (const result of results) {
			const tx = txStore[result.id];
			if (tx?.status === "pending") settle(tx, result.ok, result.error);
		}
		backoff = 0;
		draining = false;
		kickIfPending();
	} catch {
		// network down / endpoint error — keep the batch queued, retry on backoff,
		// visibility, and online (the pool keeps showing the optimistic values)
		backoff = nextBackoffMs(backoff);
		const wait = backoff;
		setTimeout(() => {
			draining = false;
			kickDrain();
		}, wait);
	}
}

function kickIfPending(): void {
	if (queue.some((id) => txStore[id]?.status === "pending")) kickDrain();
}

function settle(tx: Tx, synced: boolean, error?: string): void {
	const i = queue.indexOf(tx.id);
	if (i !== -1) queue.splice(i, 1);
	setTxStore((draft) => {
		draft[tx.id].status = synced ? "synced" : "failed";
		if (error) draft[tx.id].error = error;
	});
	settleTxGuards(tx, synced);
	if (synced) {
		if (tx.durable) void idbQueue.remove(tx.id);
	} else {
		revertTxInPool(tx);
		toast(`${tx.label ?? "Change"} failed: ${error ?? "rejected"}`, "error");
	}
	waiters.get(tx.id)?.(synced ? "synced" : "failed");
	waiters.delete(tx.id);
}

/** Boot replay: pending durable txs from IndexedDB. If the server already
 *  applied one (ack lost to a crash), it settles instead of re-sending;
 *  otherwise it re-enters the queue. Pool guards are re-asserted per kind on
 *  seed (replayForKind) — the fresh seed must not wipe in-flight changes. */
export async function bootSyncQueue(): Promise<void> {
	if (booted || typeof window === "undefined") return;
	booted = true;
	const saved = await idbQueue.all().catch(() => []);
	for (const raw of saved) {
		const tx = raw as Tx;
		if (!tx?.id || txStore[tx.id] || tx.status !== "pending") continue;
		if (txApplied(poolRow(tx.kind, tx.rowId), tx)) {
			setTxStore((draft) => {
				draft[tx.id] = tx;
			});
			settle(tx, true);
			continue;
		}
		setTxStore((draft) => {
			draft[tx.id] = tx;
		});
		applyTxToPool(tx);
		queue.push(tx.id);
	}
	kickDrain();
}

/** A page just seeded `kind` — replay any pending txs for it so the seed
 *  (server state) doesn't erase locally-pending changes from a previous tab
 *  session. Called from sync-client's ingestKind. */
export function replayForKind(kind: string): void {
	for (const tx of Object.values(txStore)) {
		if (tx.kind !== kind || tx.status !== "pending") continue;
		if (!poolRow(kind, tx.rowId) && tx.op === "update") continue; // row gone server-side; drain will resolve it
		applyTxToPool(tx);
		guardTx(tx);
	}
	kickDrain();
}

// retry hooks: network back, tab visible again
if (typeof window !== "undefined") {
	window.addEventListener("online", kickDrain);
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) kickDrain();
	});
}
