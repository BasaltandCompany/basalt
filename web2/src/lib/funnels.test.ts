// Stage-sync tests (bun test src/lib/funnels.test.ts). mergeStages is the pure
// half of ensureFreightFunnel: legacy funnel rows (7 gated stages, ai_signal
// last) must merge into the 6-stage ungated skeleton — reordered, industry_type
// dropped, soft everywhere — without losing runtime-tuned params.
import { test } from "bun:test";
import assert from "node:assert/strict";
import { FREIGHT_STAGES, mergeStages, spliceStages } from "./funnels";
import type { FunnelStage } from "~/db/schema";
import { describe, it } from "bun:test";

// A Legal-ICP-shaped legacy row: old order, gated (no soft except owner_led),
// custom industry gate, tuned headcount params.
const legacyRow: FunnelStage[] = [
	{ key: "hq_state", label: "Indiana HQ", gate: "Address/city is in Indiana, not a name token", method: "source" },
	{ key: "industry_type", label: "Industry", gate: "Indiana law firm — attorneys are the product", method: "source" },
	{ key: "headcount", label: "Headcount", gate: "15-250 employees", method: "api", params: { min: 20, max: 150 } },
	{ key: "revenue_band", label: "Revenue", gate: "$10-70M estimate", method: "api", params: { min: 10_000_000, max: 70_000_000, perEmp: 325_000 } },
	{ key: "tech_team", label: "Tech team", gate: "≤6 title hits", method: "api", params: { maxHits: 6 } },
	{ key: "owner_led", label: "Owner-led", gate: "Founder/CEO still running it", method: "agent", soft: true },
	{ key: "ai_signal", label: "AI signal", gate: "≥1 employee self-labels AI", method: "api", params: { maxRosterPages: 10 } },
];

test("FREIGHT_STAGES is the ungated 7-stage skeleton with ai_signal at position 2", () => {
	assert.deepEqual(
		FREIGHT_STAGES.map((s) => s.key),
		["hq_state", "ai_signal", "headcount", "revenue_band", "tech_team", "ops_trigger", "owner_led"],
	);
	assert.ok(FREIGHT_STAGES.every((s) => s.soft === true), "every stage must be soft (nothing gates)");
});

test("mergeStages reorders a legacy row into the skeleton and drops industry_type", () => {
	const merged = mergeStages(FREIGHT_STAGES, legacyRow);
	assert.deepEqual(
		merged.map((s) => s.key),
		FREIGHT_STAGES.map((s) => s.key),
	);
});

test("mergeStages preserves tuned params and applies soft from code", () => {
	const merged = mergeStages(FREIGHT_STAGES, legacyRow);
	const headcount = merged.find((s) => s.key === "headcount")!;
	assert.deepEqual(headcount.params, { min: 20, max: 150 }, "row params win over code params");
	assert.equal(headcount.soft, true, "code soft applies where the row had none");
	// code gate/label win — a legacy row's reworded gate must not survive
	assert.equal(merged.find((s) => s.key === "hq_state")!.gate, FREIGHT_STAGES[0].gate);
});

test("mergeStages is idempotent on an already-synced row", () => {
	const once = mergeStages(FREIGHT_STAGES, legacyRow);
	assert.deepEqual(mergeStages(FREIGHT_STAGES, once), once);
});

// spliceStages (createFunnel extra_stages) — pure stage-splicing for custom-stage
// funnels. No DB, no network.
describe("spliceStages", () => {
	it("returns the skeleton unchanged with no extras", () => {
		assert.deepEqual(spliceStages(FREIGHT_STAGES, undefined), FREIGHT_STAGES);
		assert.deepEqual(spliceStages(FREIGHT_STAGES, []), FREIGHT_STAGES);
	});

	it("inserts an extra stage after hq_state by default, soft, method source", () => {
		const stages = spliceStages(FREIGHT_STAGES, [
			{ key: "customs_evidence", label: "Customs evidence", gate: "BOL consignee" },
		]);
		assert.equal(stages[1]!.key, "customs_evidence");
		assert.equal(stages[1]!.method, "source");
		assert.equal(stages[1]!.soft, true);
		assert.equal(stages[0]!.key, "hq_state");
		assert.equal(stages[2]!.key, "ai_signal");
		assert.equal(stages.length, FREIGHT_STAGES.length + 1);
		assert.ok(!Object.keys(stages[1]!).includes("position"), "position marker must not leak into the stored stage");
	});

	it("honors an explicit position anchor and appends on a missing anchor", () => {
		const anchored = spliceStages(FREIGHT_STAGES, [{ key: "x", label: "X", gate: "g", position: "owner_led" }]);
		assert.equal(anchored.at(-1)!.key, "x");
		const appended = spliceStages(FREIGHT_STAGES, [{ key: "y", label: "Y", gate: "g", position: "nope" }]);
		assert.equal(appended.at(-1)!.key, "y");
	});

	it("rejects key collisions and missing fields", () => {
		assert.throws(() => spliceStages(FREIGHT_STAGES, [{ key: "hq_state", label: "dup", gate: "g" }]));
		assert.throws(() => spliceStages(FREIGHT_STAGES, [{ key: "", label: "no key", gate: "g" }]));
		assert.throws(() => spliceStages(FREIGHT_STAGES, [{ key: "ok", label: "no gate" }]));
	});

	it("coerces an unknown method to source", () => {
		const stages = spliceStages(FREIGHT_STAGES, [{ key: "z", label: "Z", gate: "g", method: "bogus" }]);
		assert.equal(stages[1]!.method, "source");
	});
});
