import { describe, expect, test } from "bun:test";
import { indexMatchers, matchCodingSession, matchRemote, matchTitle, matchWorktree, normalizeRemote, type MatcherIndex } from "./match";

const index: MatcherIndex = indexMatchers([
	// client CDL owns two worktree roots
	{ kind: "worktree", pattern: "/Users/collinpfeifer/orca/workspaces/cdl", projectId: "p-cdl", category: null },
	{ kind: "worktree", pattern: "/Users/collinpfeifer/orca/workspaces/cdl-pipeline", projectId: "p-cdl", category: null },
	{ kind: "git_remote", pattern: "github.com/BasaltandCompany/bcw-apps", projectId: "p-bcw", category: null },
	{ kind: "title", pattern: "BCW Hub", projectId: "p-bcw", category: null },
	{ kind: "title", pattern: "BCW", projectId: "p-bcw", category: null },
	{ kind: "title", pattern: "wedding", projectId: null, category: "personal" },
]);

describe("worktree matching", () => {
	test("prefix match on exact root and nested ticket worktree", () => {
		expect(matchWorktree("/Users/collinpfeifer/orca/workspaces/cdl", index)).toEqual({ projectId: "p-cdl" });
		expect(matchWorktree("/Users/collinpfeifer/orca/workspaces/cdl/asptr-227-thing/", index)).toEqual({ projectId: "p-cdl" });
	});
	test("longer root wins so cdl-pipeline is not swallowed by cdl", () => {
		// both patterns exist; cdl-pipeline is longer and must win for its own paths
		expect(matchWorktree("/Users/collinpfeifer/orca/workspaces/cdl-pipeline/runs", index)).toEqual({ projectId: "p-cdl" });
		// both map to the same project here — use distinct projects to prove length precedence
		const idx = indexMatchers([
			{ kind: "worktree", pattern: "/w/cdl", projectId: "p-cdl", category: null },
			{ kind: "worktree", pattern: "/w/cdl-pipeline", projectId: "p-other", category: null },
		]);
		expect(matchWorktree("/w/cdl-pipeline/x", idx)).toEqual({ projectId: "p-other" });
		expect(matchWorktree("/w/cdl/x", idx)).toEqual({ projectId: "p-cdl" });
	});
	test("unmatched path stays unassigned, not a guess", () => {
		expect(matchWorktree("/Users/collinpfeifer/orca/workspaces/wedding/site", index)).toBeNull();
	});
});

describe("git remote matching", () => {
	test("normalizes ssh/https/.git forms to one canonical shape", () => {
		expect(normalizeRemote("git@github.com:BasaltandCompany/bcw-apps.git")).toBe("github.com/basaltandcompany/bcw-apps");
		expect(normalizeRemote("https://GitHub.com/BasaltandCompany/bcw-apps")).toBe("github.com/basaltandcompany/bcw-apps");
	});
	test("substring match on normalized remote", () => {
		expect(matchRemote("git@github.com:BasaltandCompany/bcw-apps.git", index)).toEqual({ projectId: "p-bcw" });
		expect(matchRemote("https://github.com/someone/else", index)).toBeNull();
	});
});

describe("title matching", () => {
	test("case-insensitive substring on title or app name", () => {
		expect(matchTitle("Linear — bcw hub design", null, index)).toEqual({ projectId: "p-bcw" });
		expect(matchTitle(null, "Figma", index)).toBeNull();
	});
	test("longest pattern wins: 'BCW Hub' outranks bare 'BCW'", () => {
		const idx = indexMatchers([
			{ kind: "title", pattern: "BCW", projectId: "p-bcw", category: null },
			{ kind: "title", pattern: "BCW Hub", projectId: "p-hub", category: null },
		]);
		expect(matchTitle("bcw hub — v2", null, idx)).toEqual({ projectId: "p-hub" });
		expect(matchTitle("bcw overview", null, idx)).toEqual({ projectId: "p-bcw" });
	});
	test("personal category bucket", () => {
		expect(matchTitle("wedding spreadsheet.numbers", null, index)).toEqual({ category: "personal" });
	});
});

describe("session precedence", () => {
	test("worktree beats remote beats title", () => {
		expect(matchCodingSession("/Users/collinpfeifer/orca/workspaces/cdl/x", "git@github.com:BasaltandCompany/bcw-apps.git", index)).toEqual({ projectId: "p-cdl" });
		expect(matchCodingSession("/somewhere/else", "git@github.com:BasaltandCompany/bcw-apps.git", index)).toEqual({ projectId: "p-bcw" });
		expect(matchCodingSession("/somewhere/else", null, index)).toBeNull();
	});
});
