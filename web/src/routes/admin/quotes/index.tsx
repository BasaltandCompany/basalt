import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { useAction } from "@solidjs/router";
import { For, Show } from "solid-js";
import Layout from "~/components/Layout";
import CreateDialog from "~/components/CreateDialog";
import SelectField from "~/components/select-field";
import { getUserQuery } from "~/lib/queries";
import { getQuotesQuery, getCompaniesForSelectQuery, getProjectsForSelectQuery, createQuoteAction } from "~/lib/admin-queries";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui";

const statusBadge: Record<string, string> = {
	draft: "badge-paused",
	sent: "badge-active",
	accepted: "badge-completed",
	rejected: "badge-paused",
};

export default function AdminQuotes() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const quotes = createMemo(() => getQuotesQuery(), { deferStream: true });
	const createQuote = useAction(createQuoteAction);
	const companies = createMemo(() => getCompaniesForSelectQuery(), { deferStream: true });
	const projects = createMemo(() => getProjectsForSelectQuery(), { deferStream: true });

	return (
		<Layout user={user()}>
			<Title>Quotes — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "16px", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">Quotes</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
						Fixed-price proposals. Accepted + signed in the client portal, the quote IS the contract. Body prose lives in the linked doc; priced lines here.
					</p>
				</div>
				<CreateDialog
					label="New quote"
					title="New quote"
					submitLabel="Create quote"
					onSubmit={(fd) => createQuote(fd) as Promise<{ error?: string } | undefined>}
				>
					<div class="form-group">
						<label for="company_id">Company</label>
						<SelectField
							id="company_id"
							name="company_id"
							options={(companies() ?? []).map((c) => ({ value: c.id, label: c.name }))}
						/>
					</div>
					<div class="form-group">
						<label for="quote_title">Title</label>
						<input id="quote_title" name="title" placeholder="BCW Forms (JotForm Replacement) Quote" />
					</div>
					<div class="form-group">
						<label for="quote_project">Project (optional — enables actuals variance)</label>
						<SelectField
							id="quote_project"
							name="project_id"
							options={[{ value: "", label: "— none yet —" }, ...(projects() ?? []).map((p) => ({ value: p.id, label: p.name }))]}
						/>
					</div>
					<div class="form-group">
						<label for="quote_valid">Valid (days)</label>
						<input id="quote_valid" name="valid_days" type="number" value="30" min="1" />
					</div>
				</CreateDialog>
			</div>

			<Show when={quotes()} fallback={<p class="muted">Loading…</p>}>
				{(list) => (
					<Show when={list().length > 0} fallback={<Card class="empty">No quotes yet.</Card>}>
						<Table class="table">
							<TableHeader>
								<TableRow>
									<TableHead>Quote</TableHead>
									<TableHead>Company</TableHead>
									<TableHead>Total</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Project</TableHead>
									<TableHead>Updated</TableHead>
									<TableHead></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<For each={list()}>
									{(q) => (
										<TableRow>
											<TableCell>
												<a href={`/admin/quotes/${q.id}`}>{q.title}</a>
											</TableCell>
											<TableCell>{q.companyName}</TableCell>
											<TableCell class="mono">
												${Math.round(q.totals.total).toLocaleString("en-US")}
												<Show when={q.totals.optional.count > 0}>
													{" "}
													<span class="muted">({q.totals.required.count}+{q.totals.optional.count})</span>
												</Show>
											</TableCell>
											<TableCell>
												<span class={`badge ${statusBadge[q.status] ?? "badge-paused"}`}>{q.status}</span>
											</TableCell>
											<TableCell class="muted">{q.projectName ?? "—"}</TableCell>
											<TableCell class="muted">{q.updatedAt.toLocaleDateString()}</TableCell>
											<TableCell>
													<Button as="a" variant="outline" size="sm" href={`/admin/quotes/${q.id}`}>
														Open
													</Button>
											</TableCell>
										</TableRow>
									)}
								</For>
							</TableBody>
						</Table>
					</Show>
				)}
			</Show>
		</Layout>
	);
}
