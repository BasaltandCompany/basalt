// Importers ICP smoke — same lifecycle the freight smoke asserts, driven
// through the shared lib (no HTTP/mc_ key needed). Creates a scratch run with
// 3 fake IN companies, walks the ungated model, and proves the custom
// customs_evidence stage is scoreable. Leaves no prospects behind (fake
// companies are promoted → then un-approved; rows are visibly "Smoke *").
//   cd web && bun scripts/importers-smoke.ts
import { and, eq } from "drizzle-orm";
import { db } from "~/db";
import { funnels, funnelItems, outreachProspects } from "~/db/schema";
import { createFunnelRun, importRunItems, recordStageVerdict, getQueue } from "~/lib/funnels";

let failed = 0;
const ok = (cond: boolean, msg: string) => {
	console.log(`${cond ? "ok" : "FAIL"}: ${msg}`);
	if (!cond) failed++;
};

// 1. funnel row exists with the custom stage
const [funnel] = await db.select().from(funnels).where(eq(funnels.name, "Importers ICP")).limit(1);
ok(!!funnel, "Importers ICP funnel exists");
ok(funnel!.stages.some((s) => s.key === "customs_evidence"), "customs_evidence stage present");
ok(funnel!.stages.findIndex((s) => s.key === "customs_evidence") === 1, "customs_evidence at position 2 (after hq_state)");

// 2. open a run + import 3 fake IN companies
const { run } = await createFunnelRun({ funnelName: "Importers ICP", source: "importyeti", note: "smoke" }) as { run: { id: string } };
ok(!!run, `run opened ${run.id}`);
const res = await importRunItems(run.id, [
	{ companyName: "Smoke Importer LLC", city: "Middletown", state: "IN", sourceKind: "importyeti", rawData: { shipments: 40 } },
	{ companyName: "Smoke Wholesaler Inc", city: "Fishers", state: "IN", sourceKind: "importyeti", rawData: { shipments: 12 } },
	{ companyName: "Smoke Exporter Co", city: "Muncie", state: "IN", sourceKind: "importyeti", rawData: { shipments: 7 } },
]);
ok(res.imported === 3, `3 imported (got ${res.imported})`);

// 3. nothing gates — all 3 queue at ai_signal and at customs_evidence
const q = await getQueue(run.id, "ai_signal");
ok(q?.length === 3, `ai_signal queue has 3 (got ${q?.length})`);
const qc = await getQueue(run.id, "customs_evidence");
ok(qc?.length === 3, `customs_evidence queue has 3 (got ${qc?.length})`);

// 4. customs_evidence verdict lands on the custom stage
const iid1 = q!.find((i) => i.companyName === "Smoke Importer LLC")!.id;
const ce = await recordStageVerdict({ itemId: iid1, stage: "customs_evidence", verdict: "pass", note: "40 shipments, CN suppliers", method: "source" });
ok((ce as { ok?: boolean }).ok === true, "customs_evidence verdict recorded");

// 5. soft fail on ai_signal → item STAYS in later queues
const iid2 = q!.find((i) => i.companyName === "Smoke Wholesaler Inc")!.id;
await recordStageVerdict({ itemId: iid2, stage: "ai_signal", verdict: "fail", note: "tier3|roster 12, zero signal", method: "human" });
const qh = await getQueue(run.id, "headcount");
ok(qh?.some((i) => i.companyName === "Smoke Wholesaler Inc") === true, "ai_signal fail stayed in headcount queue (soft)");

// 6. ai_signal pass → promoted immediately
const p = await recordStageVerdict({ itemId: iid1, stage: "ai_signal", verdict: "pass", note: "tier1|Ops Director self-labels AI", method: "human" });
ok((p as { ok?: boolean }).ok === true, "ai_signal pass recorded");
const [promoted] = await db.select().from(funnelItems).where(eq(funnelItems.id, iid1)).limit(1);
ok(!!promoted?.prospectId, `promoted → prospect ${promoted?.prospectId}`);
const [prospect] = promoted?.prospectId
	? await db.select().from(outreachProspects).where(eq(outreachProspects.id, promoted.prospectId)).limit(1)
	: [];
ok(prospect?.icpApproved === true && prospect?.aiInterest === "high", "prospect icpApproved=true, aiInterest=high (tier1)");

// 7. ai_signal fail AFTER promotion → un-approves (the only gate that does)
await recordStageVerdict({ itemId: iid1, stage: "ai_signal", verdict: "fail", note: "tier3|redo", method: "human" });
const [prospect2] = await db.select().from(outreachProspects).where(eq(outreachProspects.id, promoted!.prospectId!)).limit(1);
ok(prospect2?.icpApproved === false, "ai_signal fail un-approved the prospect");

// cleanup: delete scratch prospect + items (cascade removes stage results)
await db.delete(outreachProspects).where(eq(outreachProspects.id, promoted!.prospectId!));
await db.delete(funnelItems).where(and(eq(funnelItems.runId, run.id)));
console.log(failed === 0 ? "\nSMOKE PASSED" : `\nSMOKE FAILED (${failed})`);
process.exit(failed === 0 ? 0 : 1);
