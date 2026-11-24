#!/usr/bin/env bun
// Pi agent-usage scanner (ASPTR-227) — the token half of activity tracking.
// Walks ~/.pi/agent/sessions/**/*.jsonl, attributes each session's cwd via
// the matcher map, aggregates per (session, day, model) and upserts to
// /api/activity/usage. Replays are exact (dedupeKey upserts), so a failed
// run just re-scans the same window on the next launchd tick.
//   cd web && ACTIVITY_API_KEY=mc_... bun scripts/activity/pi-usage-scan.ts [--dry] [--since 7d]
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { indexMatchers, matchCodingSession, type MatcherIndex } from "~/lib/activity/match";

const SESSIONS_DIR = join(homedir(), ".pi/agent/sessions");
const STATE_FILE = join(homedir(), ".local/share/basalt/pi-scan-state.json");

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: number };
type Row = {
	dedupeKey: string; day: string; projectId: string | null; category: "internal" | "personal" | null;
	provider: string | null; model: string | null; inputTokens: number; outputTokens: number;
	cacheReadTokens: number; cacheWriteTokens: number; totalTokens: number; apiCostUsd: number; sessionCount: number;
};

function sinceMs(): number {
	const arg = process.argv.find((a) => a.startsWith("--since"));
	const val = arg ? arg.split("=")[1] ?? process.argv[process.argv.indexOf(arg) + 1] : null;
	const m = val?.match(/^(\d+)d$/);
	if (m) return Date.now() - Number(m[1]) * 86_400_000;
	// default: last successful scan, minus 1 day overlap for safety
	try {
		const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
		return Math.max(Date.now() - 31 * 86_400_000, state.lastSuccessAt - 86_400_000);
	} catch {
		return Date.now() - 7 * 86_400_000;
	}
}

function* sessionFiles(dir: string): Generator<string> {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const e of entries) {
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* sessionFiles(p);
		else if (e.name.endsWith(".jsonl")) yield p;
	}
}

function dayOf(ts: string): string {
	return new Date(ts).toISOString().slice(0, 10);
}

async function main() {
	const dry = process.argv.includes("--dry");
	const since = sinceMs();
	const config = await loadConfig(dry);

	// --dry without a key still runs, just unattributed
	let matchers: MatcherIndex = indexMatchers([]);
	try {
		matchers = await fetchMatchers(config);
	} catch (e) {
		if (!dry) throw e;
	}

	const remoteCache = new Map<string, string | null>();
	const remoteFor = (cwd: string): string | null => {
		if (remoteCache.has(cwd)) return remoteCache.get(cwd)!;
		const r = spawnSync("git", ["-C", cwd, "remote", "get-url", "origin"], { encoding: "utf8" });
		const url = r.status === 0 ? r.stdout.trim() : null;
		remoteCache.set(cwd, url);
		return url;
	};

	const rows: Row[] = [];
	let files = 0;
	for (const file of sessionFiles(SESSIONS_DIR)) {
		if (statSync(file).mtimeMs < since) continue;
		files++;
		const usageBy = new Map<string, Usage & { projectId: string | null; category: "internal" | "personal" | null; provider: string | null; model: string | null }>();
		let cwd: string | null = null;
		for (const line of readFileSync(file, "utf8").split("\n")) {
			if (!line) continue;
			let item: any;
			try {
				item = JSON.parse(line);
			} catch {
				continue; // concurrent append can leave a partial final line
			}
			if (item.type === "session" && typeof item.cwd === "string") cwd = item.cwd;
			if (item.type !== "message" || item.message?.role !== "assistant" || !item.message.usage) continue;
			const ts = item.timestamp;
			if (!ts || Date.parse(ts) < since) continue;
			const u = item.message.usage;
			const bucket = cwd ? matchCodingSession(cwd, remoteFor(cwd), matchers) : null;
			const key = `${dayOf(ts)}:${item.message.model ?? "?"}`;
			const agg =
				usageBy.get(key) ??
				{
					input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0,
					projectId: bucket ? ("projectId" in bucket ? bucket.projectId : null) : null,
					category: bucket && "category" in bucket ? bucket.category : null,
					provider: item.message.provider ?? null,
					model: item.message.model ?? null,
				};
			agg.input += u.input ?? 0;
			agg.output += u.output ?? 0;
			agg.cacheRead += u.cacheRead ?? 0;
			agg.cacheWrite += u.cacheWrite ?? 0;
			agg.total += u.totalTokens ?? 0;
			agg.cost += u.cost?.total ?? 0;
			usageBy.set(key, agg);
		}
		for (const [key, agg] of usageBy) {
			const [day] = key.split(":");
			rows.push({
				dedupeKey: `pi:${basename(file)}:${key}`,
				day,
				projectId: agg.projectId,
				category: agg.category,
				provider: agg.provider,
				model: agg.model,
				inputTokens: agg.input,
				outputTokens: agg.output,
				cacheReadTokens: agg.cacheRead,
				cacheWriteTokens: agg.cacheWrite,
				totalTokens: agg.total,
				apiCostUsd: Math.round(agg.cost * 10000) / 10000,
				sessionCount: 1,
			});
		}
	}

	if (dry) {
		console.log(`scanned ${files} session files since ${new Date(since).toISOString()}`);
		const byProject = new Map<string, { tokens: number; cost: number }>();
		for (const r of rows) {
			const k = r.projectId ?? r.category ?? "unassigned";
			const t = byProject.get(k) ?? { tokens: 0, cost: 0 };
			t.tokens += r.totalTokens;
			t.cost += r.apiCostUsd;
			byProject.set(k, t);
		}
		for (const [k, v] of byProject) console.log(`${k}: ${(v.tokens / 1e6).toFixed(2)}M tokens, $${v.cost.toFixed(2)} api-equivalent`);
		return;
	}

	if (rows.length) {
		const res = await fetch(`${config.baseUrl}/api/activity/usage`, {
			method: "POST",
			headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ rows }),
		});
		if (!res.ok) throw new Error(`usage POST ${res.status}: ${await res.text()}`);
		console.log(`uploaded ${rows.length} usage rows from ${files} session files`);
	} else {
		console.log(`no usage since ${new Date(since).toISOString()}`);
	}
	mkdirSync(join(homedir(), ".local/share/basalt"), { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify({ lastSuccessAt: Date.now() }));
}

async function fetchMatchers(config: { baseUrl: string; apiKey: string }): Promise<MatcherIndex> {
	const res = await fetch(`${config.baseUrl}/api/activity/matchers`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
	if (!res.ok) throw new Error(`matchers GET ${res.status}`);
	const { matchers } = await res.json();
	return indexMatchers(matchers);
}

async function loadConfig(dry = false): Promise<{ baseUrl: string; apiKey: string }> {
	if (!process.env.ACTIVITY_API_KEY && dry) return { baseUrl: "https://basalt.ac", apiKey: "" };
	if (!process.env.ACTIVITY_API_KEY) throw new Error("Set ACTIVITY_API_KEY (mc_ key) in the launchd plist or env");
	return { baseUrl: process.env.ACTIVITY_BASE_URL ?? "https://basalt.ac", apiKey: process.env.ACTIVITY_API_KEY };
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
