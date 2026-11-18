#!/usr/bin/env bun
// security-scanner: mechanical scan battery + dedupe + report scaffold.
// The agent does triage (see ../SKILL.md); this script never needs an API key.
//
//   bun scan.ts --client <slug> [--only deps,secrets,sast,rls,web] [--yes-active] [--selftest]
//
// Exit codes: 0 = ran (findings may exist, they live in the scaffold), 1 = config/tool error.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;

// ---------- types ----------

type Section = "deps" | "secrets" | "sast" | "rls" | "web";
type Severity = "critical" | "high" | "medium" | "low" | "info";
type Status = "new" | "open" | "fixed" | "accepted";

interface Finding {
  fingerprint: string;
  source: Section;
  severity: Severity;
  title: string;
  where: string; // repo/file/site the finding came from
  detail: string;
  fix: string; // deterministic fix text (agent may upgrade it)
}

interface StateRecord {
  status: Status;
  source: Section;
  severity: Severity;
  title: string;
  where: string;
  firstSeen: string;
  lastSeen: string;
  fixedSeen?: string;
}

type State = Record<string, StateRecord>;

interface ClientConfig {
  slug: string;
  label: string;
  repos: string[];
  sites: { url: string; activeScan?: boolean }[];
}

interface Delta {
  newFps: string[];
  openFps: string[];
  fixedFps: string[];
  acceptedFps: string[];
}

// ---------- helpers ----------

const today = () => new Date().toISOString().slice(0, 10);

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function repoRoot(): Promise<string> {
  let dir = import.meta.dir;
  for (let i = 0; i < 8; i++) {
    if (dir === "/" || (await exists(path.join(dir, ".git")))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

// Run a command; return stdout. `okCodes` = exit codes that still count as success
// (osv-scanner/gitleaks exit 1 when findings exist).
async function sh(cmd: string, args: string[], okCodes: number[] = [0], cwd?: string) {
  try {
    const { stdout } = await run(cmd, args, {
      maxBuffer: MAX_BUFFER,
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 900_000,
    });
    return { stdout, code: 0 };
  } catch (e: any) {
    const code = e.code ?? e.exitCode ?? 1;
    if (okCodes.includes(code) && (e.stdout !== undefined)) {
      return { stdout: e.stdout as string, code };
    }
    const err = ((e.stderr ?? "") + " " + (e.message ?? "")).trim().slice(0, 400);
    throw new Error(`${cmd} failed (exit ${code}): ${err}`);
  }
}

async function toolVersion(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, ["--version"], { timeout: 30_000 });
    return stdout.trim();
  } catch {
    try {
      // gitleaks v2 prints version with `gitleaks version`
      const { stdout } = await run(cmd, ["version"], { timeout: 10_000 });
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

const majorOf = (v: string | null) => {
  const m = v?.match(/(\d+)\.\d+/);
  return m ? parseInt(m[1], 10) : 0;
};

// ---------- dedupe (pure, selftestable) ----------

export function reconcile(
  state: State,
  current: Finding[],
  day: string,
  sectionsRun?: Set<Section>, // partial runs (--only) must not fixed-mark sections they skipped
): { state: State; delta: Delta } {
  const next: State = { ...state };
  const delta: Delta = { newFps: [], openFps: [], fixedFps: [], acceptedFps: [] };
  const cur = new Set(current.map((f) => f.fingerprint));
  for (const f of current) {
    const rec = next[f.fingerprint];
    if (!rec) {
      next[f.fingerprint] = {
        status: "new", source: f.source, severity: f.severity, title: f.title, where: f.where,
        firstSeen: day, lastSeen: day,
      };
      delta.newFps.push(f.fingerprint);
    } else if (rec.status === "accepted") {
      rec.lastSeen = day;
      delta.acceptedFps.push(f.fingerprint);
    } else {
      rec.status = "open"; // open, or reopened after fixed
      rec.lastSeen = day;
      rec.severity = f.severity;
      rec.title = f.title;
      delta.openFps.push(f.fingerprint);
    }
  }
  for (const [fp, rec] of Object.entries(state)) {
    if (!cur.has(fp) && rec.status !== "fixed" && (!sectionsRun || sectionsRun.has(rec.source))) {
      next[fp] = { ...rec, status: "fixed", fixedSeen: day };
      delta.fixedFps.push(fp);
    }
  }
  return { state: next, delta };
}

export function dedupeByFingerprint(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) if (!seen.has(f.fingerprint)) seen.set(f.fingerprint, f);
  return [...seen.values()];
}

export function depsFp(name: string, version: string, vulnId: string) {
  return `deps:${name}@${version}:${vulnId}`;
}

// ---------- battery sections ----------

function fixedFromVuln(vuln: any, pkgName: string): string | null {
  for (const aff of vuln.affected ?? []) {
    if (aff.package?.name !== pkgName) continue;
    for (const range of aff.ranges ?? []) {
      const events = range.events ?? [];
      const fixes = events.filter((e: any) => e.fixed).map((e: any) => e.fixed);
      if (fixes.length) return fixes[fixes.length - 1];
    }
  }
  return null;
}

function severityFromVuln(vuln: any): Severity {
  const s: string = (vuln.database_specific?.severity ?? vuln.severity ?? "").toLowerCase();
  if (s.includes("critical")) return "critical";
  if (s.includes("high")) return "high";
  if (s.includes("low")) return "low";
  return "medium"; // moderate/medium/unknown
}

async function scanDeps(repoDir: string, repoName: string): Promise<Finding[]> {
  const ver = await toolVersion("osv-scanner");
  const args = majorOf(ver ?? "") >= 2
    ? ["scan", "--recursive", "--format", "json", repoDir]
    : ["--recursive", "--format", "json", repoDir];
  // exit 1 = vulnerabilities found; JSON still on stdout
  const { stdout } = await sh("osv-scanner", args, [0, 1]);
  const out = JSON.parse(stdout || "{}");
  const findings: Finding[] = [];
  for (const result of out.results ?? []) {
    for (const pkg of result.packages ?? []) {
      const { name, version } = pkg.package ?? {};
      if (!name || !version) continue;
      for (const vuln of pkg.vulnerabilities ?? []) {
        const id = vuln.id ?? "UNKNOWN";
        const fixed = fixedFromVuln(vuln, name);
        findings.push({
          fingerprint: depsFp(name, version, id),
          source: "deps",
          severity: severityFromVuln(vuln),
          title: `${name}@${version} — ${id}${fixed ? ` (fixed in ${fixed})` : ""}`,
          where: repoName,
          detail: (vuln.summary ?? vuln.details ?? "vulnerable dependency").slice(0, 300),
          fix: fixed
            ? `Update \`${name}\` to **${fixed}** or later. Bump the version requirement, install, commit the updated lockfile, and redeploy.`
            : `No fixed release exists yet for \`${name}\`. Check upstream issues for a patch; consider removing or replacing the dependency.`,
        });
      }
    }
  }
  return findings;
}

async function scanSecrets(repoDir: string, repoName: string, tmp: string): Promise<Finding[]> {
  const ver = await toolVersion("gitleaks");
  const report = path.join(tmp, `gitleaks-${repoName}.json`);
  const args =
    majorOf(ver ?? "") >= 2
      ? ["git", repoDir, "--report-format", "json", "--report-path", report, "--redact", "--no-banner"]
      : ["detect", "--source", repoDir, "--report-format", "json", "--report-path", report, "--redact", "--no-banner"];
  // exit 1 = leaks found
  await sh("gitleaks", args, [0, 1]);
  const raw = await fs.readFile(report, "utf8").catch(() => "[]");
  const leaks = JSON.parse(raw || "[]");
  return leaks.map((l: any) => ({
    fingerprint: `secrets:${l.Fingerprint ?? `${l.RuleID}:${l.File}:${l.Commit}`}`,
    source: "secrets" as const,
    severity: "high" as Severity,
    title: `Secret in git history: ${l.Description ?? l.RuleID} (${l.File ?? "?"})`,
    where: repoName,
    detail: `Committed around ${l.Commit ?? "?"}. Value redacted — see the file/commit for context.`,
    fix: "Rotate this secret first (revoke at the provider, issue a new one, update the deploy environment). Then decide whether history rewrite is worth it — rotation alone removes the risk.",
  }));
}

const SEMGREP_SEV: Record<string, Severity> = { ERROR: "high", WARNING: "medium", INFO: "low" };

async function scanSast(repoDir: string, repoName: string): Promise<Finding[]> {
  const { stdout } = await sh(
    "semgrep",
    [
      "scan", "--json", "--metrics=off", "--quiet",
      "--config", "p/owasp-top-ten", "--config", "p/typescript", "--config", "p/dockerfile",
      repoDir,
    ],
    [0, 1, 2],
  );
  const out = JSON.parse(stdout || "{}");
  return (out.results ?? []).map((r: any) => {
    const rel = path.relative(repoDir, r.path ?? ""); // semgrep reports the absolute temp path
    return {
    fingerprint: `sast:${r.check_id}:${rel}`,
    source: "sast" as const,
    severity: SEMGREP_SEV[r.extra?.severity] ?? "medium",
    title: `${r.check_id} — ${rel}:${r.start?.line ?? "?"}`,
    where: repoName,
    detail: (r.extra?.message ?? "").slice(0, 300),
    fix: `Review ${repoName}/${rel} around line ${r.start?.line ?? "?"}. Confirm whether the flagged pattern is reachable with untrusted input; if yes, fix the code, if no, document why it is safe (triage note).`,
    };
  });
}

// ---------- RLS lint (pure TS, only when supabase/migrations exists) ----------

async function walkCodeFiles(dir: string, out: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 6) return out;
  const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo"]);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) await walkCodeFiles(path.join(dir, e.name), out, depth + 1);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|html)$/.test(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

export function lintRlsSql(sql: string): { missing: string[]; broad: string[] } {
  const missing: string[] = [];
  const broad: string[] = [];
  const tables = new Set<string>();
  const enabled = new Set<string>();
  const norm = (t: string) => t.replace(/["'`]/g, "").toLowerCase();

  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."'`]+)/gi)) {
    tables.add(norm(m[1]));
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."'`]+)\s+enable\s+row\s+level\s+security/gi)) {
    enabled.add(norm(m[1]));
  }
  for (const t of tables) {
    if (!enabled.has(t)) missing.push(t);
  }
  // Broad policies: granted to anon/public/authenticated with using(true)/with check(true)
  for (const m of sql.matchAll(
    /create\s+policy\s+"([^"]+)"\s+on\s+([\w."'`]+)([^;]*?);/gis,
  )) {
    const [, policy, table, body] = m;
    const roles = body.match(/\bto\s+([\w\s,]+?)(?=\bfor\b|\busing\b|\bwith\b|$)/i)?.[1] ?? "";
    const openRole = /\b(anon|public|authenticated)\b/i.test(roles);
    const wideOpen = /using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i.test(body);
    if (openRole && wideOpen) broad.push(`${norm(table)}."${policy}"`);
  }
  return { missing, broad };
}

async function scanRls(repoDir: string, repoName: string): Promise<Finding[]> {
  const migDir = path.join(repoDir, "supabase", "migrations");
  if (!(await exists(migDir))) return [];
  const findings: Finding[] = [];
  const files = (await fs.readdir(migDir)).filter((f) => f.endsWith(".sql")).sort();
  let sql = "";
  for (const f of files) sql += `\n-- ${f}\n` + (await fs.readFile(path.join(migDir, f), "utf8"));
  const { missing, broad } = lintRlsSql(sql);
  for (const t of missing) {
    findings.push({
      fingerprint: `rls:${repoName}:${t}`,
      source: "rls",
      severity: "high",
      title: `Table ${t} has no ENABLE ROW LEVEL SECURITY`,
      where: repoName,
      detail: "Without RLS the table's rows follow each role's default table privileges — often wide open to anon/authenticated keys.",
      fix: `Run: \`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;\` then add restrictive policies (see fix-playbook.md).`,
    });
  }
  for (const b of broad) {
    findings.push({
      fingerprint: `rls-broad:${repoName}:${b}`,
      source: "rls",
      severity: "high",
      title: `Overly broad RLS policy: ${b}`,
      where: repoName,
      detail: "A policy granted to anon/public/authenticated uses using(true) or with check(true) — that role can read or write every row.",
      fix: "Narrow the policy to specific columns/rows (or a JWT claim check), or restrict it to the service role only. See fix-playbook.md for templates.",
    });
  }
  // service_role key referenced outside supabase/ — could leak a bypass-all key to clients
  for (const f of await walkCodeFiles(repoDir)) {
    const rel = path.relative(repoDir, f);
    if (rel.startsWith("supabase/") || rel.startsWith("docs/")) continue;
    const content = await fs.readFile(f, "utf8").catch(() => "");
    if (/service_role/i.test(content)) {
      findings.push({
        fingerprint: `rls-role:${repoName}:${rel}`,
        source: "rls",
        severity: "high",
        title: `service_role referenced in ${rel}`,
        where: repoName,
        detail: "The service role bypasses RLS entirely. If this file (or the key) can reach a browser bundle, RLS protections don't apply.",
        fix: "Verify this reference is server-only (API route / server component, key from env, never NEXT_PUBLIC_*). If it reaches client code, remove it and proxy through a server route.",
      });
    }
  }
  return findings;
}

const ZAP_RISK: Record<string, Severity> = { "3": "high", "2": "medium", "1": "low", "0": "info" };

async function scanSite(site: { url: string; activeScan?: boolean }, tmp: string): Promise<Finding[]> {
  const wrk = path.join(tmp, `zap-${site.url.replace(/[^a-z0-9]+/gi, "_")}`);
  await fs.mkdir(wrk, { recursive: true });
  await sh("docker", ["pull", "-q", "zaproxy/zap-stable"]);
  const script = site.activeScan ? "zap-full-scan.py" : "zap-baseline.py";
  const { stdout } = await sh(
    "docker",
    ["run", "--rm", "-v", `${wrk}:/zap/wrk/:rw`, "zaproxy/zap-stable", script,
      "-t", site.url, "-J", "zap.json", "-I"],
    [0, 1, 2, 3], // baseline exits nonzero when alerts found; we parse JSON instead
  );
  const report = path.join(wrk, "zap.json");
  const raw = await fs.readFile(report, "utf8").catch(() => {
    throw new Error(`ZAP produced no report for ${site.url}. Last output: ${stdout.slice(-300)}`);
  });
  const out = JSON.parse(raw);
  const findings: Finding[] = [];
  for (const s of out.site ?? []) {
    for (const a of s.alerts ?? []) {
      const risk = String(a.riskcode ?? "1");
      if (risk === "0" || a.riskdesc?.startsWith("Informational")) continue; // skip informational noise
      findings.push({
        fingerprint: `web:${a.pluginid}:${site.url}`,
        source: "web",
        severity: ZAP_RISK[risk] ?? "low",
        title: `${a.name} (risk ${risk}/3)`,
        where: site.url,
        detail: (a.desc ?? "").replace(/<[^>]+>/g, "").slice(0, 400),
        fix: (a.solution ?? "").replace(/<[^>]+>/g, "").slice(0, 400) || "See the OWASP reference for this alert and apply the recommended mitigation.",
      });
    }
  }
  return findings;
}

// ---------- scaffold ----------

function findingBlock(f: Finding): string {
  return [
    `### [${f.severity.toUpperCase()}] ${f.source}: ${f.title}`,
    `- **Where:** ${f.where}`,
    `- **Detail:** ${f.detail}`,
    ``,
    `**Fix:** ${f.fix}`,
    ``,
  ].join("\n");
}

function scaffold(
  client: ClientConfig,
  date: string,
  findings: Finding[],
  state: State,
  delta: Delta,
  failures: string[],
  sectionsWithNoSites: boolean,
): string {
  const bySev = (a: Finding, b: Finding) => {
    const order: Severity[] = ["critical", "high", "medium", "low", "info"];
    return order.indexOf(a.severity) - order.indexOf(b.severity);
  };
  const name = (fps: string[]) =>
    fps
      .map((fp) => findings.find((f) => f.fingerprint === fp)?.title ?? state[fp]?.title ?? fp)
      .map((t) => `- ${t}`)
      .join("\n") || "- (none)";

  const live = findings.filter((f) => !delta.fixedFps.includes(f.fingerprint));

  return `# Security scan — ${client.label} — ${date}

> SCAFFOLD: raw findings below. The agent now triages this into the final report:
> read each flagged file in context, drop false positives, rank by real exploitability,
> upgrade Fix blocks where you know the codebase, then apply the voice pass
> (plain English, short sentences, jargon explained once) on everything a client reads.

## Scope
- Repos: ${client.repos.join(", ") || "(none)"}
- Sites: ${client.sites.map((s) => s.url + (s.activeScan ? " (active)" : " (passive)")).join(", ") || (sectionsWithNoSites ? "(none configured — discover the production URL and add it to assets/clients.json)" : "(none)")}

## TRIAGE TODO (agent)
1. For each finding below, open the flagged file/site and confirm it is real (osv-scanner results are trustworthy; semgrep/ZAP hits need a reality check).
2. Read the auth surface end-to-end: API routes, middleware/proxy, auth helpers, webhook handlers, RLS SQL — tool gaps live here, not in the lists below.
3. Check commits since the last report (\`git log --oneline <last-scan>..HEAD\`) for new auth/security-relevant changes.
4. Order the Do-now section by real-world exploitability, not tool severity.
5. Voice pass, write the final \`<date>.md\` next to this scaffold, delete the scaffold, commit.

## Do now (untriaged order: tool severity)
${[...live].sort(bySev).map(findingBlock).join("\n") || "No findings — nothing to do. 🎉"}

## Deltas vs last run
- NEW (${delta.newFps.length}):
${name(delta.newFps)}
- STILL OPEN (${delta.openFps.length}):
${name(delta.openFps)}
- FIXED (${delta.fixedFps.length}):
${name(delta.fixedFps)}
- ACCEPTED (do not re-alarm, list under residuals) (${delta.acceptedFps.length}):
${name(delta.acceptedFps)}

## Scan failures (check these before trusting a clean section)
${failures.map((f) => `- ${f}`).join("\n") || "- (none)"}

## Raw appendix
Full machine-readable findings: \`~/.security-scanner/${client.slug}/findings.json\`. This scaffold is gitignored; the final report is the deliverable.
`;
}

// ---------- selftest ----------

function selftest(): number {
  const mk = (fp: string, sev: Severity = "high"): Finding => ({
    fingerprint: fp, source: "deps", severity: sev, title: fp, where: "r", detail: "d", fix: "f",
  });
  let failures = 0;
  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    }
  };

  const day = "2026-01-01";
  // 1: brand-new fingerprint → new
  let { state, delta } = reconcile({}, [mk("A"), mk("B")], day);
  assert(delta.newFps.length === 2 && state.A?.status === "new", "first sighting = new");
  // 2: same again → open
  ({ state, delta } = reconcile(state, [mk("A"), mk("B")], "2026-01-08"));
  assert(delta.openFps.length === 2 && state.A?.status === "open", "second sighting = open");
  // 3: disappears → fixed
  ({ state, delta } = reconcile(state, [mk("A")], "2026-01-15"));
  assert(delta.fixedFps.includes("B") && state.B?.status === "fixed" && state.B?.fixedSeen === "2026-01-15", "absent = fixed");
  // 4: reappears → reopened as open
  ({ state, delta } = reconcile(state, [mk("A"), mk("B")], "2026-01-22"));
  assert(state.B?.status === "open", "reappearing fixed = reopened");
  // 5: accepted persists across presence
  state.C = { status: "accepted", source: "deps", severity: "low", title: "C", where: "r", firstSeen: day, lastSeen: day };
  ({ state, delta } = reconcile(state, [mk("A"), mk("B"), mk("C")], "2026-01-29"));
  assert(state.C.status === "accepted" && delta.acceptedFps.includes("C"), "accepted stays accepted");
  // 6: fingerprints are stable strings
  assert(depsFp("next", "16.3.1", "GHSA-x") === "deps:next@16.3.1:GHSA-x", "deps fingerprint format");
  // 7: RLS lint
  const sql = `
    create table public.things (id uuid);
    create table public.safe_things (id uuid);
    alter table public.safe_things enable row level security;
    create policy "everyone" on public.safe_things for select to anon using (true);
  `;
  const lint = lintRlsSql(sql);
  assert(lint.missing.includes("public.things"), "RLS lint catches missing RLS");
  assert(!lint.missing.includes("public.safe_things"), "RLS lint respects enabled tables");
  assert(lint.broad.some((b) => b.includes("safe_things") && b.includes("everyone")), "RLS lint catches broad anon policy");
  // 8: partial runs don't fixed-mark sections they skipped
  const partialState: State = {
    W: { status: "open", source: "web", severity: "low", title: "W", where: "s", firstSeen: day, lastSeen: day },
    D: { status: "open", source: "deps", severity: "high", title: "D", where: "r", firstSeen: day, lastSeen: day },
  };
  const partial = reconcile(partialState, [], "2026-02-05", new Set<Section>(["deps"]));
  assert(partial.state.W.status === "open", "partial run leaves skipped sections alone");
  assert(partial.state.D.status === "fixed", "partial run fixes sections it ran");
  // 9: dedupeByFingerprint keeps first occurrence
  assert(dedupeByFingerprint([mk("X"), mk("X"), mk("Y")]).length === 2, "dedupe by fingerprint");

  if (failures === 0) {
    console.log("selftest: all assertions passed");
    return 0;
  }
  console.error(`selftest: ${failures} assertion(s) failed`);
  return 1;
}

// ---------- main ----------

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) process.exit(selftest());

  const clientIdx = argv.indexOf("--client");
  const slug = clientIdx >= 0 ? argv[clientIdx + 1] : null;
  if (!slug) {
    console.error("usage: bun scan.ts --client <slug> [--only deps,secrets,sast,rls,web] [--yes-active] [--selftest]");
    process.exit(1);
  }
  const onlyArg = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
  const wanted = new Set<Section>(onlyArg ? (onlyArg.split(",") as Section[]) : ["deps", "secrets", "sast", "rls", "web"]);
  const yesActive = argv.includes("--yes-active");

  const skillDir = path.dirname(import.meta.dir); // scripts/ -> skill dir
  const manifest: { clients: ClientConfig[] } = JSON.parse(
    await fs.readFile(path.join(skillDir, "assets", "clients.json"), "utf8"),
  );
  const client = manifest.clients.find((c) => c.slug === slug);
  if (!client) {
    console.error(`unknown client "${slug}". Known: ${manifest.clients.map((c) => c.slug).join(", ")}`);
    process.exit(1);
  }

  // preflight — fail before touching repos
  const required: Record<Section, string[]> = {
    deps: ["osv-scanner"], secrets: ["gitleaks"], sast: ["semgrep"], rls: [], web: ["docker"],
  };
  const missingTools: string[] = [];
  for (const t of [...wanted].flatMap((s) => required[s])) {
    if (!(await toolVersion(t))) missingTools.push(t);
  }
  if (missingTools.length) {
    console.error(`missing tools: ${missingTools.join(", ")}\ninstall:  brew install ${missingTools.join(" ")}`);
    process.exit(1);
  }

  const root = await repoRoot();
  const stateDir = path.join(os.homedir(), ".security-scanner", client.slug);
  await fs.mkdir(stateDir, { recursive: true });
  const statePath = path.join(stateDir, "findings.json");
  const state: State = (await fs.readFile(statePath, "utf8").then(JSON.parse).catch(() => ({}))) as State;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), `security-scan-${client.slug}-`));
  const findings: Finding[] = [];
  const failures: string[] = [];
  const activeSitesSkipped: string[] = [];

  try {
    for (const repo of client.repos) {
      const repoName = repo.split("/").pop() ?? repo;
      const repoDir = path.join(tmp, repoName);
      try {
        await sh("gh", ["repo", "clone", repo, repoDir, "--", "--quiet"]);
      } catch (e: any) {
        failures.push(`clone ${repo}: ${e.message}`);
        continue;
      }
      if (wanted.has("deps")) await scanDeps(repoDir, repoName).then((f) => findings.push(...f)).catch((e) => failures.push(`deps ${repoName}: ${e.message}`));
      if (wanted.has("secrets")) await scanSecrets(repoDir, repoName, tmp).then((f) => findings.push(...f)).catch((e) => failures.push(`secrets ${repoName}: ${e.message}`));
      if (wanted.has("sast")) await scanSast(repoDir, repoName).then((f) => findings.push(...f)).catch((e) => failures.push(`sast ${repoName}: ${e.message}`));
      if (wanted.has("rls")) await scanRls(repoDir, repoName).then((f) => findings.push(...f)).catch((e) => failures.push(`rls ${repoName}: ${e.message}`));
    }

    if (wanted.has("web")) {
      for (const site of client.sites) {
        if (site.activeScan && !yesActive) {
          activeSitesSkipped.push(`${site.url} — activeScan is on for this site; requires client consent + --yes-active`);
          continue;
        }
        await scanSite(site, tmp).then((f) => findings.push(...f)).catch((e) => failures.push(`web ${site.url}: ${e.message}`));
      }
    }

    // dedupe + persist state
    const { state: next, delta } = reconcile(state, dedupeByFingerprint(findings), today(), wanted);
    await fs.writeFile(statePath, JSON.stringify(next, null, 2));

    // merge delta statuses into displayed findings (accepted → keep title visible in residuals)
    const reportsDir = path.join(root, "security-reports", client.slug);
    await fs.mkdir(reportsDir, { recursive: true });
    const scaffoldPath = path.join(reportsDir, `${today()}.scaffold.md`);
    const md = scaffold(client, today(), findings, next, delta, failures, wanted.has("web") && client.sites.length === 0);
    await fs.writeFile(scaffoldPath, md);
    if (activeSitesSkipped.length) {
      await fs.appendFile(scaffoldPath, `\n## Active scans skipped\n${activeSitesSkipped.map((s) => `- ${s}`).join("\n")}\n`);
    }

    console.log(`findings: ${findings.length} live, +${delta.newFps.length} new, ${delta.fixedFps.length} fixed`);
    console.log(`scaffold: ${scaffoldPath}`);
    console.log(`state:    ${statePath}`);
    if (failures.length) console.log(`failures: ${failures.length} (see scaffold)`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

if (import.meta.main) main();
