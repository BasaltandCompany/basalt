import { createEffect, createSignal, untrack } from "solid-js";

/**
 * Component-level live-edit ingestion for registry-component editors (docs,
 * email drafts, anything with an open editor + refetching route data). The
 * /api/changes poll (Layout → useLiveQueries) revalidates all queries every
 * few seconds, so `remote` (a route-data getter) carries agent edits ~poll
 * after they land. This applies those remote values into local editor state
 * ONLY where the local user hasn't diverged from the last-synced value —
 * agent edits appear live while the editor is open, and unsaved human typing
 * is never clobbered (their version stays in DB/version history).
 *
 * Call markSynced(v) after a successful local save of v so the field returns
 * to "clean" and future agent edits flow through again.
 */
export function createRemoteSync<T>(opts: {
	remote: () => T; // live remote value (reactive route data)
	local: () => T; // current editor value
	setLocal: (v: T) => void; // ingest remote into editor state
	onApplied?: (remote: T) => void; // remote edit applied over a clean (un-edited) field
	onConflict?: (remote: T) => void; // remote changed under a locally-dirty field
}) {
	// baseline = first defined remote value; before that arrives (SSR/hydration
	// timing) nothing applies — the component's own seed covers it
	const [synced, setSynced] = createSignal<T | undefined>(untrack(() => opts.remote()));
	createEffect(() => {
		const remote = opts.remote();
		if (remote === undefined) return;
		const s = synced();
		if (s === undefined) {
			setSynced(() => remote);
			return;
		}
		if (opts.local() === s) {
			if (remote !== s) {
				untrack(() => {
					opts.setLocal(remote);
					setSynced(() => remote);
					opts.onApplied?.(remote);
				});
			}
		} else if (remote !== s) {
			untrack(() => opts.onConflict?.(remote));
		}
	});
	return {
		markSynced: (v: T) => setSynced(() => v),
	};
}
