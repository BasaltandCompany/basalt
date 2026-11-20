import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { For, Show, Loading, createSignal } from "solid-js";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import ProjectDocuments from "~/components/ProjectDocuments";
import ConfirmButton from "~/components/ConfirmButton";
import {
	createTimeEntryAction,
	deleteTimeEntryAction,
	getProjectEntriesQuery,
	getProjectQuery,
	getUserQuery,
} from "~/lib/queries";
import { createDeliverableAction, getDeliverablesQuery, deleteDeliverableAction, updateQuoteMetaAction, importQuoteToProjectAction, getProjectQuotesQuery, getQuotesQuery, getCompaniesForSelectQuery } from "~/lib/admin-queries";
import { updateProjectAction } from "~/lib/queries";
import type { DeliverableStatus, ProjectStatus, QuoteStatus, Project } from "~/db/schema";
import { money } from "~/lib/quotes";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui2";
import SelectField from "~/components/select-field";

const STATUS_OPTIONS: DeliverableStatus[] = [
	"planned",
	"in_progress",
	"review",
	"completed",
	"blocked",
];

const statusBadge: Record<DeliverableStatus, string> = {
	planned: "badge-paused",
	in_progress: "badge-active",
	review: "badge-active",
	completed: "badge-completed",
	blocked: "badge-paused",
};

const PROJECT_STATUS_OPTIONS: ProjectStatus[] = ["active", "paused", "completed"];

const quoteBadge: Record<QuoteStatus, string> = {
	draft: "badge-paused",
	sent: "badge-active",
	accepted: "badge-completed",
	rejected: "badge-paused",
};

export default function ProjectDetail() {
	const params = useParams();
	const navigate = useNavigate();
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const project = createMemo(() => getProjectQuery(params.id!), { deferStream: true });
	const entries = createMemo(() => getProjectEntriesQuery(params.id!), { deferStream: true });
	const deliverables = createMemo(() => getDeliverablesQuery(params.id!), { deferStream: true });
	const companies = createMemo(() => getCompaniesForSelectQuery(), { deferStream: true });
	const projectQuotes = createMemo(() => getProjectQuotesQuery(params.id!), { deferStream: true });
	const allQuotes = createMemo(() => getQuotesQuery(), { deferStream: true });
	const createEntry = createTimeEntryAction;
	const deleteEntry = deleteTimeEntryAction;
	const deleteDeliverable = deleteDeliverableAction;
	const createDeliverable = createDeliverableAction;
	const updateProject = updateProjectAction;
	const updateQuoteMeta = updateQuoteMetaAction;
	const importQuote = importQuoteToProjectAction;
	const statusForms: Record<string, HTMLFormElement> = {};
	const [error, setError] = createSignal("");
	// Guard + in-flight indicator: a second click while the action runs must
	// not submit a duplicate entry.
	const [logging, setLogging] = createSignal(false);
	const [updateDeliverableId, setUpdateDeliverableId] = createSignal<string | null>(null);
	const [statusSaving, setStatusSaving] = createSignal(false);

	const today = new Date().toISOString().slice(0, 10);
	const totalHours = () =>
		(entries() ?? []).reduce((sum, e) => sum + e.hours, 0);
	// hours linked to one deliverable (rollup on each deliverable card)
	const linkedHours = (deliverableId: string) =>
		(entries() ?? []).filter((e) => e.deliverableId === deliverableId).reduce((sum, e) => sum + e.hours, 0);

	async function handleLog(e: Event) {
		e.preventDefault();
		if (logging()) return;
		setError("");
		setLogging(true);
		try {
			const form = e.target as HTMLFormElement;
			const fd = new FormData(form);
			fd.set("_referer", `/admin/projects/${params.id}`);
			const result = (await createEntry(fd)) as { error?: string } | undefined;
			if (result?.error) setError(result.error);
			else form.reset();
		} finally {
			setLogging(false);
		}
	}

	async function handleStatus(id: string, current: string, status: string) {
		if (!status || status === current || statusSaving()) return;
		setStatusSaving(true);
		try {
			const fd = new FormData();
			fd.set("id", id);
			fd.set("status", status);
			await updateProject(fd);
		} finally {
			setStatusSaving(false);
		}
	}

	// Reversible — nothing is lost, so no confirm dialog.
	async function handleUnlink(quoteId: string) {
		const fd = new FormData();
		fd.set("id", quoteId);
		fd.set("project_id", "");
		await updateQuoteMeta(fd);
	}

	// Same action as Attach — pulls items/dates added after attaching.
	async function handleImport(quoteId: string) {
		const fd = new FormData();
		fd.set("quote_id", quoteId);
		fd.set("project_id", params.id!);
		await importQuote(fd);
	}

	const dateRange = (proj: Pick<Project, "startDate" | "endDate">) => {
		const fmt = (d: string) =>
			new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
		if (proj.startDate && proj.endDate) return ` · ${fmt(proj.startDate)} – ${fmt(proj.endDate)}`;
		if (proj.startDate) return ` · starts ${fmt(proj.startDate)}`;
		if (proj.endDate) return ` · ends ${fmt(proj.endDate)}`;
		return "";
	};

	return (
		<Layout user={user()}>
			<Loading fallback={<p class="muted">Loading…</p>}>
				<Show when={project()} fallback={<p class="muted">Loading…</p>}>
					{(p) => (
						<>
							<Title>{p().name} — Basalt</Title>
							<a href="/admin/projects" class="muted" style={{ "font-size": "13px", "margin-bottom": "8px", display: "inline-block" }}>
								All Projects
							</a>
							<div style={{ display: "flex", "justify-content": "space-between", "align-items": "flex-start", gap: "16px" }}>
								<div>
									<h1 class="page-title" style={{ "margin-bottom": "0" }}>{p().name}</h1>
									<p class="page-subtitle">
										{p().companyName} · <span style={{ "text-transform": "capitalize" }}>{p().engagementType}</span>{p().engagementType === "project" ? ` · $${(p().fixedPrice ?? 0).toLocaleString()} fixed` : ` · $${p().hourlyRate}/hr`}
										{p().monthlyCapHours ? ` · ${p().monthlyCapHours}h cap` : ""}
										{dateRange(p())}
									</p>
								</div>
								<div style={{ display: "flex", gap: "8px", "align-items": "center", "flex-shrink": 0, "padding-top": "6px" }}>
									<SelectField
										aria-label="Project status"
										value={p().status}
										options={PROJECT_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
										onChange={(s) => handleStatus(p().id, p().status, s)}
										style={{ "font-size": "13px" }}
									/>
									<CreateDialog
										label="Edit Project"
										title="Edit Project"
										submitLabel="Save Changes"
										successMessage="Saved."
										onSubmit={async (fd) => {
											fd.set("id", p().id);
											return updateProject(fd) as Promise<{ error?: string; success?: string } | undefined>;
										}}
									>
										<EditProjectForm p={p()} companies={companies() ?? []} />
									</CreateDialog>
								</div>
							</div>

							<Show when={p().notes}>
								<Card style={{ "margin-bottom": "32px" }}>
									<div class="section-heading" style={{ "margin-top": "0" }}>Scope</div>
									<p class="muted" style={{ "white-space": "pre-wrap" }}>{p().notes}</p>
								</Card>
							</Show>

							{/* Deliverables — client-visible */}
							<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "16px" }}>
								<div class="section-heading" style={{ margin: "0" }}>Deliverables</div>
								<CreateDialog
									label="Add Deliverable"
									title="Add Deliverable"
									submitLabel="Create Deliverable"
									triggerClass="btn btn-sm btn-primary"
									onSubmit={(fd) => {
										fd.set("project_id", p().id);
										return createDeliverable(fd) as Promise<{ error?: string; success?: string }>;
									}}
								>
									<div class="form-group">
										<label for="delv_title">Title</label>
										<input type="text" id="delv_title" name="title" required placeholder="Discovery & Requirements" />
									</div>
									<div class="form-group">
										<label for="delv_desc">Description</label>
										<textarea id="delv_desc" name="description" rows={2} placeholder="What does this deliverable include?" />
									</div>
								</CreateDialog>
							</div>

							<Loading fallback={<p class="muted">Loading…</p>}>
								<Show when={deliverables()} fallback={<p class="muted">Loading…</p>}>
									{(list) => (
										<Show when={list().length > 0} fallback={<Card class="empty">No deliverables yet.</Card>}>
											<div style={{ display: "flex", "flex-direction": "column", gap: "12px", "margin-bottom": "40px" }}>
												<For each={list()}>
													{(delv) => (
														<Card style={{ padding: "20px" }}>
															<div style={{ display: "flex", "justify-content": "space-between", "align-items": "flex-start", gap: "12px" }}>
																<div style={{ flex: "1" }}>
															<span style={{ "font-size": "15px", "font-weight": "500" }}>{delv.title}</span>
															<Show when={delv.number != null}>
																<span
																	class="muted"
																	style={{ "font-size": "12px", "margin-left": "8px", "font-family": "monospace" }}
																	title="Put this key in the branch name or PR title and the GitHub App links the PR here"
																>
																	DEL-{delv.number}
																</span>
															</Show>
																			<span class={`badge ${statusBadge[delv.status]}`} style={{ "margin-left": "8px", "text-transform": "capitalize" }}>
																				{delv.status.replace("_", " ")}
																			</span>
																			<Show when={linkedHours(delv.id) > 0}>
																				<span class="muted" style={{ "font-size": "12px", "margin-left": "8px" }}>
																					{linkedHours(delv.id)}h logged
																				</span>
																			</Show>
																</div>
																{/* Status changer */}
																<form method="post" action="/admin/projects/update-deliverable" style={{ display: "inline-flex", gap: "0" }} ref={(f) => (statusForms[delv.id] = f)}>
																	<input type="hidden" name="id" value={delv.id} />
																	<input type="hidden" name="_referer" value={`/admin/projects/${params.id}`} />
																	<SelectField
																		name="status"
																		value={delv.status}
																		style={{ padding: "6px 12px", "font-size": "13px" }}
																		options={STATUS_OPTIONS.map((opt) => ({ value: opt, label: opt.replace("_", " ") }))}
																		onChange={() => statusForms[delv.id]?.requestSubmit()}
																	/>
																</form>
															</div>
													<Show when={delv.description}>
														<p class="muted" style={{ "font-size": "13px", "margin-top": "6px" }}>{delv.description}</p>
													</Show>

													{/* Linked PRs (GitHub App webhook) — chip dot follows GitHub state */}
													<Show when={delv.prs.length > 0}>
														<div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px", "margin-top": "10px" }}>
															<For each={delv.prs}>
																{(pr) => (
																	<a
																		href={pr.url}
																		target="_blank"
																		rel="noreferrer"
																		class="badge badge-paused"
																		style={{ "font-size": "12px", "text-transform": "none", display: "inline-flex", "align-items": "center", gap: "6px" }}
																	>
																		<span
																			style={{
																				width: "7px",
																				height: "7px",
																				"border-radius": "50%",
																				background: pr.merged ? "#a371f7" : pr.state === "open" ? "#3fb950" : "#8b949e",
																			}}
																		/>
																		#{pr.number} {pr.title}
																		<span class="muted">{pr.repo}</span>
																	</a>
																)}
															</For>
														</div>
													</Show>

															{/* Updates */}
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

															{/* Add update + delete */}
															<div style={{ display: "flex", gap: "8px", "margin-top": "12px", "align-items": "center" }}>
																<Show
																	when={updateDeliverableId() === delv.id}
																	fallback={
																		<Button variant="outline" size="sm" onClick={() => setUpdateDeliverableId(delv.id)}>
																			Add Update
																		</Button>
																	}
																>
																	<form method="post" action="/admin/projects/add-update" style={{ flex: "1", display: "flex", gap: "8px" }}>
																		<input type="hidden" name="deliverable_id" value={delv.id} />
																		<input type="hidden" name="_referer" value={`/admin/projects/${params.id}`} />
																		<input type="text" name="body" placeholder="Progress update…" required style={{ flex: "1", "padding": "8px 14px", "font-size": "13px" }} />
																		<Button size="sm" type="submit">Post</Button>
																		<Button variant="outline" size="sm" type="button"  onClick={() => setUpdateDeliverableId(null)}>Cancel</Button>
																	</form>
																</Show>
																<ConfirmButton
																label="Delete"
																danger
																style={{ "margin-left": "auto" }}
																onConfirm={async () => {
																	const fd = new FormData();
																	fd.set("id", delv.id);
																	return deleteDeliverable(fd);
																}}
															/>
															</div>
														</Card>
													)}
												</For>
											</div>
										</Show>
									)}
								</Show>
							</Loading>

							{/* Quotes — accepted+signed = the contract */}
							<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "16px" }}>
								<div class="section-heading" style={{ margin: "0" }}>Quotes</div>
								<CreateDialog
									label="Attach Quote"
									title="Attach Quote"
									submitLabel="Attach"
									triggerClass="btn btn-sm btn-primary"
									onSubmit={async (fd) => {
										fd.set("quote_id", String(fd.get("quote_id") || ""));
										fd.set("project_id", p().id);
										return importQuote(fd) as Promise<{ error?: string; success?: string } | undefined>;
									}}
								>
									<div class="form-group">
										<label for="attach_quote">Quote</label>
										<SelectField
											id="attach_quote"
											name="quote_id"
											required
											placeholder="Select a quote…"
											options={() =>
												(allQuotes() ?? [])
													.filter((q) => !q.projectId && q.companyId === p().companyId)
													.map((q) => ({ value: q.id, label: `${q.title} — ${money(q.totals.total)}` }))
											}
										/>
									</div>
									<p class="muted" style={{ "font-size": "12px", margin: "8px 0 0" }}>
										Only quotes with no project yet, from this project's company. Attaching links the quote, copies its start/end dates onto the project, and imports its required line items as deliverables.
									</p>
								</CreateDialog>
							</div>
							<Loading fallback={<p class="muted">Loading…</p>}>
								<Show when={projectQuotes()} fallback={<p class="muted">Loading…</p>}>
									{(list) => (
										<Show when={list().length > 0} fallback={<Card class="empty">No quotes attached.</Card>}>
											<div style={{ display: "flex", "flex-direction": "column", gap: "12px", "margin-bottom": "40px" }}>
												<For each={list()}>
													{(q) => (
															<Card style={{ padding: "20px" }}>
																<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "12px" }}>
																	<a href={`/admin/quotes/${q.id}`} style={{ "font-size": "15px", "font-weight": "500" }}>{q.title}</a>
																	<div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
																		<span class={`badge ${quoteBadge[q.status]}`} style={{ "text-transform": "capitalize" }}>{q.status}</span>
																		<span class="mono muted" style={{ "font-size": "13px" }}>{money(q.total)}</span>
																		<Button variant="outline" size="sm" onClick={() => handleImport(q.id)}>Import</Button>
																		<Button variant="outline" size="sm" onClick={() => handleUnlink(q.id)}>Unlink</Button>
																	</div>
																</div>
																<Show when={q.startDate || q.endDate}>
																	<p class="muted" style={{ "font-size": "12px", margin: "6px 0 0" }}>
																		{[q.startDate, q.endDate].filter(Boolean).join(" → ")}
																	</p>
																</Show>
															</Card>
													)}
												</For>
											</div>
										</Show>
									)}
								</Show>
							</Loading>
							
							{/* Documents */}
							<ProjectDocuments
								projectId={params.id!}
								referer={`/admin/projects/${params.id}`}
							/>

							{/* Log form — admin only */}
							<div class="section-heading">Log Time</div>
							<Card style={{ "margin-bottom": "32px" }}>
								<form onSubmit={handleLog}>
									<input type="hidden" name="project_id" value={p().id} />
									<div class="form-row">
										<div class="form-group">
											<label for="entry_date">Date</label>
											<input type="date" id="entry_date" name="entry_date" value={today} required />
										</div>
										<div class="form-group">
											<label for="hours">Hours</label>
											<input type="number" id="hours" name="hours" step="0.25" min="0.25" placeholder="2.5" required />
										</div>
									</div>
									<div class="form-group">
										<label for="description">What did you do?</label>
										<textarea id="description" name="description" rows={2} required placeholder="What was accomplished…" />
									</div>
									<div class="form-group">
										<label for="deliverable_id">Deliverable (optional)</label>
										<select id="deliverable_id" name="deliverable_id" style={{ width: "100%" }}>
											<option value="">— none —</option>
											<For each={deliverables() ?? []}>{(d) => <option value={d.id}>{d.title}</option>}</For>
										</select>
									</div>
									<div class="form-group">
										<label style={{ display: "flex", "align-items": "center", gap: "8px", cursor: "pointer" }}>
											<input type="checkbox" name="billable" checked style={{ width: "auto" }} />
											Billable
										</label>
									</div>
									<Show when={error()}>
										<p class="login-error" style={{ "margin-bottom": "12px" }}>{error()}</p>
									</Show>
									<Button type="submit"  disabled={logging()}>
							{logging() ? "Logging…" : "Log Entry"}
						</Button>
								</form>
							</Card>

							{/* Entries */}
							<div style={{ display: "flex", "justify-content": "space-between", "align-items": "baseline" }}>
								<div class="section-heading" style={{ "margin-top": "0" }}>
									Time Entries
								</div>
								<div class="muted mono" style={{ "font-size": "13px" }}>
									Total: {totalHours()} hrs
								</div>
							</div>
							<Show
								when={(entries() ?? []).length > 0}
								fallback={<p class="empty">No entries yet.</p>}
							>
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>Date</TableHead>
											<TableHead>Description</TableHead>
											<TableHead style={{ "text-align": "right" }}>Hours</TableHead>
											<TableHead></TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={entries() ?? []}>
											{(e) => (
												<TableRow>
													<TableCell class="muted" style={{ "white-space": "nowrap" }}>
														{new Date(e.entryDate).toLocaleDateString("en-US", {
															month: "short",
															day: "numeric",
															year: "numeric",
														})}
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
			</Loading>
		</Layout>
	);
}

// Edit dialog body — own signal so the conditional pricing fields follow the
// type select the same way the New Project dialog does. Re-mounts on every
// dialog open, so values always start from the live project row.
function EditProjectForm(props: { p: Project; companies: { id: string; name: string }[] }) {
	const [type, setType] = createSignal(props.p.engagementType);
	const isHourly = () => type() !== "project";
	return (
		<>
			<div class="form-group">
				<label for="edit_name">Project Name</label>
				<input type="text" id="edit_name" name="name" required value={props.p.name} />
			</div>
			<div class="form-group">
				<label for="edit_company">Company</label>
				<SelectField
					id="edit_company"
					name="company_id"
					required
					value={props.p.companyId}
					options={props.companies.map((c) => ({ value: c.id, label: c.name }))}
				/>
			</div>
			<div class="form-row">
				<div class="form-group">
					<label for="edit_type">Engagement Type</label>
					<SelectField
						id="edit_type"
						name="engagement_type"
						value={type()}
						onChange={setType}
						options={[
							{ value: "hourly", label: "Hourly" },
							{ value: "retainer", label: "Retainer (monthly cap)" },
							{ value: "project", label: "Project (fixed price)" },
						]}
					/>
				</div>
				<Show when={isHourly()}>
					<div class="form-group">
						<label for="edit_hourly_rate">Hourly Rate ($)</label>
						<input type="number" id="edit_hourly_rate" name="hourly_rate" step="1" min="0" value={String(props.p.hourlyRate)} />
					</div>
				</Show>
				<Show when={!isHourly()}>
					<div class="form-group">
						<label for="edit_fixed_price">Fixed Price ($)</label>
						<input type="number" id="edit_fixed_price" name="fixed_price" step="100" min="0" required value={String(props.p.fixedPrice ?? "")} />
					</div>
				</Show>
				<Show when={type() === "retainer"}>
					<div class="form-group">
						<label for="edit_cap">Monthly Cap (hours)</label>
						<input
							type="number"
							id="edit_cap"
							name="monthly_cap_hours"
							step="1"
							min="0"
							value={props.p.monthlyCapHours != null ? String(props.p.monthlyCapHours) : ""}
							placeholder="Leave blank if uncapped"
						/>
					</div>
				</Show>
			</div>
			<div class="form-row">
				<div class="form-group">
					<label for="edit_status">Status</label>
					<SelectField
						id="edit_status"
						name="status"
						value={props.p.status}
						options={PROJECT_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
					/>
				</div>
				<div class="form-group">
					<label for="edit_start">Start Date</label>
					<input type="date" id="edit_start" name="start_date" value={props.p.startDate ?? ""} />
				</div>
				<div class="form-group">
					<label for="edit_end">End Date</label>
					<input type="date" id="edit_end" name="end_date" value={props.p.endDate ?? ""} />
				</div>
			</div>
			<div class="form-group">
				<label for="edit_notes">Scope / Notes</label>
				<textarea id="edit_notes" name="notes" rows={3}>{props.p.notes ?? ""}</textarea>
			</div>
		</>
	);
}
