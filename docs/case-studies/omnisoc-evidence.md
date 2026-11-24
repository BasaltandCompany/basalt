# OmniSOC / REN-ISAC case study evidence

**Source checked:** `~/Downloads/omnisoc-commits/` (the requested `~/Downloads/omnisoc-stats` directory did not exist during implementation). `analyze_all.py` reads `my_commits_all.jsonl` and `my_prs.jsonl`, splitting at the Pi Coding Agent installation timestamp `2026-04-30T09:36:26Z`; export ends Nov 23, 2026. Do **not** copy the raw private PR titles, infrastructure names, addresses, or internal repository URLs into this public repo.

| Measure | Before (Feb 2, 2024–Apr 30, 2026; ~117 weeks) | After (Apr 30–Nov 23, 2026; ~30 weeks) |
| --- | --- | --- |
| Collin's commits | 295 · 2.5/wk | 165 · 5.6/wk |
| Collin's PRs opened | 106 · 0.9/wk | 60 · 2.0/wk |
| Collin's PRs merged | 101 · 0.9/wk | 55 · 1.9/wk |
| Merged PR rate change | — | ~2.2× |

The periods are different lengths; always compare weekly rates. These figures measure **Collin's activity**, not the four-person team's total output, engineering effort saved, data processing throughput, or causal effect of the harness. The data show a before/after association around the Pi installation, not that every improvement was caused by an agent. The statement that a four-person team ingested ~56 TB/day and the architecture details (internal open-source models, Orca, Pi Coding Agent and safe execution MCP with SHA-verified commands) came from Collin's case-study brief, not from the PR export. Verify their scope and permission before adding further operational specifics.

## Tool claims checked against the public repos

- **LILY** (`github.com/aspectrr/lily`, Go): CLI wrapper + guard hook for coding agents. Rewrites agent SSH / AWS SSM / gcloud / Azure / kubectl-exec commands into validated read-only runs; `lily.yaml` allowlists commands and tools per host; destructive commands are hardcoded-blocked; rate limit (1 cmd/sec default), 1 MB output cap, 30s timeout. Matches the case-study copy.
- **Deer** (`github.com/aspectrr/deer.sh`, Go): restricted read-only shell on source hosts, microVM sandboxes with replayed (PII-redacted) data, auto-generated Ansible playbooks applied to production only after human review. Matches the case-study copy.
- The Anarlog meeting layer, ClickUp MCP, SharePoint query tool, ES/OpenSearch monitor-only MCP server, Orca Docker sandbox usage, and the university-internal LLM provider come from Collin's brief and are not independently verifiable from public sources here.
- The interactive chart buckets monthly from `tenure.json` (`commits`, and `prs` counted by merge month). Chart totals (290 commits before / 170 after) differ by a few from the analysis script (295/165) because the script splits mid-April 2026 at the exact install timestamp while the chart splits by month. Keep using the script numbers for the 2.2× rate claim.
