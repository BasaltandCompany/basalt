// Brain requests — the /brain lead-magnet pipeline. Row per submission:
// answers verbatim, status progression (new → building → delivered/declined),
// and the shipped brain linking to its outreach prospect row.
import { Title } from "@solidjs/meta";
import { createAsync, useAction } from "@solidjs/router";
import { For, Show } from "solid-js";
import Layout from "~/components/Layout";
import { getBrainRequestsQuery, setBrainRequestStatusAction, linkBrainRequestToProspectAction } from "~/lib/admin-queries";
import type { Blueprint } from "~/lib/blueprint";
import { Button, Card } from "@basalt/ui";
import SelectField from "~/components/select-field";

const STATUSES = ["new", "building", "delivered", "declined"] as const;

export default function BrainRequests() {
	const requests = createAsync(() => getBrainRequestsQuery(), { deferStream: true });
	const setStatus = useAction(setBrainRequestStatusAction);
	const linkProspect = useAction(linkBrainRequestToProspectAction);

	return (
		<Layout>
			<Title>Brain requests — Basalt</Title>
			<h1 class="page-title">Brain requests</h1>
			<p class="page-subtitle">Free company-brain requests from /brain. Build it from their answers + public data, then link the row to a prospect.</p>
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
								<li><strong>What they do:</strong> {(r.answers.whatTheyDo as string) || "—"}</li>
								<li><strong>Stack:</strong> {Array.isArray(r.answers.stack) ? (r.answers.stack as string[]).join(", ") || "—" : "—"}</li>
								<li><strong>Biggest bottleneck:</strong> {(r.answers.bottleneck as string) || "—"}</li>
								<li><strong>Tech team:</strong> {(r.answers.techTeam as string) || "—"} · <strong>Heard about us:</strong> {(r.answers.heardAbout as string) || "—"} · <strong>Industry:</strong> {(r.answers.industry as string) || "—"}</li>
							</ul>
						</details>
						<Show when={r.blueprint}>
							{(b) => (
								<details style={{ "margin-top": "4px" }}>
									<summary class="muted" style={{ cursor: "pointer", "font-size": "13px" }}>Blueprint shown to them</summary>
									<p style={{ "font-size": "13px", margin: "8px 0 4px" }}>{(b() as Blueprint).tagline}</p>
									<ul style={{ "font-size": "13px", "line-height": 1.6, margin: "4px 0 0", "padding-left": "18px" }}>
										<li><strong>Connectors:</strong> {(b() as Blueprint).connectors.map((c) => c.name).join(", ")}</li>
										<li><strong>Workflows:</strong> {(b() as Blueprint).workflows.map((w) => w.name).join(", ")}</li>
									</ul>
								</details>
							)}
						</Show>
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
