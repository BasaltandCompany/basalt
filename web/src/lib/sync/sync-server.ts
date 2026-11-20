// Sync engine — server side. Kind→table map (the read side feeds /api/sync's
// row fetch; the write whitelist guards /api/tx). Kinds are registry kinds —
// adding a component to the registry + one entry here gives it sync presence.
//
// whitelist: null = read-only over the tx API. Mutations for that kind are
// workflows with side effects and stay on their endpoints — email threads
// mirror Gmail (archive/spam push labels), drafts autosave through the
// versioned PUT. This is the trust boundary: /api/tx applies ONLY whitelisted
// fields on whitelisted kinds.
import { eq, inArray } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "~/db";
import { emailOutbox, emailThreads, OUTREACH_STAGES, outreachProspects, projectStatus, projects } from "~/db/schema";

export type WireTx = {
	id: string;
	kind: string;
	rowId: string;
	op: "update" | "create" | "delete";
	changes?: Record<string, { from: unknown; to: unknown }>;
	row?: Record<string, unknown>;
};

export const SYNC_KINDS: Record<string, { table: PgTable; whitelist: readonly string[] | null }> = {
	"email-thread": { table: emailThreads, whitelist: null },
	"email-draft": { table: emailOutbox, whitelist: null },
	prospect: { table: outreachProspects, whitelist: ["stage", "nextActionAt"] },
	project: {
		table: projects,
		whitelist: ["name", "status", "startDate", "endDate", "notes", "hourlyRate", "fixedPrice", "monthlyCapHours"],
	},
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGE_SET: Set<string> = new Set(OUTREACH_STAGES);
const PROJECT_STATUS_SET: Set<string> = new Set(projectStatus.enumValues);

/** Pure trust-boundary check for one wire tx — error string or null. No DB. */
export function validateTx(input: unknown): string | null {
	if (typeof input !== "object" || input === null) return "tx must be an object";
	const tx = input as Partial<WireTx>;
	if (typeof tx.id !== "string" || !tx.id) return "tx.id required";
	if (typeof tx.rowId !== "string" || !UUID_RE.test(tx.rowId)) return "tx.rowId must be a uuid";
	const def = SYNC_KINDS[tx.kind ?? ""];
	if (!def) return `unknown kind: ${tx.kind}`;
	if (tx.op !== "update" && tx.op !== "create" && tx.op !== "delete") return `unknown op: ${tx.op}`;
	if (def.whitelist === null) return `kind ${tx.kind} is read-only over the tx API (workflow)`;
	if (tx.op === "update") {
		if (typeof tx.changes !== "object" || tx.changes === null || !Object.keys(tx.changes).length) return "update requires changes";
		for (const [field, change] of Object.entries(tx.changes)) {
			if (!def.whitelist.includes(field)) return `field ${field} not writable on ${tx.kind}`;
			if (typeof change !== "object" || change === null || !("to" in change)) return `change for ${field} missing "to"`;
		}
		if (tx.kind === "prospect") {
			const stage = tx.changes.stage?.to;
			if (stage !== undefined && (typeof stage !== "string" || !STAGE_SET.has(stage))) return `unknown stage: ${String(stage)}`;
		}
		if (tx.kind === "project") {
			const status = tx.changes.status?.to;
			if (status !== undefined && (typeof status !== "string" || !PROJECT_STATUS_SET.has(status))) return `unknown status: ${String(status)}`;
		}
	} else if (tx.op === "create") {
		if (typeof tx.row !== "object" || tx.row === null || typeof (tx.row as Record<string, unknown>).id !== "string") return "create requires row.id";
	} // delete: nothing more to check — delete-if-exists by uuid
	return null;
}


/** Apply validated txs inside ONE database transaction. Idempotent by
 *  construction: update = set values; create = insert-or-ignore (client
 *  supplied uuid — a replayed create can't duplicate); delete = no-op when
 *  gone. change_events triggers fire per row, so every other client sees the
 *  batch through its next poll. */
export async function applyTxs(
	txs: WireTx[],
): Promise<{ results: { id: string; ok: boolean; error?: string; row?: Record<string, unknown> }[] }> {
	const results: { id: string; ok: boolean; error?: string; row?: Record<string, unknown> }[] = [];
	await db.transaction(async (txdb) => {
		for (const tx of txs) {
			// biome-ignore lint/suspicious/noExplicitAny: generic registry tables —
			// drizzle's column access on PgTable needs the cast
			const table = SYNC_KINDS[tx.kind].table as any;
			if (tx.op === "update") {
				const set: Record<string, unknown> = {};
				for (const [field, change] of Object.entries(tx.changes ?? {})) set[field] = change.to;
				await txdb.update(table).set(set).where(eq(table.id, tx.rowId));
			} else if (tx.op === "create") {
				await txdb.insert(table).values(tx.row ?? {}).onConflictDoNothing({ target: table.id });
			} else {
				await txdb.delete(table).where(eq(table.id, tx.rowId));
			}
			const [row] = await txdb.select().from(table).where(eq(table.id, tx.rowId));
			results.push({ id: tx.id, ok: true, ...(row ? { row: row as Record<string, unknown> } : {}) });
		}
	});
	return { results };
}

/** table name → kinds (events carry raw table names; one table can back more
 *  than one kind — meetings are documents rows). /api/sync intersects this
 *  with the client's subscribed kinds before fetching rows. */
export function kindsForTable(tableName: string, subscribed: Set<string>): string[] {
	const kinds: string[] = [];
	for (const [kind, def] of Object.entries(SYNC_KINDS)) {
		if (subscribed.has(kind) && getTableName(def.table) === tableName) kinds.push(kind);
	}
	return kinds;
}

export async function fetchRowsForKinds(kind: string, rowIds: string[]): Promise<Record<string, unknown>[]> {
	const table = SYNC_KINDS[kind].table;
	// biome-ignore lint/suspicious/noExplicitAny: generic registry table column access
	const t = table as any;
	return db
		.select()
		.from(table)
		.where(inArray(t.id, rowIds)) as unknown as Promise<Record<string, unknown>[]>;
}
