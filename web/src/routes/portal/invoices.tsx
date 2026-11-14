import { Title } from "@solidjs/meta";
import { createAsync } from "@solidjs/router";
import { For, Show } from "solid-js";
import PortalLayout from "~/components/PortalLayout";
import {
	getClientInvoicesQuery,
	getClientUserQuery,
} from "~/lib/client-queries";
import type { InvoiceStatus } from "~/db/schema";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui";

const statusBadge: Record<InvoiceStatus, string> = {
	draft: "badge-paused",
	sent: "badge-active",
	paid: "badge-completed",
	void: "badge-paused",
};

export default function PortalInvoices() {
	const user = createAsync(() => getClientUserQuery(), { deferStream: true });
	const invoices = createAsync(() => getClientInvoicesQuery(), {
		deferStream: true,
	});

	return (
		<PortalLayout user={user()}>
			<Title>Invoices — Basalt Client Portal</Title>
			<h1 class="page-title">Invoices</h1>
			<p class="page-subtitle">Billing history and payment links</p>

			<div style={{ "margin-top": "32px" }}>
				<Show when={invoices()} fallback={<p class="muted">Loading…</p>}>
					{(list) => (
						<Show
							when={list().length > 0}
							fallback={<Card class="empty">No invoices yet.</Card>}
						>
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Invoice #</TableHead>
										<TableHead>Amount</TableHead>
										<TableHead>Issued</TableHead>
										<TableHead>Due</TableHead>
										<TableHead>Status</TableHead>
										<TableHead></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={list()}>
										{(inv) => (
											<TableRow>
												<TableCell class="mono">{inv.number}</TableCell>
												<TableCell class="mono" style={{ "font-weight": "500" }}>
													${inv.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
												</TableCell>
												<TableCell class="muted">{inv.issueDate.toLocaleDateString()}</TableCell>
												<TableCell class="muted">{inv.dueDate ? inv.dueDate.toLocaleDateString() : "—"}</TableCell>
												<TableCell>
													<span class={`badge ${statusBadge[inv.status]}`}>
														{inv.status}
													</span>
												</TableCell>
												<TableCell>
													<div style={{ display: "flex", gap: "8px" }}>
														<Show when={inv.paymentUrl && inv.status !== "paid"}>
															<Button as="a" size="sm" href={inv.paymentUrl!}
																target="_blank"
																rel="noopener noreferrer">
																Pay Now
															</Button>
														</Show>
														<Show when={inv.storagePath}>
															<Button as="a" variant="outline" size="sm" href={`/api/download?path=${encodeURIComponent(inv.storagePath!)}`}
																
																download="">
																PDF
															</Button>
														</Show>
														<Show when={inv.notes}>
															<span class="muted" style={{ "font-size": "12px", "max-width": "200px", display: "block", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
																{inv.notes}
															</span>
														</Show>
													</div>
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
