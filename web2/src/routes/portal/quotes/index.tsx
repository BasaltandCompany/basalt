import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { For, Show } from "solid-js";
import PortalLayout from "~/components/PortalLayout";
import { getClientQuotesQuery, getClientUserQuery } from "~/lib/client-queries";
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui2";

const statusBadge: Record<string, string> = {
	draft: "badge-paused",
	sent: "badge-active",
	accepted: "badge-completed",
	rejected: "badge-paused",
};

export default function PortalQuotes() {
	const user = createMemo(() => getClientUserQuery(), { deferStream: true });
	const quotes = createMemo(() => getClientQuotesQuery(), { deferStream: true });

	return (
		<PortalLayout user={user()}>
			<Title>Quotes — Basalt Client Portal</Title>
			<h1 class="page-title">Quotes</h1>
			<p class="page-subtitle">Proposals and agreements — sent quotes can be signed to accept</p>

			<div style={{ "margin-top": "32px" }}>
				<Show when={quotes()} fallback={<p class="muted">Loading…</p>}>
					{(list) => (
						<Show when={list().length > 0} fallback={<Card class="empty">No quotes yet.</Card>}>
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Quote</TableHead>
										<TableHead>Total</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Updated</TableHead>
										<TableHead></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={list()}>
										{(q) => (
											<TableRow>
												<TableCell>
													<a href={`/portal/quotes/${q.id}`}>{q.title}</a>
												</TableCell>
												<TableCell class="mono" style={{ "font-weight": "500" }}>
													${Math.round(q.totals.total).toLocaleString("en-US")}
												</TableCell>
												<TableCell>
													<span class={`badge ${statusBadge[q.status] ?? "badge-paused"}`}>{q.status}</span>
												</TableCell>
												<TableCell class="muted">{q.updatedAt.toLocaleDateString()}</TableCell>
												<TableCell>
													<Show when={q.status === "sent"}>
														<a href={`/portal/quotes/${q.id}`}>Review & sign →</a>
													</Show>
												</TableCell>
											</TableRow>
										)}
									</For>
								</TableBody>
							</Table>
						</Show>
					)}
				</Show>
			</div>
		</PortalLayout>
	);
}
