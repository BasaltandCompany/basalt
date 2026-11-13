// Importers ICP discovery fetch — ImportYeti PowerQuery → rows as JSON.
// Deliberately fetch-only (Collin's rule: MCP-covered ops go through MCP):
// pipe the rows into basalt_add_funnel_items (batches of 100) after opening a
// run with basalt_create_funnel_run. Pass --import to import direct-to-lib
// instead (headless/cron use only).
//   cd web && IY_API_KEY=... bun scripts/importers-pull.ts --hs "3923"
import { importRunItems, createFunnelRun } from "~/lib/funnels";
import { discoverImporterCompanies } from "~/lib/importyeti";

const args = process.argv.slice(2);
const arg = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const IMPORT = args.includes("--import");
const TIER = (arg("tier") ?? "1") === "2" ? (2 as const) : (1 as const);
const HS = arg("hs");
const PRODUCT = arg("product");
const LIMIT = parseInt(arg("limit") ?? "200", 10);
const MIN_CREDITS = parseInt(arg("min-credits") ?? "100", 10);
if (!HS && !PRODUCT) {
	console.error("usage: bun scripts/importers-pull.ts --hs \"3923*\" | --product \"card sleeves\" [--tier 2] [--limit 200] [--min-credits 100] [--import]");
	process.exit(1);
}

const queries: { hsCode?: string; product?: string }[] = HS
	? HS.split(",").map((h) => ({ hsCode: h.trim().replace(/^\"|\"$/g, "") })).filter((q) => q.hsCode)
	: (PRODUCT ?? "")
			.split(",")
			.map((p) => p.trim().replace(/^\"|\"$/g, ""))
			.filter(Boolean)
			.map((p) => ({ product: `"${p}"` }));

const all: Awaited<ReturnType<typeof discoverImporterCompanies>>["rows"] = [];
let credits = Infinity;
for (const q of queries) {
	const r = await discoverImporterCompanies({ ...q, tier: TIER, limit: LIMIT, minCredits: MIN_CREDITS, shipmentsRange: "[20 TO 5000]", startDate: "2024-01-01" });
	credits = r.creditsRemaining;
	all.push(...r.rows);
	console.error(`[pull] ${q.hsCode ?? q.product}: +${r.rows.length} tier-${TIER} rows (total matched: ${r.totalCompanies}, credits left: ${r.creditsRemaining})`);
}
// dedupe by company name across queries (keep the richest row)
const seen = new Map<string, (typeof all)[number]>();
for (const row of all) {
	const prev = seen.get(row.companyName.toLowerCase());
	if (!prev || Object.keys(row.rawData).length > Object.keys(prev.rawData).length) seen.set(row.companyName.toLowerCase(), row);
}
const rows = [...seen.values()].slice(0, LIMIT);
console.error(`[pull] ${rows.length} unique companies after merge, ${credits} ImportYeti credits left`);

if (!IMPORT) {
	// rows on stdout (progress already on stderr) — feed to basalt_add_funnel_items
	console.log(JSON.stringify(rows));
	process.exit(0);
}

const { run } = await createFunnelRun({ funnelName: "Importers ICP", source: "importyeti", note: `pull ${new Date().toISOString().slice(0, 10)} tier${TIER} ${HS ? `hs=${HS}` : `product=${PRODUCT}`}` });
if (!run) {
	console.error('funnel "Importers ICP" not found — run bun scripts/importers-funnel-seed.ts first');
	process.exit(1);
}
let imported = 0;
for (let i = 0; i < rows.length; i += 100) {
	const res = await importRunItems(run.id, rows.slice(i, i + 100));
	imported += res.imported;
	console.error(`[pull] batch: +${res.imported} new, ${res.duplicated} dup, ${res.skippedPromoted} already promoted`);
}
console.log(`done: ${imported} imported into run ${run.id}`);
