import { Title } from "@solidjs/meta";
import { A, createAsync } from "@solidjs/router";
import { For, Show, Suspense } from "solid-js";
import Layout from "~/components/Layout";
import { getUserQuery } from "~/lib/queries";
import { getReviewerReviewsQuery } from "~/lib/admin-queries";
import { Card } from "@basaltac/ui";

/** Basalt Reviewer's output — every automated PR review the service posted,
 *  newest first. Read-only: approvals, caps, and re-runs live in the
 *  reviewer service's own /admin. Written into reviewer_reviews by the
 *  service; linked to pull_request rows via entity_links. */
export default function AdminGithubReviews() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const reviews = createAsync(() => getReviewerReviewsQuery(), { deferStream: true });

	return (
		<Layout user={user()}>
			<Title>PR reviews — Basalt</Title>
			<div style={{ "margin-bottom": "32px" }}>
				<h1 class="page-title">PR reviews</h1>
				<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
					Automated Basalt code + security reviews across all client repos, newest first.
					Per-company views live on each company page.
				</p>
			</div>

			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show
					when={reviews()?.length}
					fallback={
						<p class="muted">
							No reviews yet. Install the Basalt Reviewer GitHub App on a client repo,
							approve the installation in the reviewer admin, and reviews land here.
						</p>
					}
				>
					<div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
						<For each={reviews()}>
							{(row) => {
								const r = row.review;
								return (
									<Card style={{ padding: "14px 20px", display: "flex", "align-items": "center", gap: "12px", "flex-wrap": "wrap" }}>
										<span class="mono" style={{ "font-weight": "600", "font-size": "13px" }}>
											{r.repo}#{r.prNumber}
										</span>
										<span class="badge">{r.lane}</span>
										<span class="badge">{r.status}</span>
										<Show when={row.companyName}>
											<span class="muted" style={{ "font-size": "13px" }}>{row.companyName}</span>
										</Show>
										<span class="muted" style={{ "font-size": "12px" }}>{r.model}</span>
										<Show when={r.securityCount > 0}>
											<span class="badge">🔒 {r.securityCount}</span>
										</Show>
										<Show when={r.qualityCount > 0}>
											<span class="badge">{r.qualityCount} quality</span>
										</Show>
										<Show when={r.testsFailed !== null && r.testsFailed !== undefined && r.testsFailed > 0}>
											<span class="badge">✗ {r.testsFailed} tests</span>
										</Show>
										<span class="muted" style={{ "font-size": "12px", "margin-left": "auto" }}>
											{new Date(r.createdAt).toLocaleString()}
										</span>
									</Card>
								);
							}}
						</For>
					</div>
				</Show>
			</Suspense>
			<p class="muted" style={{ "margin-top": "32px", "font-size": "13px" }}>
				Need to approve an install, change caps, or re-run a review? That's the
				reviewer service's admin (basalt-reviewer), not this page. <A href="/admin/github">Back to GitHub App</A>
			</p>
		</Layout>
	);
}
