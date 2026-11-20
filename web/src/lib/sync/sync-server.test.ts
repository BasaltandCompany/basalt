// Self-checks for the tx trust boundary (sync-server.validateTx — pure, no DB).
// Run: cd web && bun run test src/lib/sync/sync-server.test.ts
import { describe, expect, test } from "bun:test";
import { validateTx } from "./sync-server";

const ok = {
	id: "tx-1",
	kind: "prospect",
	rowId: "0f0e0d0c-0b0a-4948-8476-21143210fedc",
	op: "update",
	changes: { stage: { from: "proposed", to: "sent" } },
};

describe("validateTx", () => {
	test("accepts a well-formed whitelisted update", () => {
		expect(validateTx(ok)).toBeNull();
		expect(
			validateTx({
				...ok,
				kind: "project",
				changes: { status: { from: "active", to: "paused" }, notes: { from: null, to: "x" } },
			}),
		).toBeNull();
	});

	test("rejects malformed shapes", () => {
		expect(validateTx(null)).toMatch(/object/);
		expect(validateTx({ ...ok, id: "" })).toMatch(/tx.id/);
		expect(validateTx({ ...ok, rowId: "not-a-uuid" })).toMatch(/uuid/);
		expect(validateTx({ ...ok, op: "upsert" })).toMatch(/op/);
		expect(validateTx({ ...ok, changes: {} })).toMatch(/requires changes/);
		expect(validateTx({ ...ok, changes: { stage: { from: 1 } } })).toMatch(/"to"/);
	});

	test("rejects unknown kinds and non-whitelisted fields", () => {
		expect(validateTx({ ...ok, kind: "issue" })).toMatch(/unknown kind/);
		expect(validateTx({ ...ok, kind: "email-thread" })).toMatch(/read-only/); // Gmail workflow kind
		expect(validateTx({ ...ok, kind: "email-draft" })).toMatch(/read-only/);
		expect(validateTx({ ...ok, changes: { company: { from: 1, to: 2 } } })).toMatch(/not writable/);
		expect(
			validateTx({ ...ok, kind: "project", changes: { companyId: { from: "a", to: "b" } } }),
		).toMatch(/not writable/);
	});

	test("validates whitelisted values (stage/status vocabularies)", () => {
		expect(validateTx({ ...ok, changes: { stage: { from: "x", to: "nonsense" } } })).toMatch(/unknown stage/);
		expect(
			validateTx({ ...ok, kind: "project", changes: { status: { from: "active", to: "exploded" } } }),
		).toMatch(/unknown status/);
	});

	test("create requires a row id; delete needs nothing more", () => {
		expect(validateTx({ ...ok, op: "create" })).toMatch(/row.id/);
		expect(validateTx({ ...ok, op: "create", row: { id: "0f0e0d0c-0b0a-4948-8476-21143210fedc" } })).toBeNull();
		expect(validateTx({ ...ok, op: "delete", changes: undefined })).toBeNull();
	});
});
