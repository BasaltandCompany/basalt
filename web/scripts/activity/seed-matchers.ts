#!/usr/bin/env bun
// Seed the activity attribution map (ASPTR-227). One-time: enumerate Orca
// workspaces + git remotes, match them to basalt projects, upsert curated
// matchers via /api/activity/matchers (mc_ key). Correct the two bucket
// lists below once — they are only my best guesses.
//   cd web && ACTIVITY_API_KEY=mc_... bun scripts/activity/seed-matchers.ts [--dry]
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Basalt-the-business work (shows in the internal bucket)
const INTERNAL_FOLDERS = [
	"basalt", "madcactus.org", "redline", "feedback-server", "company-brain",
	"business-lens-skill", "cold-email-skill", "sales-skills", "content-from-shipping",
	"email-for-agents", "software-factory", "security-review", "ideas", "llm-proxy",
	"efficient-harness", "open-source-agent", "pix-mono", "meetings-cli", "outpost",
	"fine-tune-agent-data", "linkedin-extension", "interviewer", "senior-helpers-agent",
];
// Life stuff (shows in the personal bucket)
const PERSONAL_FOLDERS = [
	"wedding", "world-cup-pool", "online-poker", "meal-prep-skill", "personal-shopper",
	"gift-site", "date-skill", "coursework-structure", "jellyfin-streaming",
	"local-artist-clothing", "ai-learning", "book-outreach-manager", "learning-loop",
	"markdown-captchas", "macro", "gbrain", "timbre",
];

const DRY = process.argv.includes("--dry");
const WORKSPACES = join(homedir(), "orca/workspaces");

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
	const config = await loadConfig();
	const res = await fetch(`${config.baseUrl}/api/activity/matchers`, {
		headers: { Authorization: `Bearer ${config.apiKey}` },
	});
	if (!res.ok) throw new Error(`matchers GET ${res.status}: ${await res.text()}`);
	const { projects } = (await res.json()) as { projects: { id: string; name: string; companyName: string | null; status: string }[] };

	type Matcher = { projectId: string | null; category: "internal" | "personal" | null; kind: "git_remote" | "worktree" | "title"; pattern: string };
	const matchers: Matcher[] = [];
	const unmatched: string[] = [];

	for (const folder of readdirSync(WORKSPACES)) {
		const path = join(WORKSPACES, folder);
		if (!statSync(path).isDirectory()) continue;
		if (INTERNAL_FOLDERS.includes(folder)) {
			matchers.push({ projectId: null, category: "internal", kind: "worktree", pattern: path });
			continue;
		}
		if (PERSONAL_FOLDERS.includes(folder)) {
			matchers.push({ projectId: null, category: "personal", kind: "worktree", pattern: path });
			continue;
		}
		// client folders match a basalt project by project OR company name
		const project = projects.find(
			(p) => p.name && (norm(folder).startsWith(norm(p.name)) || norm(p.name).startsWith(norm(folder))),
		);
		if (project) {
			matchers.push({ projectId: project.id, category: null, kind: "worktree", pattern: path });
			matchers.push({ projectId: project.id, category: null, kind: "title", pattern: project.name });
		} else {
			unmatched.push(folder);
		}
		// git remotes: a worktree rooted at the folder level maps the repo
		if (existsSync(join(path, ".git"))) {
			const remote = spawnSync("git", ["-C", path, "remote", "get-url", "origin"], { encoding: "utf8" });
			if (remote.status === 0 && remote.stdout.trim() && project) {
				matchers.push({ projectId: project.id, category: null, kind: "git_remote", pattern: remote.stdout.trim() });
			}
		}
	}

	console.log(`matched: ${matchers.length} matchers across ${readdirSync(WORKSPACES).length - unmatched.length} folders`);
	if (unmatched.length) console.log(`no basalt project found for: ${unmatched.join(", ")}\n→ create/attach the project on the admin side, then re-run.`);

	if (DRY || matchers.length === 0) {
		console.log(JSON.stringify(matchers, null, 2));
		return;
	}
	const post = await fetch(`${config.baseUrl}/api/activity/matchers`, {
		method: "POST",
		headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ matchers }),
	});
	if (!post.ok) throw new Error(`matchers POST ${post.status}: ${await post.text()}`);
	console.log(`upserted: ${(await post.json()).upserted} matchers`);
}

async function loadConfig(): Promise<{ baseUrl: string; apiKey: string }> {
	// env first, then ~/.config/basalt/activity.json
	try {
		const file = Bun.file(join(homedir(), ".config/basalt/activity.json"));
		if (await file.exists()) {
			const cfg = await file.json();
			return { baseUrl: process.env.ACTIVITY_BASE_URL ?? cfg.baseUrl, apiKey: process.env.ACTIVITY_API_KEY ?? cfg.apiKey };
		}
	} catch { /* fall through to env-only */ }
	if (!process.env.ACTIVITY_API_KEY) throw new Error("Set ACTIVITY_API_KEY (mc_ key) or create ~/.config/basalt/activity.json");
	return { baseUrl: process.env.ACTIVITY_BASE_URL ?? "https://basalt.ac", apiKey: process.env.ACTIVITY_API_KEY };
}

// attribution helpers stay importable for --dry previews
export { loadConfig, norm };

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
