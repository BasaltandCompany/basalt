import { Title } from "@solidjs/meta";
import { useParams, revalidate, useAction } from "@solidjs/router";
import { createMemo } from "solid-js";
import { For, Show, Loading, createSignal } from "solid-js";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import ProjectDocuments from "~/components/ProjectDocuments";
import ConfirmButton from "~/components/ConfirmButton";
import {
	createMemberAction,
	linkMemberAction,
	removeMemberAction,
	resendInviteAction,
	getSignedInEmailsQuery,
	getCompaniesQuery,
	getCompanyMembersQuery,
	getMembersQuery,
	getProjectsForSelectQuery,
	getInvoicesQuery,
	createInvoiceAction,
	deleteInvoiceAction,
	updateCompanyAliasesAction,
	getCompanyToolsQuery,
	createToolAction,
	updateToolAction,
	deleteToolAction,
	getCompanyValueQuery,
	getReviewerReviewsQuery,
	getCompanyReviewerUsageQuery,
} from "~/lib/admin-queries";
import { grossSavedForTool, usd } from "~/lib/value";
import { getUserQuery } from "~/lib/queries";
import type { InvoiceStatus } from "~/db/schema";
import { Button, Card } from "@basaltac/ui";
import SelectField from "~/components/select-field";

export default function CompanyDetail() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const params = useParams();
	const companyId = () => params.id!;

	const companies = createMemo(() => getCompaniesQuery(), { deferStream: true });
	const company = () => (companies() ?? []).find((c) => c.id === companyId());

	const companyMembers = createMemo(
		() => getCompanyMembersQuery(companyId()),
		{ deferStream: true },
	);
	const signedInEmails = createMemo(() => getSignedInEmailsQuery(), {
		deferStream: true,
	});
	// Invite pending = member never signed in (invite unaccepted/expired, or
	// auth user missing). Resend button shows until their first sign-in.
	const invitePending = (email: string) =>
		!(signedInEmails() ?? []).includes(email);
	const allMembers = createMemo(() => getMembersQuery(), { deferStream: true });
	const projects = createMemo(() => getProjectsForSelectQuery(), {
		deferStream: true,
	});
	const companyProjects = () =>
		(projects() ?? []).filter((p) => p.companyId === companyId());

	const createMember = useAction(createMemberAction);
	const linkMember = useAction(linkMemberAction);
	const removeMember = useAction(removeMemberAction);
	const resendInvite = useAction(resendInviteAction);
	const addInvoice = useAction(createInvoiceAction);
	const saveAliases = useAction(updateCompanyAliasesAction);

	const [showInvForm, setShowInvForm] = createSignal<string | null>(null);
	const [error, setError] = createSignal("");
	const [success, setSuccess] = createSignal("");

	const companyTools = createMemo(() => getCompanyToolsQuery(companyId()), { deferStream: true });
	const reviewerUsage = createMemo(() => getCompanyReviewerUsageQuery(companyId()), { deferStream: true });
	const companyReviews = createMemo(() => getReviewerReviewsQuery(companyId()), { deferStream: true });
	const companyValue = createMemo(() => getCompanyValueQuery(companyId()), { deferStream: true });
	const addTool = useAction(createToolAction);
	const updateTool = useAction(updateToolAction);
	const deleteTool = useAction(deleteToolAction);

	const referer = () => `/admin/companies/${companyId()}`;
	const today = new Date().toISOString().slice(0, 10);

	// Members not yet linked to this company
	const unlinkedMembers = () =>
		(allMembers() ?? []).filter(
			(m) => !(companyMembers() ?? []).some((cm) => cm.id === m.id),
		);

	async function handleResendInvite(memberId: string, email: string) {
		setError("");
		setSuccess("");
		try {
			const fd = new FormData();
			fd.set("id", memberId);
			const result = await resendInvite(fd);
			if (result?.error) setError(result.error);
			else setSuccess(`Invite re-sent to ${email}.`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to resend invite.");
		}
	}

	async function handleInvoice(e: Event, projectId: string) {
		e.preventDefault();
		const fd = new FormData(e.target as HTMLFormElement);
		fd.set("project_id", projectId);
		fd.set("_referer", referer());
		await addInvoice(fd);
	}

	return (
		<Layout user={user()}>
			<Title>Company Detail — Basalt</Title>
			<a href="/admin/companies" class="muted" style={{ "font-size": "13px", "margin-bottom": "8px", display: "inline-block" }}>
				All Companies
			</a>

			<Show when={company()} fallback={<p class="muted">Loading…</p>}>
				{(c) => (
					<>
						<h1 class="page-title">{c().name}</h1>

						{/* ── Meeting pseudonyms (Anarlog publisher) ── */}
						<Card style={{ padding: "16px", "margin-top": "16px" }}>
							<div class="muted" style={{ "font-size": "13px", "margin-bottom": "6px" }}>
								Meeting pseudonyms — Anarlog meetings whose title contains one of these push to the dashboard as drafts
							</div>
							<form
								onSubmit={async (e) => {
									e.preventDefault();
									const fd = new FormData(e.target as HTMLFormElement);
									fd.set("id", companyId());
									const res = (await saveAliases(fd)) as { error?: string } | undefined;
									if (res?.error) setError(res.error);
									await revalidate(getCompaniesQuery.key);
								}}
								style={{ display: "flex", gap: "8px", "align-items": "center" }}
							>
								<input
									type="text"
									name="aliases"
									placeholder="e.g. CDL, Customs Data Lock"
									value={(JSON.parse(c().aliases ?? "[]") as string[]).join(", ")}
									style={{ flex: "1" }}
								/>
								<Button variant="outline" size="sm" type="submit">Save</Button>
							</form>
						</Card>

						{/* ── Replaced SaaS tools (savings ledger) ──── */}
						<div style={{ "margin-top": "32px" }}>
							<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "16px" }}>
								<div class="section-heading" style={{ margin: "0" }}>Replaced SaaS Tools</div>
								<CreateDialog
									label="Add Tool"
									title="Add a replaced SaaS tool"
									submitLabel="Add"
									triggerClass="btn btn-sm btn-primary"
									successMessage="Tool added."
									onSubmit={async (fd) => {
										fd.set("company_id", companyId());
										fd.set("_referer", referer());
										await addTool(fd);
										await revalidate(getCompanyToolsQuery.key);
										await revalidate(getCompanyValueQuery.key);
									}}
								>
									<div class="form-row">
										<div class="form-group">
											<label for="t_name">Tool name</label>
											<input type="text" id="t_name" name="name" required placeholder="Zoom" />
										</div>
										<div class="form-group">
											<label for="t_cost">Was $/mo</label>
											<input type="number" id="t_cost" name="monthly_cost" step="0.01" min="0" required placeholder="49" />
										</div>
									</div>
									<div class="form-group">
										<label for="t_cutover">Cutover date (blank = planned)</label>
										<input type="date" id="t_cutover" name="cutover_date" />
									</div>
									<div class="form-group">
										<label for="t_notes">Notes</label>
										<textarea id="t_notes" name="notes" rows={2} placeholder="Replaced with the in-house pipeline" />
									</div>
								</CreateDialog>
							</div>

							<Loading fallback={<p class="muted">Loading…</p>}>
								<Show when={companyValue()}>{(v) => (
									<div class="stat-grid" style={{ "margin-bottom": "16px" }}>
										<div class="stat-card">
											<div class="label">Gross saved</div>
											<div class="value">{usd(v().grossSaved)}</div>
										</div>
										<div class="stat-card">
											<div class="label">Fees (billable × rate)</div>
											<div class="value">{usd(v().fees)}</div>
										</div>
										<div class="stat-card">
											<div class="label">Net ROI</div>
											<div class="value">{usd(v().net)}</div>
										</div>
									</div>
								)}</Show>

								<Show when={companyTools()}>
									{(list) => (
										<Show when={list().length > 0} fallback={<Card class="empty">No replaced tools yet.</Card>}>
											<div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
												<For each={list()}>
													{(t) => (
																<Card style={{ display: "flex", "align-items": "center", gap: "12px", padding: "14px 20px", "flex-wrap": "wrap" }}>
															<div style={{ flex: "1", "min-width": "220px" }}>
																<span style={{ "font-size": "14px" }}>{t.name}</span>
																<span class="muted" style={{ "font-size": "12px", "margin-left": "8px" }}>
																	{usd(t.monthlyCost)}/mo
																</span>
																<span class={`badge ${t.cutoverDate ? "badge-completed" : "badge-paused"}`} style={{ "margin-left": "8px" }}>
																	{t.cutoverDate ? "replaced" : "planned"}
																</span>
																<span class="muted" style={{ "font-size": "12px", "margin-left": "8px" }}>
																	saved {usd(grossSavedForTool(t))}
																</span>
															</div>
															<form
																onSubmit={async (e) => {
																	e.preventDefault();
																	const fd = new FormData(e.target as HTMLFormElement);
																	fd.set("id", t.id);
																	fd.set("_referer", referer());
																	await updateTool(fd);
																	await revalidate(getCompanyToolsQuery.key);
																	await revalidate(getCompanyValueQuery.key);
																}}
																style={{ display: "inline-flex", gap: "8px", "align-items": "center" }}
															>
																<input type="hidden" name="name" value={t.name} />
																<input type="hidden" name="monthly_cost" value={t.monthlyCost} />
																<input type="hidden" name="notes" value={t.notes ?? ""} />
																<input
																	type="date"
																	name="cutover_date"
																	value={t.cutoverDate ? new Date(t.cutoverDate).toISOString().slice(0, 10) : ""}
																	style={{ "font-size": "13px" }}
																/>
																<Button variant="outline" size="sm" type="submit">
																	{t.cutoverDate ? "Update" : "Cut over"}
																</Button>
															</form>
															<ConfirmButton
																label="Remove"
																confirmText="Remove this tool?"
																danger
																				onConfirm={async () => {
																					const fd = new FormData();
																					fd.set("id", t.id);
																					await deleteTool(fd);
																					await revalidate(getCompanyToolsQuery.key);
																					await revalidate(getCompanyValueQuery.key);
																				}}
															/>
														</Card>
													)}
												</For>
											</div>
										</Show>
									)}
								</Show>
							</Loading>
						</div>

						{/* ── Members ─────────────────────────────────── */}
						<div style={{ "margin-top": "32px" }}>
							<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "16px" }}>
								<div class="section-heading" style={{ margin: "0" }}>Members</div>
								<div style={{ display: "flex", gap: "8px" }}>
									<CreateDialog
										label="Link Existing"
										title="Link an existing member"
										submitLabel="Link"
										triggerClass="btn btn-sm"
										successMessage="Member linked."
										onSubmit={async (fd) => {
											fd.set("company_id", companyId());
											await linkMember(fd);
											await revalidate(getCompanyMembersQuery.key);
										}}
									>
										<div class="form-group">
											<label for="member_id">Select Member</label>
											<SelectField
												id="member_id"
												name="member_id"
												required
												placeholder="Choose…"
												options={() =>
													(unlinkedMembers() ?? []).map((m) => ({
														value: m.id,
														label: `${m.name} (${m.email})`,
													}))
												}
											/>
										</div>
									</CreateDialog>
									<CreateDialog
										label="Add Member"
										title="Add a member"
										submitLabel="Create + Link"
										triggerClass="btn btn-sm btn-primary"
										onSubmit={async (fd) => {
											fd.set("company_id", companyId());
											const result = (await createMember(fd)) as { error?: string; success?: string } | undefined;
											if (!result?.error) await revalidate(getCompanyMembersQuery.key);
											return result;
										}}
									>
										<div class="form-row">
											<div class="form-group">
												<label for="m_name">Name</label>
												<input type="text" id="m_name" name="name" required placeholder="John Smith" />
											</div>
											<div class="form-group">
												<label for="m_email">Email (login)</label>
												<input type="email" id="m_email" name="email" required placeholder="john@company.com" spellcheck={false} />
											</div>
										</div>
										<p class="muted" style={{ "font-size": "12px" }}>An invite email will be sent so they can set their own password.</p>
									</CreateDialog>
								</div>
							</div>


						<Show when={success()}>
							<p style={{ color: "#16a34a", "font-size": "13px", "margin-bottom": "12px" }}>{success()}</p>
						</Show>

							<Loading fallback={<p class="muted">Loading…</p>}>
								<Show when={companyMembers()}>
									{(list) => (
										<Show when={list().length > 0} fallback={<Card class="empty">No members yet.</Card>}>
											<div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
												<For each={list()}>
													{(m) => (
														<Card style={{ display: "flex", "align-items": "center", gap: "12px", padding: "14px 20px" }}>
															<div style={{ flex: "1" }}>
																<span style={{ "font-size": "14px" }}>{m.name}</span>
																<span class="muted" style={{ "font-size": "12px", "margin-left": "8px" }}>{m.email}</span>
																<span class={`badge ${m.isActive ? "badge-active" : "badge-paused"}`} style={{ "margin-left": "8px" }}>
																	{m.isActive ? "active" : "disabled"}
																</span>
															</div>
															<div style={{ display: "flex", gap: "8px" }}>
																<Show when={invitePending(m.email)}>
																	<Button variant="outline" size="sm" onClick={() => handleResendInvite(m.id, m.email)}
																	>
																		Resend Invite
																	</Button>
																</Show>
																<ConfirmButton
																	label="Remove"
																	confirmText="Remove everywhere?"
																		danger
																		onConfirm={() => {
																			const fd = new FormData();
																			fd.set("member_id", m.id);
																			return removeMember(fd);
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
						</div>

						{/* ── Projects ────────────────────────────────── */}
						<Loading fallback={<p class="muted">Loading…</p>}>
							<div style={{ "margin-top": "40px" }}>
								<div class="section-heading">Projects</div>
								<Show when={companyProjects().length > 0} fallback={<Card class="empty">No projects yet for this company.</Card>}>
									<For each={companyProjects()}>
										{(proj) => (
											<CompanyProjectSection
												proj={proj}
												referer={referer()}
												today={today}
												showInvForm={showInvForm() === proj.id}
												toggleInvForm={() => setShowInvForm(showInvForm() === proj.id ? null : proj.id)}
												onInvoice={(e) => handleInvoice(e, proj.id)}
											/>
										)}
									</For>
								</Show>
							</div>
						</Loading>
				{/* ── Basalt Reviewer (automated PR reviews) ── */}
				<Loading fallback={<p class="muted">Loading…</p>}>
					<div style={{ "margin-top": "40px" }}>
						<div class="section-heading">PR reviews</div>
						<Show
							when={(reviewerUsage()?.installs?.length ?? 0) > 0}
							fallback={<Card class="empty">No Basalt Reviewer installation mapped to this company yet — approve the install and map it in the reviewer admin.</Card>}
						>
							<div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap", "margin-bottom": "12px" }}>
								<For each={reviewerUsage()?.installs ?? []}>
									{(inst) => (
										<span class="badge">{inst.accountLogin || "(account pending)"}{inst.approved ? "" : " · unapproved"}</span>
									)}
								</For>
								<For each={reviewerUsage()?.counts ?? []}>
									{(c) => (
										<span class="badge">
											{c.lane}: {c.reviews} this month
											{c.securityFindings > 0 ? ` · 🔒 ${c.securityFindings}` : ""}
											</span>
									)}
								</For>
							</div>
							<Show when={companyReviews()?.length}>
								<div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
									<For each={companyReviews()}>
										{(row) => (
											<Card style={{ padding: "10px 16px", display: "flex", "align-items": "center", gap: "10px", "flex-wrap": "wrap" }}>
												<span class="mono" style={{ "font-size": "13px", "font-weight": "600" }}>
													{row.review.repo}#{row.review.prNumber}
												</span>
												<span class="badge">{row.review.lane}</span>
												<span class="badge">{row.review.status}</span>
												<Show when={row.review.securityCount > 0}>
													<span class="badge">🔒 {row.review.securityCount}</span>
												</Show>
												<span class="muted" style={{ "font-size": "12px", "margin-left": "auto" }}>
													{new Date(row.review.createdAt).toLocaleString()}
												</span>
											</Card>
										)}
									</For>
								</div>
							</Show>
						</Show>
					</div>
				</Loading>
					</>
				)}
			</Show>
		</Layout>
	);
}

// ── Per-project section (docs + invoices) ──────────────────────────

function CompanyProjectSection(props: {
	proj: { id: string; name: string; companyName: string };
	referer: string;
	today: string;
	showInvForm: boolean;
	toggleInvForm: () => void;
	onInvoice: (e: Event) => void;
}) {
	const invoices = createMemo(() => getInvoicesQuery(props.proj.id), { deferStream: true });
	const deleteInvoice = useAction(deleteInvoiceAction);

	return (
		<Card style={{ "margin-bottom": "16px", padding: "24px" }}>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "16px" }}>
				<a href={`/admin/projects/${props.proj.id}`} style={{ "font-size": "16px", "font-weight": "500" }}>
					{props.proj.name}
				</a>
			</div>

			<ProjectDocuments projectId={props.proj.id} referer={props.referer} />

			{/* Invoices */}
			<div>
				<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "8px" }}>
					<span class="muted" style={{ "font-size": "13px" }}>Invoices</span>
					<Button variant="outline" size="sm" onClick={props.toggleInvForm}>New Invoice</Button>
				</div>
				<Show when={props.showInvForm}>
					<Card style={{ "margin-bottom": "8px", padding: "16px" }}>
						<form onSubmit={props.onInvoice}>
							<div class="form-row">
								<div class="form-group">
									<label for={`inv_num_${props.proj.id}`}>Invoice #</label>
									<input type="text" id={`inv_num_${props.proj.id}`} name="number" required placeholder="INV-2026-003" />
								</div>
								<div class="form-group">
									<label for={`inv_amt_${props.proj.id}`}>Amount ($)</label>
									<input type="number" id={`inv_amt_${props.proj.id}`} name="amount" required step="0.01" min="0" placeholder="6000.00" />
								</div>
							</div>
							<div class="form-row">
								<div class="form-group">
									<label for={`inv_st_${props.proj.id}`}>Status</label>
									<SelectField
										id={`inv_st_${props.proj.id}`}
										name="status"
										value="draft"
										options={[
											{ value: "draft", label: "Draft" },
											{ value: "sent", label: "Sent" },
										]}
									/>
								</div>
								<div class="form-group">
									<label for={`inv_iss_${props.proj.id}`}>Issue Date</label>
									<input type="date" id={`inv_iss_${props.proj.id}`} name="issue_date" required value={props.today} />
								</div>
							</div>
							<div class="form-group">
								<label for={`inv_due_${props.proj.id}`}>Due Date</label>
								<input type="date" id={`inv_due_${props.proj.id}`} name="due_date" />
							</div>
							<Button type="submit">Create</Button>
						</form>
					</Card>
				</Show>
				<Loading fallback={<p class="muted" style={{ "font-size": "12px" }}>Loading…</p>}>
					<Show when={invoices()}>
						{(list) => (
							<Show when={list().length > 0} fallback={<p class="muted" style={{ "font-size": "12px" }}>No invoices.</p>}>
								<For each={list()}>
									{(inv) => (
										<div style={{ display: "flex", "align-items": "center", gap: "8px", "font-size": "13px", "margin-bottom": "4px" }}>
											<span class="mono">{inv.number}</span>
											<span class="mono">${inv.amount.toLocaleString()}</span>
											<span class={`badge ${inv.status === "paid" ? "badge-completed" : inv.status === "void" ? "badge-paused" : "badge-active"}`} style={{ "text-transform": "capitalize" }}>
												{inv.status}
											</span>
											<Show when={inv.paymentUrl}>
												<a href={inv.paymentUrl!} target="_blank" rel="noopener noreferrer" class="muted" style={{ "font-size": "12px" }}>Pay</a>
											</Show>
											<ConfirmButton
																label="Delete"
																danger
																style={{ "margin-left": "auto" }}
																onConfirm={async () => {
																	const fd = new FormData();
																	fd.set("id", inv.id);
																	if (inv.storagePath)
																		fd.set("storage_path", inv.storagePath!);
																	return deleteInvoice(fd);
																}}
															/>
										</div>
									)}
								</For>
							</Show>
						)}
					</Show>
				</Loading>
			</div>
		</Card>
	);
}
