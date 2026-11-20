# Transaction-based UI (Linear-style sync engine)

The admin's interaction model, migrated surfaces, and the guide for migrating
the rest. Linear's architecture, scoped to this codebase: an in-memory **object
pool** the UI reads from directly, and a **durable transaction queue** — every
interaction applies to the pool instantly (the UI never waits on the network),
persists to IndexedDB, and syncs to the server in the background. The server
stays the source of truth; `change_events.id` is the total-order sync id and
conflicts resolve last-writer-wins in server event order.

## The engine (`web/src/lib/sync/`)

| File | Job |
| --- | --- |
| `merge.ts` | Pure decisions: merge/version-guard rules, tx diffing, drain backoff, poll reducer. Zero solid imports so `bun test` can exercise it. |
| `pool.ts` | The object pool: `poolRows(kind)` / `poolRow(kind, id)` reactive reads keyed by registry kind + row id. Solid 2 draft-mutation writes. |
| `transactions.ts` | `transact(...)` — build tx, apply to pool, guard fields, queue, drain via `POST /api/tx`. Durable txs persist to IndexedDB and replay on boot; workflow txs (Gmail side effects) skip persistence. |
| `idb-queue.ts` | One IndexedDB store (`basalt-sync` → `txs`); memory fallback when unavailable. |
| `sync-client.ts` | Seeds the pool from page queries, polls `GET /api/sync` every 3s, merges remote rows, drives boot replay. |
| `sync-server.ts` | Kind→table map + per-kind field whitelist (the trust boundary) + pure `validateTx` + `applyTxs` (one `db.transaction()` per batch). |

Endpoints: `POST /api/tx` (writes, session-guarded, whitelisted fields only,
idempotent ops so replay can't double-apply) and `GET /api/sync?since=&kinds=`
(change events + changed rows; `truncate: true` forces a client refetch when
the backlog exceeds the cap). `GET /api/changes` + router `revalidate()` remain
the sync path for every unmigrated page.

### Merge rules

- Rows carrying a monotonic `version` (e.g. `email_outbox`) apply only
  strictly-greater versions — a poll that raced a save can't flash old→new
  (the #198 class, generalized from `createRemoteSync`).
- Other rows merge server-authoritatively **except** fields guarded by a
  pending tx. After a tx syncs, guards convert to a 10s grace window so a
  stale poll can't clobber a just-accepted value on unversioned tables.
- Incoming values equal to a guard's `to` lift the guard (the server echoed
  our own change back).
- Full-corpus ingests reconcile (rows that left the server list are dropped);
  tx-guarded rows are never dropped mid-flight.

### Using it on a page

```ts
import { ingestKind } from "~/lib/sync/sync-client";
import { transact } from "~/lib/sync/transactions";
import { poolRow, poolRows, poolSeeded } from "~/lib/sync/pool";
import type { PoolRow } from "~/lib/sync/merge";

// seed/merge in a two-arg createEffect (Solid 2) tracking the query data
createEffect(
	() => inbox(),
	(data) => {
		if (!data) return;
		ingestKind("email-thread", data.threads as unknown as PoolRow[], {
			reconcile: true, // full corpus? reconcile; filtered subsets: false
			refetch: () => void revalidate("email-inbox"), // truncate recovery
		});
	},
);

// render from the pool once seeded (query data still covers SSR)
const rows = () => (poolSeeded("email-thread") ? poolRows<EmailThread>("email-thread") : inbox()?.threads ?? []);

// every interaction is one transaction — optimistic pool write, server sync,
// automatic revert + toast on failure
await transact({ kind: "prospect", rowId: id, patch: { stage: "sent" }, label: "Stage change" });

// side-effectful ops (Gmail mirroring etc.) use a workflow commit instead:
await transact({
	kind: "email-thread",
	rowId: id,
	patch: { archived: true },
	commit: () => fetch(`/api/email/threads/${id}`, { method: "POST", body: JSON.stringify({ op: "archive" }) }),
});
```

New server-write paths need an entry in `SYNC_KINDS` (`web/src/lib/sync/sync-server.ts`)
with an explicit field whitelist — that whitelist IS the API. `whitelist: null`
marks a kind read-only over the tx API (workflows only).

## Migrated (this branch)

- **Email** — inbox triage (done/unread/spam/delete, V-range bulk ops, open-marks-read)
  via the pool + workflow txs; hand-rolled `hiddenIds`/`readOverride` deleted.
  Drafts, send, schedule, unsubscribe keep their existing flows.
- **Outreach** — drag-to-stage and advance-with-preset are txs (pure /api/tx
  path; `nextActionAt` preset computed client-side via `STAGE_NEXT_DAYS`);
  the `overrides` signal deleted.
- **Projects** — index list renders from the pool; detail status select and
  edit-dialog fields (name/rates/cap/dates/notes) are txs; company and
  engagement-type changes keep the action (FK + enum wiring).

## Rollout guide: the rest of admin + client portal

Migrate one surface per PR, in wave order. Every migration is the same three
moves: (1) seed the pool from the surface's existing query, (2) switch list
reads to the pool, (3) replace whitelisted mutations with `transact()`,
deleting that surface's hand-rolled optimistic signals in the same PR — never
two sources of truth. Definition of done: zero spinner on interaction,
offline interaction queues, no flicker when the tx echoes back, `bun run test`
covers the surface's tx shapes.

**Wave 1 — kanban/list CRUD:** Funnels (stage moves like Outreach), Campaigns,
Videos, Companies, Contacts.

**Wave 2 — metadata around editors:** Docs, Posts, Newsletters, Email drafts.
Rule: the Lexical/text editor keeps its autosave + `createRemoteSync` version
flow untouched; only row-level fields (status, title, publish state,
assignments, list pages) become txs. Editors graduate to debounced per-field
txs only after a full release proves the overlay merge.

**Wave 3 — quotes and money (highest caution):** line-item edits as txs with
totals recomputed optimistically client-side and authoritatively server-side
in the same DB transaction. **Never txs:** signature capture, approval, send —
legal-weight workflows stay actions.

**Wave 4 — admin utilities:** Links, Secure shares, API keys (create/revoke),
OAuth apps, Meetings (triage like email), GitHub App config, Lead-magnet
requests (approve/deny), Brain + Dashboard (read-mostly; txs only where a
mutation exists).

**Wave 5 — client portal (do last, different trust boundary):** documents,
invoices, quotes (view/approve), value, api-keys. Portal txs must NOT share
the admin guard: add a portal-session auth mode to `POST /api/tx` with a
row-ownership check (member belongs to the row's company) and a separate,
tighter whitelist per kind (a client can mark an invoice seen, never change
amounts). Unknown-row failures return 404, not 403 — don't leak existence.
Pilot: quote approval status display + invoice acknowledgment. Signature flow
stays a workflow forever. Consider a longer poll interval for portals.

**Standing rules for every migration:**

- Anything with Gmail/webhook/payment side effects (send, sync, publish,
  charge) stays an action/workflow — the UI records *state* via txs; the
  workflow commit override covers the optimistic UX.
- Tables without a `version` column rely on tx guards + grace; add a
  `version` column (drizzle-generated) only if a flicker class like #198's
  shows up on that surface.
- Multi-row operations (V-range macros, bulk archive) are N txs in one batch,
  not a bespoke bulk endpoint.

## Tests

`cd web && bun run test` — `src/lib/sync/*.test.ts` cover the pure layer:
merge/version-guard decisions, tx guard lifecycle, reconcile, `validateTx`
(whitelist + value checks), drain backoff, sync poll reducer.
