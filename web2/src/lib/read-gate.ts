// Read-before-write ledger for the brain MCP server: reads register
// "<kind>:<id>" (and "<kind>:<lowercased-name>") keys per session; gated
// writes must find their key in the same session's ledger or they bounce
// with the read tool to call. In-memory on purpose — a restart or deploy
// wipes it, so the first write after one always needs a fresh read.

const SHARED_SESSION = "__shared__";
const MAX_SESSIONS = 200;

const ledger = new Map<string, Set<string>>();

/** chat_uuid scopes the ledger; callers that omit it share one bucket. */
export function sessionKey(chatUuid: unknown): string {
	const s = typeof chatUuid === "string" ? chatUuid.trim() : "";
	return s || SHARED_SESSION;
}

/** Lowercased name alias key, e.g. nameKey("prospect", "Acme Co") → "prospect:acme co". */
export function nameKey(kind: string, name: string): string {
	return `${kind}:${name.trim().toLowerCase()}`;
}

export function noteRead(session: string, keys: string | string[]): void {
	const list = (typeof keys === "string" ? [keys] : keys).filter((k) => k.includes(":"));
	if (list.length === 0) return;
	let set = ledger.get(session);
	if (!set) {
		if (ledger.size >= MAX_SESSIONS) {
			const oldest = ledger.keys().next().value;
			if (oldest !== undefined) ledger.delete(oldest);
		}
		set = new Set();
		ledger.set(session, set);
	}
	for (const k of list) set.add(k);
}

export function requireRead(
	session: string,
	keys: string | string[],
	hint: string,
): { ok: true } | { ok: false; error: string; required_read: { keys: string[]; hint: string } } {
	const list = typeof keys === "string" ? [keys] : keys;
	const set = ledger.get(session);
	if (list.some((k) => set?.has(k))) {
		// touch: re-insert to keep recently-used sessions at the eviction tail
		ledger.delete(session);
		ledger.set(session, set!);
		return { ok: true };
	}
	return {
		ok: false,
		error: `read-before-write gate: this write edits an existing record — read it first (${hint}). Reads register under your session (chat_uuid); without one the shared ledger applies.`,
		required_read: { keys: list, hint },
	};
}

/** Test/restart helper. */
export function clearLedger(): void {
	ledger.clear();
}
