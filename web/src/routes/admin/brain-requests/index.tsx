// Lead magnet requests — the /gift lead-magnet pipeline (was "brain
// requests"). Row per submission: answers verbatim, status progression (new →
// building → delivered/declined), and the shipped-work linking to its outreach
// prospect row.
import { Title } from "@solidjs/meta";
import { createAsync, useAction } from "@solidjs/router";
import { For, Show } from "solid-js";
import Layout from "~/components/Layout";
import { getBrainRequestsQuery, setBrainRequestStatusAction, linkBrainRequestToProspectAction } from "~/lib/admin-queries";
import { Button, Card } from "@basaltac/ui";
import SelectField from "~/components/select-field";

const STATUSES = ["new", "building", "delivered", "declined"] as const;

export default function BrainRequests() {
	const requests = createAsync(() => getBrainRequestsQuery(), { deferStream: true });
	const setStatus = useAction(setBrainRequestStatusAction);
	const linkProspect = useAction(linkBrainRequestToProspectAction);

	return (
		<Layout>
			<Title>Lead magnet requests — Basalt</Title>
			<h1 class="page-title">Lead magnet requests</h1>
			<p class="page-subtitle">Claude-gift claims from /gift. Send the 3-month Claude gift by email, then link the row to a prospect when the conversation starts.</p>
			<Show when={requests()?.length} fallback={<p class="muted">No requests yet.</p>}>
				<For each={requests()}>
					{(r) => (
						<Card style={{ padding: "16px 20px", "margin-bottom": "10px" }}>
							<div style={{ display: "flex", gap: "10px", "align-items": "baseline", "flex-wrap": "wrap" }}>
								<strong style={{ "font-size": "15px" }}>{r.company}</strong>
								<span class="muted" style={{ "font-size": "13px" }}>
									{r.answers.name as string} · <a href={`mailto:${r.contactEmail}`}>{r.contactEmail}</a>
									<Show when={r.jobTitle}> · {r.jobTitle}</Show>
									<Show when={r.headcount}> · {r.headcount}</Show> · {new Date(r.createdAt).toLocaleString()}
									<Show when={r.sourceTitle}> · via “{r.sourceTitle}”</Show>
								</span>
							</div>
						<details style={{ "margin-top": "8px" }}>
							<summary class="muted" style={{ cursor: "pointer", "font-size": "13px" }}>Their answers</summary>
							<ul style={{ "font-size": "13px", "line-height": 1.6, margin: "8px 0 0", "padding-left": "18px" }}>
								<li><strong>Phone:</strong> {(r.answers.phone as string) || "—"} · <strong>Heard about us:</strong> {(r.answers.heardAbout as string) || "—"}</li>
								<Show when={r.answers.whatTheyDo}>
									<li><strong>What they do:</strong> {(r.answers.whatTheyDo as string) || "—"} · <strong>Bottleneck:</strong> {(r.answers.bottleneck as string) || "—"} · <strong>Stack:</strong> {Array.isArray(r.answers.stack) ? (r.answers.stack as string[]).join(", ") || "—" : "—"}</li>
								</Show>
							</ul>
						</details>
							<div style={{ display: "flex", gap: "8px", "margin-top": "12px", "flex-wrap": "wrap", "align-items": "center" }}>
								<form
									onSubmit={async (e) => {
										e.preventDefault();
										await setStatus(new FormData(e.currentTarget as HTMLFormElement));
									}}
								>
									<input type="hidden" name="id" value={r.id} />
									<SelectField
										name="status"
										value={r.status}
										class="doc-sched-input"
										style={{ width: "120px" }}
										options={[...STATUSES].map((s) => ({ value: s, label: s }))}
									/>
									<Button variant="outline" size="sm" type="submit">Set status</Button>
								</form>
								<Show when={!r.prospectId}>
									<form
										style={{ display: "flex", gap: "8px" }}
										onSubmit={async (e) => {
											e.preventDefault();
											await linkProspect(new FormData(e.currentTarget as HTMLFormElement));
										}}
									>
										<input type="hidden" name="id" value={r.id} />
										<input name="company" placeholder="Prospect company (defaults to request)" class="doc-sched-input" style={{ width: "240px" }} />
										<Button variant="outline" size="sm" type="submit">Link to prospect</Button>
									</form>
								</Show>
								<Show when={r.prospectId}>
									<Button as="a" variant="outline" size="sm" href="/admin/outreach">prospect linked ↗</Button>
								</Show>
							</div>
						</Card>
					)}
				</For>
			</Show>
		</Layout>
	);
}
