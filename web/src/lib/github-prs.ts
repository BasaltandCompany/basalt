// GitHub PR webhook → deliverables. The webhook payload carries everything
// we store; no GitHub API calls, no credentials beyond the webhook secret.
// Matching mirrors Linear's model: the DEL-<n> key in the branch name, PR
// title, or body links the PR to that deliverable, and PR events move
// deliverable status forward (planned → in_progress → review).
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { deliverables, githubInstallations, pullRequests } from "~/db/schema";
import { linkComponents } from "~/lib/entity-links";

export type PullRequestPayload = {
	action: string;
	pull_request: {
		id: number;
		number: number;
		title: string;
		state: "open" | "closed";
		merged: boolean;
		html_url: string;
		body: string | null;
		user?: { login?: string };
		head: { ref: string };
	};
	repository?: { full_name?: string; owner?: { login?: string } };
	installation?: { id?: number };
};

export type InstallationPayload = {
	action: string;
	installation: {
		id: number;
		account?: { login?: string };
		repository_selection?: string;
	};
};

/** Actions the webhook acts on; GitHub sends ~20 others (assigned, labeleled…) */
const ACTIONS = new Set(["opened", "reopened", "edited", "synchronize", "closed"]);

/** \b so "MODEL-12" doesn't match; case-insensitive so humans win. */
const DELIVERABLE_KEY_RE = /\bDEL-(\d+)\b/gi;

/** All DEL-<n> numbers referenced across branch, title, body, deduped. */
export function parseDeliverableNumbers(pr: {
	head: { ref: string };
	title: string;
	body: string | null;
}): number[] {
	const haystack = `${pr.head.ref}\n${pr.title}\n${pr.body ?? ""}`;
	const seen = new Set<number>();
	for (const m of haystack.matchAll(DELIVERABLE_KEY_RE)) {
		seen.add(Number(m[1]));
	}
	return [...seen];
}

/** Deliverable status automation. Returns the new status or null = keep.
 *  completed/blocked/review are never regressed; closed-without-merge is a no-op. */
export function nextDeliverableStatus(
	current: string,
	action: string,
	merged: boolean,
): "in_progress" | "review" | null {
	if (action === "opened" || action === "reopened") {
		return current === "planned" ? "in_progress" : null;
	}
	if (action === "closed" && merged) {
		return current === "planned" || current === "in_progress" ? "review" : null;
	}
	return null;
}

/** Upsert the PR mirror, link every referenced deliverable, move statuses.
 *  Idempotent: githubId upsert + onConflictDoNothing links, so webhook
 *  redelivery changes nothing. */
export async function applyPullRequest(
	payload: PullRequestPayload,
): Promise<{ linked: number; statusChanged: number }> {
	if (!ACTIONS.has(payload.action)) return { linked: 0, statusChanged: 0 };
	const pr = payload.pull_request;
	const repo = payload.repository?.full_name ?? "";
	const author = pr.user?.login ?? "unknown";

	const [row] = await db
		.insert(pullRequests)
		.values({
			githubId: pr.id,
			repo,
			number: pr.number,
			title: pr.title,
			state: pr.state,
			merged: pr.merged,
			url: pr.html_url,
			author,
			headBranch: pr.head.ref,
		})
		.onConflictDoUpdate({
			target: pullRequests.githubId,
			set: { repo, number: pr.number, title: pr.title, state: pr.state, merged: pr.merged, url: pr.html_url, author, headBranch: pr.head.ref },
		})
		.returning();

	// Self-healing installation mirror: PRs may arrive before/without an
	// installation event (apps installed before this feature).
	if (payload.installation?.id) {
		await upsertInstallation({
			id: payload.installation.id,
			account: { login: payload.repository?.owner?.login },
		});
	}

	let linked = 0;
	let statusChanged = 0;
	for (const n of parseDeliverableNumbers(pr)) {
		const [d] = await db.select().from(deliverables).where(eq(deliverables.number, n)).limit(1);
		if (!d) {
			console.log(`[github-prs] DEL-${n} not found (${repo}#${pr.number})`);
			continue;
		}
		await linkComponents(
			{ kind: "deliverable", id: d.id },
			{ kind: "pull_request", id: row.id },
			{ linkType: "pr", createdBy: "agent" },
		);
		linked++;
		const to = nextDeliverableStatus(d.status, payload.action, pr.merged);
		if (to && to !== d.status) {
			await db.update(deliverables).set({ status: to }).where(eq(deliverables.id, d.id));
			statusChanged++;
		}
	}
	return { linked, statusChanged };
}

function upsertInstallation(installation: InstallationPayload["installation"]) {
	return db
		.insert(githubInstallations)
		.values({
			installationId: installation.id,
			accountLogin: installation.account?.login ?? "",
			repoSelection: installation.repository_selection ?? "",
		})
		.onConflictDoUpdate({
			target: githubInstallations.installationId,
			set: {
				accountLogin: installation.account?.login ?? "",
				repoSelection: installation.repository_selection ?? "",
			},
		});
}

/** installation.created → mirror, installation.deleted → forget. Other
 *  installation actions (suspend, new_permissions_accepted) are no-ops. */
export async function applyInstallation(payload: InstallationPayload): Promise<{ ok: boolean }> {
	if (payload.action === "created") {
		await upsertInstallation(payload.installation);
	} else if (payload.action === "deleted") {
		await db.delete(githubInstallations).where(eq(githubInstallations.installationId, payload.installation.id));
	}
	return { ok: true };
}

/** CSRF state for redirects WE initiate to GitHub's authorize URL
 *  (/api/github/authorize): timestamp + HMAC under the webhook secret.
 *  Install-initiated callbacks (GitHub → us, no state) are instead guarded
 *  by the confirm step on the link page. */
export function makeGithubAuthState(secret: string, now = Date.now()): string {
	const ts = String(Math.floor(now / 1000));
	const sig = createHmac("sha256", secret).update(ts).digest("hex").slice(0, 32);
	return `${ts}.${sig}`;
}

export function verifyGithubAuthState(
	state: string,
	secret: string,
	maxAgeSec = 600,
	now = Date.now(),
): boolean {
	const [ts, sig] = state.split(".");
	if (!ts || !sig || !/^\d+$/.test(ts)) return false;
	if (Math.floor(now / 1000) - Number(ts) > maxAgeSec) return false;
	const expected = createHmac("sha256", secret).update(ts).digest("hex").slice(0, 32);
	const a = Buffer.from(sig, "hex");
	const b = Buffer.from(expected, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}

export type GithubIdentity = { githubId: number; login: string };

/** Exchange the user-authorization code for the GitHub user behind it.
 *  Only needs client_id/client_secret — no app private key. The user token
 *  is used once here and discarded; we store the identity, not the token. */
export async function exchangeGithubCode(code: string): Promise<GithubIdentity> {
	const clientId = process.env.GITHUB_APP_CLIENT_ID;
	const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
	if (!clientId || !clientSecret) throw new Error("GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET not set");
	const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
	});
	const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
	if (!tokenJson.access_token) {
		throw new Error(tokenJson.error_description ?? "GitHub code exchange failed");
	}
	const userRes = await fetch("https://api.github.com/user", {
		headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/vnd.github+json" },
	});
	const user = (await userRes.json()) as { id?: number; login?: string };
	if (!user.id || !user.login) throw new Error("GitHub /user lookup failed");
	return { githubId: user.id, login: user.login };
}
