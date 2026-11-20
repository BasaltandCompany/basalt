import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createMemo } from "solid-js";
import { For, Show } from "solid-js";
import PortalLayout from "~/components/PortalLayout";
import { getClientProjectQuery, getClientUserQuery } from "~/lib/client-queries";
import { Card } from "@basaltac/ui";
import type { DeliverableStatus } from "~/db/schema";

const statusBadge: Record<DeliverableStatus, string> = {
	planned: "badge-paused",
	in_progress: "badge-active",
	review: "badge-active",
	completed: "badge-completed",
	blocked: "badge-paused",
};

export default function PortalProject() {
	const params = useParams();
	const user = createMemo(() => getClientUserQuery(), { deferStream: true });
	const data = createMemo(() => getClientProjectQuery(params.id ?? ""), { deferStream: true });

	return (
		<PortalLayout user={user()}>
			<Title>Project — Basalt Client Portal</Title>
			<Show when={data()} fallback={<p class="muted">Loading…</p>}>
				{(d) => (
					<div style={{ "max-width": "820px", margin: "0 auto" }}>
						<a href="/portal" class="muted" style={{ "font-size": "13px", "text-decoration": "none" }}>
							← All projects
						</a>
						<h1 class="page-title" style={{ "margin-bottom": "4px" }}>{d().project.name}</h1>
						<p class="page-subtitle">
							{d().project.companyName}
							{" · "}
							<span style={{ "text-transform": "capitalize" }}>
								{d().project.engagementType === "project"
									? `$${(d().project.fixedPrice ?? 0).toLocaleString()} fixed`
									: `$${d().project.hourlyRate}/hr`}
							</span>
						</p>

						<div style={{ display: "flex", "flex-direction": "column", gap: "12px", "margin-top": "24px" }}>
							<For each={d().deliverables} fallback={<Card class="empty">No deliverables yet.</Card>}>
								{(delv) => (
									<Card style={{ padding: "20px" }}>
										<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "12px" }}>
											<div>
												<span style={{ "font-size": "15px", "font-weight": "500" }}>{delv.title}</span>
												<span class={`badge ${statusBadge[delv.status]}`} style={{ "margin-left": "8px", "text-transform": "capitalize" }}>
													{delv.status.replace("_", " ")}
												</span>
											</div>
											<Show when={delv.hours > 0}>
												<span class="mono muted" style={{ "font-size": "12px" }}>{Math.round(delv.hours * 10) / 10}h logged</span>
											</Show>
										</div>
										<Show when={delv.description}>
											<p class="muted" style={{ "font-size": "13px", "margin-top": "6px" }}>{delv.description}</p>
										</Show>

										<Show when={delv.updates.length > 0}>
											<div style={{ "margin-top": "12px", "padding-left": "12px", "border-left": "2px solid rgba(188,156,92,0.3)" }}>
												<For each={delv.updates}>
													{(upd) => (
														<div style={{ "margin-bottom": "8px" }}>
															<div class="muted" style={{ "font-size": "11px" }}>
																{new Date(upd.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
															</div>
															<div style={{ "font-size": "13px", "line-height": "1.5" }}>{upd.body}</div>
														</div>
													)}
												</For>
											</div>
										</Show>
									</Card>
								)}
							</For>
						</div>
					</div>
				)}
			</Show>
		</PortalLayout>
	);
}
