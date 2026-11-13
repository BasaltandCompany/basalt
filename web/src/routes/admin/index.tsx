import { Title } from "@solidjs/meta";
import { A, createAsync, useAction } from "@solidjs/router";
import { For, Show, Suspense, createSignal } from "solid-js";
import Layout from "~/components/Layout";
import ConfirmButton from "~/components/ConfirmButton";
import {
	createTimeEntryAction,
	deleteTimeEntryAction,
	getDashboardQuery,
	getUserQuery,
} from "~/lib/queries";
import {
	DELIVERABLE_STATUS_META,
	getOverviewQuery,
	type ExternalResult,
} from "~/lib/overview";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basalt/ui";
import SelectField from "~/components/select-field";

/** Render an external-source metric, degrading to a muted "not connected" tile. */
function SourceTile(props: {
	label: string;
	result: ExternalResult<Record<string, number>> | undefined;
	value: (d: any) => string;
	sub?: (d: any) => string;
	/** when set (and the source is connected), the whole tile links out in a new tab */
	href?: string;
}) {
	// Precompute display state so the discriminated-union narrowing stays simple.
	const r = props.result;
	const isError = !!r && !r.ok && r.reason === "error";
	const isOk = !!r && r.ok;
	const content = (
		<>
			<div class="label">{props.label}</div>
			<Show
				when={isOk}
				fallback={
					<Show
						when={isError}
						fallback={
							<div class="value value-muted">
								—
								<div class="sub">Not connected</div>
							</div>
						}
					>
						<div class="value value-error">
							—
							<div class="sub sub-error">Unavailable</div>
						</div>
					</Show>
				}
			>
				<div class="value">
					{props.value((r as any).data)}
					<Show when={props.sub}>
						<div class="sub">{props.sub!((r as any).data)}</div>
					</Show>
				</div>
			</Show>
		</>
	);
	return props.href && isOk ? (
		<a href={props.href} target="_blank" rel="noreferrer" class="stat-card">
			{content}
		</a>
	) : (
		<div class="stat-card">{content}</div>
	);
}

export default function Home() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const data = createAsync(() => getDashboardQuery(), { deferStream: true });
	const overview = createAsync(() => getOverviewQuery(), { deferStream: true });
	const createEntry = useAction(createTimeEntryAction);
	const deleteEntry = useAction(deleteTimeEntryAction);
	const [entryError, setEntryError] = createSignal("");
	// Guard + in-flight indicator: a second click while the action runs must
	// not submit a duplicate entry.
	const [logging, setLogging] = createSignal(false);

	const today = new Date().toISOString().slice(0, 10);

	async function handleLog(e: Event) {
		e.preventDefault();
		if (logging()) return;
		setEntryError("");
		setLogging(true);
		try {
			const form = e.target as HTMLFormElement;
			const fd = new FormData(form);
			fd.set("_referer", "/admin");
			const result = (await createEntry(fd)) as { error?: string } | undefined;
			if (result?.error) setEntryError(result.error);
			else form.reset();
		} finally {
			setLogging(false);
		}
	}

	return (
		<Layout user={user()}>
			<Title>Dashboard — Basalt</Title>
			<h1 class="page-title">Dashboard</h1>
			<p class="page-subtitle">
				{new Date().toLocaleDateString("en-US", {
					weekday: "long",
					month: "long",
					day: "numeric",
				})}
			</p>

			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show when={overview()}>
					{(ov) => (
						<>
							{/* ── Metric tiles — the single pane of glass ── */}
							<div class="stat-grid">
								<SourceTile
									label="Page Views (30d)"
									result={ov().external.posthog as any}
									value={(d) => fmt(d.pageviews30d)}
									sub={(d) => `${fmt(d.pageviews7d)} this week · ${fmt(d.uniqueUsers30d)} unique`}
									href={ov().external.posthog.ok ? (ov().external.posthog as any).data.dashboardUrl : undefined}
								/>
								<SourceTile
									label="Newsletter Leads"
									result={ov().external.resend as any}
									value={(d) => fmt(d.subscribers) + (d.overflow ? "+" : "")}
									sub={() => "subscribers"}
									href={ov().external.resend.ok ? (ov().external.resend as any).data.audienceUrl : undefined}
								/>
								<SourceTile
									label="Open Issues"
									result={ov().external.linear as any}
									value={(d) => fmt(d.openIssues)}
									sub={() => "assigned to you"}
									href={ov().external.linear.ok ? (ov().external.linear as any).data.workspaceUrl : undefined}
								/>
								<a class="stat-card" href="/admin/projects" target="_blank" rel="noreferrer">
									<div class="label">Active Contracts</div>
									<div class="value">
										{ov().companies.total}
									</div>
									<div class="sub">
										{ov().companies.total} compan{ov().companies.total === 1 ? "y" : "ies"} · {ov().deliverables.total} deliverable{ov().deliverables.total === 1 ? "" : "s"}
									</div>
								</a>
							</div>

							{/* Sources not yet wired — muted placeholders */}
							<div class="stat-grid stat-grid-muted">
								<div class="stat-card stat-card-placeholder">
									<div class="label">Bank Account (Novo)</div>
									<div class="value value-muted">
										—
										<div class="sub">Needs Plaid</div>
									</div>
								</div>
								<a class="stat-card" href="/admin/docs" target="_blank" rel="noreferrer">
									<div class="label">Docs</div>
									<div class="value">
										{ov().docs.total}
									</div>
									<div class="sub">documents in the workspace</div>
								</a>
								<Show
									when={ov().email.connected}
									fallback={
										<div class="stat-card stat-card-placeholder">
											<div class="label">Email</div>
											<div class="value value-muted">
												—
												<div class="sub">Not connected</div>
											</div>
										</div>
									}
								>
										<a class="stat-card" href="/admin/email" target="_blank" rel="noreferrer">
										<div class="label">Email</div>
										<div class="value">
											{ov().email.unread}
										</div>
										<div class="sub">
											unread · {ov().email.total} threads · synced
											{ov().email.lastSyncAt?.toLocaleTimeString() ?? "never"}
										</div>
										</a>
								</Show>
							</div>

							{/* ── Work needing attention ── */}
							<Show when={ov().deliverables.attention.length > 0}>
								<div class="section-heading">Needs Attention</div>
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>Deliverable</TableHead>
											<TableHead>Project</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={ov().deliverables.attention}>
											{(d) => (
												<TableRow>
													<TableCell>
														<A href={`/admin/projects/${d.projectId}`}>
															{d.title}
														</A>
													</TableCell>
													<TableCell class="muted">{d.projectName}</TableCell>
													<TableCell>
														<span class={`badge ${DELIVERABLE_STATUS_META[d.status].cls}`}>
															{DELIVERABLE_STATUS_META[d.status].label}
														</span>
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</Show>

							{/* ── Outstanding invoices ── */}
							<Show when={ov().invoices.outstanding.length > 0}>
								<div class="section-heading">
									Outstanding Invoices
									<span class="section-aside">
										${ov().invoices.outstandingTotal.toFixed(2)} unpaid
									</span>
								</div>
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>Invoice</TableHead>
											<TableHead>Project</TableHead>
											<TableHead style={{ "text-align": "right" }}>Amount</TableHead>
											<TableHead>Due</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={ov().invoices.outstanding.slice(0, 6)}>
											{(inv) => (
												<TableRow>
													<TableCell>{inv.number}</TableCell>
													<TableCell class="muted">{inv.projectName}</TableCell>
													<TableCell class="hours" style={{ "text-align": "right" }}>
														${Number(inv.amount).toFixed(2)}
													</TableCell>
													<TableCell class="muted">
														{inv.dueDate
															? new Date(inv.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
															: "—"}
													</TableCell>
													<TableCell>
														<span class={`badge ${inv.status === "sent" ? "badge-paused" : "badge-completed"}`}>
															{inv.status}
														</span>
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</Show>

							{/* ── Open Linear issues (when connected) ── */}
							<Show when={ov().external.linear.ok}>
								<div class="section-heading">Open Issues</div>
								<Table class="table">
									<TableBody>
										<For each={(ov().external.linear as any).data.issues}>
											{(issue) => (
												<TableRow>
													<TableCell class="mono" style={{ "white-space": "nowrap" }}>{issue.identifier}</TableCell>
													<TableCell>{issue.title}</TableCell>
													<TableCell class="muted" style={{ "text-align": "right" }}>{issue.state}</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</Show>
						</>
					)}
				</Show>

				{/* ── Hours / time tracking (owned data) ── */}
				<Show when={data()}>
					{(d) => (
						<>
							<div class="stat-grid">
								<div class="stat-card">
									<div class="label">This Week</div>
									<div class="value">
										{d().weekTotal}
										<span class="unit"> hrs</span>
									</div>
								</div>
								<div class="stat-card">
									<div class="label">This Month</div>
									<div class="value">
										{d().monthTotal}
										<span class="unit"> hrs</span>
									</div>
								</div>
								<div class="stat-card">
									<div class="label">Active Projects</div>
									<div class="value">{d().projects.length}</div>
								</div>
							</div>

							{/* Retainer caps */}
							<Show when={d().caps.length > 0}>
								<div class="section-heading">Monthly Retainer Caps</div>
								<Card class="p-6">
									<For each={d().caps}>
										{(cap) => {
											const pct = Math.min((cap.used / cap.cap) * 100, 100);
											const cls = pct >= 100 ? "over" : pct >= 80 ? "warn" : "";
											return (
												<div style={{ "margin-bottom": "20px" }}>
													<div
														style={{
															display: "flex",
															"justify-content": "space-between",
															"align-items": "center",
															"margin-bottom": "4px",
														}}
													>
														<span style={{ "font-size": "14px" }}>{cap.project_name}</span>
														<span class="mono" style={{ "font-size": "13px" }}>
															{cap.used} / {cap.cap} hrs
														</span>
													</div>
													<div class="progress">
														<div class={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
													</div>
												</div>
											);
										}}
									</For>
								</Card>
							</Show>

							{/* Quick log */}
							<div class="section-heading">Log Time</div>
							<Card class="p-6">
								<form onSubmit={handleLog}>
									<div class="form-row">
										<div class="form-group">
											<label for="project_id">Project</label>
											<SelectField
												id="project_id"
												name="project_id"
												required
												options={() =>
													(d()?.projects ?? []).map((p) => ({
														value: p.id,
														label: `${p.name} — ${p.companyName}`,
													}))
												}
											/>
										</div>
										<div class="form-group">
											<label for="entry_date">Date</label>
											<input type="date" id="entry_date" name="entry_date" value={today} required />
										</div>
									</div>
									<div class="form-row">
										<div class="form-group">
											<label for="hours">Hours</label>
											<input type="number" id="hours" name="hours" step="0.25" min="0.25" placeholder="2.5" required />
										</div>
										<div class="form-group">
											<label for="billable">Billable</label>
											<div style={{ display: "flex", "align-items": "center", gap: "8px", padding: "12px 0" }}>
												<input type="checkbox" id="billable" name="billable" checked style={{ width: "auto" }} />
												<span class="muted" style={{ "font-size": "14px" }}>Charge client</span>
											</div>
										</div>
									</div>
									<div class="form-group">
										<label for="description">What did you do?</label>
										<textarea id="description" name="description" rows={2} placeholder="Built agent routing logic, reviewed PRs, deployed v2 config…" required />
									</div>
									<Show when={entryError()}>
										<p class="login-error" style={{ "margin-bottom": "12px" }}>{entryError()}</p>
									</Show>
									<Button type="submit"  disabled={logging()}>
										{logging() ? "Logging…" : "Log Entry"}
									</Button>
								</form>
							</Card>

							{/* Recent entries */}
							<div class="section-heading">Recent Entries</div>
							<Show when={d().entries.length > 0} fallback={<p class="empty">No entries yet.</p>}>
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>Date</TableHead>
											<TableHead>Project</TableHead>
											<TableHead>Description</TableHead>
											<TableHead style={{ "text-align": "right" }}>Hours</TableHead>
											<TableHead></TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={d().entries}>
											{(e) => (
												<TableRow>
													<TableCell class="muted">
														{new Date(e.entryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
													</TableCell>
													<TableCell>
														<A href={`/admin/projects/${e.projectId}`}>{e.projectName}</A>
													</TableCell>
													<TableCell>{e.description}</TableCell>
													<TableCell class="hours" style={{ "text-align": "right" }}>{e.hours}</TableCell>
													<TableCell style={{ width: "40px" }}>
														<ConfirmButton
															label="Delete"
															class="delete-btn"
															onConfirm={async () => {
																const fd = new FormData();
																fd.set("id", e.id);
																return deleteEntry(fd);
															}}
														/>
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</Show>
						</>
					)}
				</Show>
			</Suspense>
		</Layout>
	);
}

function fmt(n: number): string {
	if (n == null || Number.isNaN(n)) return "0";
	return n >= 1000 ? n.toLocaleString("en-US") : String(n);
}
