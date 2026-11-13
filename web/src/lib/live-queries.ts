// Live admin feed — client side. Polls /api/changes every 5s while the tab is
// visible; any new event revalidates all queries (agent edits appear ~5s, no
// refresh). The pure reducer is exported for the test.
import { onCleanup, onMount } from "solid-js";

const POLL_MS = 5_000; // knob: poll cadence while the tab is visible

export type ChangeEvent = { id: number; table: string; op: string };
export type PollResult =
	| { ok: true; events: ChangeEvent[]; last: number }
	| { ok: false };

/**
 * Given the current cursor and one poll result, decide whether to revalidate
 * and what the next cursor is. cursor === null means "first poll after mount":
 * sync to the head without revalidating (the page just loaded its own data).
 * Errors keep the cursor — the next tick retries from the same position.
 */
export function applyPoll(cursor: number | null, res: PollResult): { revalidate: boolean; next: number } {
	if (!res.ok) return { revalidate: false, next: cursor ?? 0 };
	if (cursor === null) return { revalidate: false, next: res.last };
	return { revalidate: res.events.length > 0, next: res.last };
}

/** Mount once (Layout.tsx). No-op during SSR. */
export function useLiveQueries(): void {
	onMount(() => {
		let cursor: number | null = null;
		let inFlight = false;

		async function poll() {
			if (document.hidden || inFlight) return;
			inFlight = true;
			// dynamic: keeps this module import-clean for the reducer test (router import is client-only)
			const { revalidate } = await import("@solidjs/router");
			try {
				const res = await fetch(`/api/changes?since=${cursor ?? 0}`, { headers: { accept: "application/json" } });
				if (res.status === 200) {
					const out = applyPoll(cursor, { ok: true, ...(await res.json()) });
					cursor = out.next;
					if (out.revalidate) revalidate();
				}
			} catch {
				// endpoint down / network gone — pages behave exactly like today; next tick retries
			} finally {
				inFlight = false;
			}
		}

		const onVisible = () => {
			// covers iOS PWA resume + missed polls while hidden
			if (!document.hidden) void import("@solidjs/router").then((r) => r.revalidate());
		};

		void poll(); // establish the cursor without revalidating
		const timer = setInterval(() => void poll(), POLL_MS);
		document.addEventListener("visibilitychange", onVisible);
		onCleanup(() => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		});
	});
}
