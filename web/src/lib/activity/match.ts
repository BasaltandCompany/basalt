// Activity attribution (ASPTR-227). Pure functions — no db — so tests cover
// every rule. Precedence: worktree path (exact) > git remote (exact) >
// window-title keyword (inferred). Ambiguity resolves to null = unassigned;
// we never bill a client on a coin flip.
import type { MatcherCategory, MatcherKind, ProjectMatcher } from "~/db/schema";

export type Bucket = { projectId: string } | { category: MatcherCategory } | null;

export type MatcherIndex = {
	worktree: { pattern: string; bucket: NonNullable<Bucket>; length: number }[];
	remote: { pattern: string; bucket: NonNullable<Bucket>; length: number }[];
	title: { pattern: string; bucket: NonNullable<Bucket> }[];
};

export const bucketOf = (m: Pick<ProjectMatcher, "projectId" | "category">): NonNullable<Bucket> =>
	m.projectId ? { projectId: m.projectId } : { category: m.category ?? "internal" };

/** Longest-prefix match; identical patterns for different buckets can't exist
 * (unique index on kind+pattern), so the only ambiguity is length ties — none. */
export function indexMatchers(
	matchers: Pick<ProjectMatcher, "kind" | "pattern" | "projectId" | "category">[],
): MatcherIndex {
	const index: MatcherIndex = { worktree: [], remote: [], title: [] };
	for (const m of matchers) {
		const bucket = bucketOf(m);
		if (m.kind === "worktree") index.worktree.push({ pattern: stripTrailingSlash(m.pattern), bucket, length: 0 });
		else if (m.kind === "git_remote") index.remote.push({ pattern: normalizeRemote(m.pattern), bucket, length: 0 });
		else index.title.push({ pattern: m.pattern.toLowerCase(), bucket });
	}
	for (const w of index.worktree) w.length = w.pattern.length;
	index.worktree.sort((a, b) => b.length - a.length);
	for (const r of index.remote) r.length = r.pattern.length;
	index.remote.sort((a, b) => b.length - a.length);
	return index;
}

function stripTrailingSlash(p: string): string {
	return p.endsWith("/") ? p.slice(0, -1) : p;
}

export function normalizeRemote(url: string): string {
	return url
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^git@/, "")
		.replace(/\.git$/, "")
		.replace(/^([^/]+):/, "$1/"); // git@github.com:org/repo → github.com/org/repo
}

/** cwd → bucket via longest worktree prefix. */
export function matchWorktree(cwd: string, index: MatcherIndex): NonNullable<Bucket> | null {
	const c = stripTrailingSlash(cwd);
	for (const w of index.worktree) if (c === w.pattern || c.startsWith(w.pattern + "/")) return w.bucket;
	return null;
}

/** git remote URL → bucket via longest substring match on the normalized remote. */
export function matchRemote(remote: string, index: MatcherIndex): NonNullable<Bucket> | null {
	const r = normalizeRemote(remote);
	for (const w of index.remote) if (r.includes(w.pattern)) return w.bucket;
	return null;
}

/** window title / app name → bucket. Case-insensitive substring; longest
 * pattern wins so "BCW Hub" outranks "BCW". */
export function matchTitle(title: string | null | undefined, appName: string | null | undefined, index: MatcherIndex): NonNullable<Bucket> | null {
	const hay = `${title ?? ""} ${appName ?? ""}`.toLowerCase();
	let best: { pattern: string; bucket: NonNullable<Bucket> } | null = null;
	for (const t of index.title) {
		if (!hay.includes(t.pattern)) continue;
		if (!best || t.pattern.length > best.pattern.length) best = t;
	}
	return best?.bucket ?? null;
}

/** Full precedence for a coding session. */
export function matchCodingSession(cwd: string, remote: string | null, index: MatcherIndex): NonNullable<Bucket> | null {
	return matchWorktree(cwd, index) ?? (remote ? matchRemote(remote, index) : null);
}
