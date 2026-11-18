---
name: security-scanner
description: Run a full security review / vulnerability assessment of a client's GitHub repos and websites — dependency CVEs (osv-scanner), secret history (gitleaks), SAST (semgrep), Supabase RLS lint, OWASP ZAP website scan — then triage findings yourself and produce one client-forwardable markdown report where every finding has an inline Fix block. Use when asked to "run a security scan", "vulnerability assessment", "security review", "audit client repos", "check for vulnerabilities", "pentest-lite", "OWASP scan", or a "weekly security review" for a client.
---

# Security scanner

One command gets you raw findings + a scaffold; your judgment turns that into the client deliverable. No API keys involved — you are the triage layer.

## When to use

- "Run a security scan for <client>" / "vulnerability assessment on these repos"
- Weekly/periodic client reviews
- Fresh client onboarding (first run = full baseline, everything will be NEW)

## Procedure

1. **Preflight** — verify the tools exist; if any are missing, print the exact install line and stop:
   `osv-scanner`, `gitleaks`, `semgrep` → `brew install osv-scanner gitleaks semgrep`; `docker` for website scans. Do not install anything beyond brew without asking.
2. **Run the battery** for the client slug (see `assets/clients.json` for known slugs):
   ```
   bun <this-skill-dir>/scripts/scan.ts --client <slug> [--only deps,secrets,sast,rls,web]
   ```
   It clones each repo to a temp dir via `gh`, runs the tools, updates dedupe state at `~/.security-scanner/<slug>/findings.json`, and writes `security-reports/<slug>/<date>.scaffold.md` in the repo root. `--only` limits sections. If a client has no sites configured, discover their production URL from the repo (README, `fly.toml`, `vercel.json`) and add it to the manifest first.
3. **Triage** (the part tools can't do). Open the scaffold and:
   - Reality-check every semgrep/ZAP hit in context. `osv-scanner` dependency results are trustworthy — keep them (their Fix text already has the fixed-in version).
   - Read the auth surface end-to-end even when tools are quiet: API routes, middleware/`proxy.ts`, auth helpers, webhook signature checks, RLS SQL. Missing route authz, tenant leaks, timing-unsafe token compares, and "Basic auth doesn't cover this path" findings live here.
   - Check commits since the last report's date (`git log --oneline <last-scan>..HEAD`) for new security-relevant changes and scan those diffs yourself.
   - Rank by real exploitability given the actual deployment (public? auth-gated? internal?), not tool severity.
4. **Write the final report** as `security-reports/<slug>/<date>.md`, then delete the scaffold. Report contract:
   - **Verdict line** — one sentence up top ("website clean; pipeline needs one update today").
   - **Do now** — urgent findings, Fix blocks, risk-ordered. Every finding needs a non-empty Fix block: copy-pasteable command or patch-level instruction (use `references/fix-playbook.md`; upgrade deterministic text with file:line specifics when you read the code).
   - **Remaining findings** — same Fix-block format, lower stakes.
   - **Deltas** — NEW / STILL OPEN / FIXED since last run (the scaffold lists them).
   - **Accepted residuals** — known-and-fine items so they stop re-alarming (status `accepted` in findings.json).
   - **Raw appendix** — tool counts and pointers for your own review.
5. **Voice pass** on everything a client reads: plain English, short sentences, ~6th-grade readability, jargon explained once, no internal notes, no secret values (they are already redacted). The report must be forwardable to the client's tech lead as-is.
6. **Commit** the final report. Tell the user: verdict, top fixes, where the report is.

## Fix block rules

- Deps: exact update command + fixed-in version + "commit lockfile, redeploy".
- Secrets: **rotate first, always** (revoke at provider, reissue, update deploy env). History rewrite is an explicit opt-in — never default advice.
- SAST/RLS/ZAP: reference the flagged file:line or policy, give the concrete patch (see playbook templates), or say what to verify to call it a false positive.
- Never fabricate a fix for something you didn't look at. "Verify X is server-only" is a valid fix block.

## Pitfalls

- **osv-scanner is the dep-CVE source of truth.** Raw OSV.dev API queries over-match (catch-all GIT ranges) — never hand-roll OSV queries instead.
- `zap-full-scan.py` (active attacks) only with the site's `activeScan: true` in the manifest, explicit client consent, and `--yes-active`. Baseline is passive and production-safe.
- A clean section with a scan failure in the scaffold is NOT clean. Check the failures section first.
- Reports are client deliverables committed to this repo: no client code pasted wholesale, no unredacted secrets, no speculation about client internals beyond the evidence.
- Don't set findings to `accepted` yourself without evidence it's deliberate (dev-only dep, unused code path, planned migration) — say why in the residuals list.
