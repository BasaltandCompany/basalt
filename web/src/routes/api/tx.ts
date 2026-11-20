// POST /api/tx — the engine's write path. Body { txs: WireTx[] }; each tx is
// validated against the per-kind field whitelist (sync-server.validateTx —
// the trust boundary), then all valid txs apply inside ONE db.transaction().
// Invalid txs come back as per-id errors (client reverts + toasts); a DB
// failure 500s the whole batch (client keeps the txs queued and retries).
// Session-guarded like /api/changes. Portal members have no admin session —
// they fail closed here (portal txs are later PRs with their own guard).
import type { APIEvent } from "filesystem-routing/api";
import { getCurrentUser } from "~/lib/session";
import { applyTxs, validateTx, type WireTx } from "~/lib/sync/sync-server";

const MAX_BATCH = 200;

export const POST = async (event: APIEvent) => {
	if ((await getCurrentUser()) === null) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
	}
	const body = (await event.request.json().catch(() => null)) as { txs?: unknown[] } | null;
	const inputs = Array.isArray(body?.txs) ? body!.txs : [];
	if (!inputs.length || inputs.length > MAX_BATCH) {
		return new Response(JSON.stringify({ error: `txs required (1–${MAX_BATCH})` }), { status: 400, headers: { "Content-Type": "application/json" } });
	}

	const results: { id: string; ok: boolean; error?: string }[] = [];
	const valid: WireTx[] = [];
	for (const input of inputs) {
		const error = validateTx(input);
		if (error) results.push({ id: (input as { id?: string })?.id ?? "?", ok: false, error });
		else valid.push(input as WireTx);
	}

	if (valid.length) {
		try {
			results.push(...(await applyTxs(valid)).results);
		} catch (e) {
			return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
		}
	}
	return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
};
