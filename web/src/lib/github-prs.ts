// GitHub PR webhook → deliverables. The webhook payload carries everything
// we store; no GitHub API calls, no credentials beyond the webhook secret.
// Matching mirrors Linear's model: the DEL-<n> key in the branch name, PR
// title, or body links the PR to that deliverable, and PR events move
// deliverable status forward (planned → in_progress → review).
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { deliverables, pullRequests } from "~/db/schema";
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
	repository?: { full_name?: string };
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
