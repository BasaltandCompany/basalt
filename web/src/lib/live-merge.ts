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
 * Call markSynced(v, version?) after a successful local save of v so the field
 * returns to "clean" and future agent edits flow through again.
 *
 * Pass remoteVersion (the row's monotonic version) to make stale refetches
 * harmless: a poll that raced a local save delivers an equal-or-older version,
 * and applying it would rewind the editor right before the fresh poll lands
 * (the old→new flash). Without remoteVersion the sync behaves as before.
 */
export type SyncOpts<T> = {
	remote: () => T; // live remote value (reactive route data)
	remoteVersion?: () => number | undefined; // ordering signal — strictly-greater versions apply, equal-or-lower are stale
	local: () => T; // current editor value
	setLocal: (v: T) => void; // ingest remote into editor state
	onApplied?: (remote: T) => void; // remote edit applied over a clean (un-edited) field
	onConflict?: (remote: T) => void; // remote changed under a locally-dirty field
};

/** Pure decision for one sync tick — exported for the test (solid's server
 *  build stubs signals, so bun tests drive this directly). */
export type SyncTick<T> = { remote: T; ver?: number; local: T; s: T | undefined; sv?: number };
export type SyncAction<T> = { action: "skip" } | { action: "baseline" | "apply" | "conflict"; value: T };

export function remoteSyncAction<T>(v: SyncTick<T>): SyncAction<T> {
	if (v.remote === undefined) return { action: "skip" };
	// stale-refetch guard: an equal-or-older version can only be a poll that
	// raced a local save (real remote changes always bump the version)
	if (v.sv !== undefined && v.ver !== undefined && v.ver <= v.sv) return { action: "skip" };
	// baseline = first defined remote value; before that arrives (SSR/hydration
	// timing) nothing applies — the component's own seed covers it
	if (v.s === undefined) return { action: "baseline", value: v.remote };
	if (v.local === v.s) {
		if (v.remote !== v.s) return { action: "apply", value: v.remote };
	} else if (v.remote !== v.s) {
		return { action: "conflict", value: v.remote };
	}
	return { action: "skip" };
}

export function createRemoteSync<T>(opts: SyncOpts<T>) {
	const [synced, setSynced] = createSignal<T | undefined>(untrack(() => opts.remote()) as Exclude<T | undefined, Function>);
	const [syncedVersion, setSyncedVersion] = createSignal<number | undefined>(untrack(() => opts.remoteVersion?.()));
	createEffect(
		() => ({ remote: opts.remote(), ver: opts.remoteVersion?.(), local: opts.local(), s: synced(), sv: syncedVersion() }),
		(v) => {
			// Solid 2: writes live in the untracked effect phase; the compute above only tracks.
			const out = remoteSyncAction(v);
			if (out.action === "skip") return;
			if (out.action === "baseline") setSynced(() => out.value);
			if (out.action === "apply") {
				opts.setLocal(out.value);
				setSynced(() => out.value);
				setSyncedVersion(() => v.ver);
				opts.onApplied?.(out.value);
			}
			if (out.action === "conflict") opts.onConflict?.(out.value);
		},
	);
	return {
		markSynced: (v: T, version?: number) => {
			setSynced(() => v);
			if (version !== undefined) setSyncedVersion(() => version);
		},
	};
}
