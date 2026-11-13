// One-off seed: the "Importers ICP" funnel (BCW-lookalikes, outreach/ICP-BCW.md).
// Freight skeleton + a customs_evidence source-stage at position 2 — funnels
// with extra stage keys are deliberately left alone by ensureFreightFunnel's
// skeleton sync. Idempotent on name. Promotion attaches to a campaign whose
// name matches the funnel's first word ("%importers%") — create it in the
// dashboard when outreach starts.
//   cd web && bun scripts/importers-funnel-seed.ts
import { FREIGHT_STAGES } from "~/lib/funnels";
import { db } from "~/db";
import { funnels, type FunnelStage } from "~/db/schema";

const CUSTOMS_EVIDENCE: FunnelStage = {
	key: "customs_evidence",
	label: "Customs evidence",
	gate: "Consignee in public US-import BOLs (ImportYeti): supplier countries, HS codes, shipment volume recorded in rawData",
	method: "source",
	soft: true,
};

const stages: FunnelStage[] = [FREIGHT_STAGES[0], CUSTOMS_EVIDENCE, ...FREIGHT_STAGES.slice(1)];

const inserted = await db
	.insert(funnels)
	.values({
		name: "Importers ICP",
		description: "Owner-led IN/Midwest importer-wholesalers with ecommerce, $10-70M, no tech team (see outreach/ICP-BCW.md)",
		stages,
	})
	.onConflictDoNothing({ target: funnels.name })
	.returning({ id: funnels.id });

console.log(inserted.length ? `created Importers ICP funnel ${inserted[0].id}` : "Importers ICP already exists — no change");
process.exit(0);
