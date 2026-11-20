// Self-check for the live-edit sync decision: stale refetches must not rewind
// saved editor state, agent edits still apply, dirty fields never clobber.
// Drives remoteSyncAction directly (solid's server build stubs signals, so
// the createEffect wrapper can't run under bun test). The wiring (signals →
// effect → setters) is a 1:1 mapping of these actions.
// Run: DATABASE_URL=postgres://dummy bun test src/lib/live-merge.test.ts
import { describe, expect, test } from "bun:test";
import { remoteSyncAction } from "./live-merge";

describe("remoteSyncAction", () => {
	test("stale poll (equal-or-older version) never rewinds a just-saved field", () => {
		// field clean at "saved text" / version 5 (markSynced after the PUT)
		const base = { remote: "saved text", ver: 5, local: "saved text", s: "saved text", sv: 5 };
		// a poll that raced the save lands: pre-save text, older version → ignored
		expect(remoteSyncAction({ ...base, remote: "old text", ver: 4 })).toEqual({ action: "skip" });
		// same stale row at the equal version (meta-only save artifact) → ignored
		expect(remoteSyncAction({ ...base, remote: "old text", ver: 5 })).toEqual({ action: "skip" });
		// a real remote change (agent edit) bumps the version → applied
		expect(remoteSyncAction({ ...base, remote: "agent text", ver: 6 })).toEqual({ action: "apply", value: "agent text" });
	});

	test("no version info → legacy behavior: any remote change applies over a clean field", () => {
		expect(remoteSyncAction({ remote: "b", local: "a", s: "a" })).toEqual({ action: "apply", value: "b" });
		expect(remoteSyncAction({ remote: "a", local: "a", s: "a" })).toEqual({ action: "skip" });
	});

	test("dirty local field: remote change conflicts, never clobbers typing", () => {
		const out = remoteSyncAction({ remote: "agent text", ver: 2, local: "human typing", s: "a", sv: 1 });
		expect(out).toEqual({ action: "conflict", value: "agent text" });
		// unchanged remote at a newer version (refire each poll) → still conflict
		expect(remoteSyncAction({ remote: "agent text", ver: 3, local: "human typing", s: "a", sv: 1 })).toEqual({ action: "conflict", value: "agent text" });
	});

	test("baseline: first defined remote seeds the sync", () => {
		expect(remoteSyncAction({ remote: "a", ver: 1, local: "a", s: undefined })).toEqual({ action: "baseline", value: "a" });
		expect(remoteSyncAction({ remote: undefined, local: "a", s: undefined })).toEqual({ action: "skip" });
	});
});
