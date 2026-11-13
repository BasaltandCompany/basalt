// One-off seed: "Importers Similarity ICP" — funnel v2 (BCW-similarity, location
// de-gated). Built, NOT run: no stage execution, no Prospeo calls — zero credit
// burn by design (Collin's rule, Nov 2026). Discovery plan: Prospeo company
// search (wholesale/distribution, 11-200 headcount, Midwest geo preference);
// ImportYeti demoted to enrichment. See ICP-BCW.md "BCW similarity profile".
//   cd web && bun scripts/importers-v2-seed.ts
// Replicate on prod after deploy via basalt_create_funnel extra_stages.
import { db } from "~/db";
import { funnels, type FunnelStage } from "~/db/schema";

const stages: FunnelStage[] = [
	{
		key: "hq_state",
		label: "Region (recorded, never gates)",
		gate: "Region note only: IN tier-1, OH/IL/MI/KY/WI tier-2, elsewhere recorded. Location is a discovery preference, NOT a filter (ICP-BCW.md v2)",
		method: "source",
		soft: true,
	},
	{
		key: "customs_evidence",
		label: "Customs evidence",
		gate: "Consignee in public US-import BOLs. NO volume = neutral (never a signal — many haven't filed confidentiality); volume present → below ~1000 lifetime = BCW-like (cap is a calibration knob); 10k+ = heavy shipper, deprioritize",
		method: "source",
		soft: true,
	},
	{
		key: "ai_signal",
		label: "AI signal",
		gate: "≥1 employee self-labels AI (Prospeo roster); site evidence corroborates only; vendor-hint recorded separately",
		method: "api",
		soft: true,
		params: { maxRosterPages: 10 },
	},
	{
		key: "headcount",
		label: "Headcount (BCW ~26)",
		gate: "15-60 employees — the BCW band, not the old 15-250",
		method: "api",
		soft: true,
		params: { min: 15, max: 60 },
	},
	{
		key: "revenue_band",
		label: "Revenue (BCW band)",
		gate: "$8-70M estimate (BCW public $8-10M, Collin's read $70M — band wide until verified); rev/employee $150-500k sanity; no Prospeo revenue → headcount × $325k/emp estimate",
		method: "api",
		soft: true,
		params: { min: 8_000_000, max: 70_000_000, perEmp: 325_000 },
	},
	{
		key: "tech_team",
		label: "Tech team (BCW: ~2)",
		gate: "≤6 title hits, ideally 1-3 (BCW: ecommerce director + offshore dev)",
		method: "api",
		soft: true,
		params: { maxHits: 6 },
	},
	{
		key: "ops_trigger",
		label: "Ops trigger",
		gate: "≥1 finance/ops leadership title (CFO/controller/COO/business manager) or ≥2 recruiting titles in the roster",
		method: "api",
		soft: true,
		params: { minFinance: 1, minHiring: 2 },
	},
	{
		key: "owner_led",
		label: "Owner-led",
		gate: "Founder/CEO still running it, not a PE roll-up",
		method: "agent",
		soft: true,
	},
];

const inserted = await db
	.insert(funnels)
	.values({
		name: "Importers Similarity ICP",
		description: "BCW-similarity funnel (ICP-BCW.md v2): headcount 15-60, $8-70M, tech ≤6, light-or-no BOL volume, ai_signal gate. Location de-gated. BUILT NOT RUN — no credits burned.",
		stages,
	})
	.onConflictDoNothing({ target: funnels.name })
	.returning({ id: funnels.id });

console.log(inserted.length ? `created Importers Similarity ICP ${inserted[0].id} (dormant)` : "already exists — no change");
process.exit(0);
