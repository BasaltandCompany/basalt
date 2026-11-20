import { Title } from "@solidjs/meta";
import { useParams, revalidate, useAction } from "@solidjs/router";
import { createMemo, For, Show, Loading, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import ConfirmButton from "~/components/ConfirmButton";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import SelectField from "~/components/select-field";
import {
	addPersonEmailAction,
	getCompaniesQuery,
	getPersonQuery,
	linkPersonCompanyAction,
	removePersonEmailAction,
	unlinkPersonCompanyAction,
} from "~/lib/admin-queries";
import { getUserQuery } from "~/lib/queries";
import { stageLabel } from "~/db/schema";
import { Button, Card } from "@basaltac/ui2";

const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function PersonProfile() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const params = useParams();
	const memberId = () => params.id!;
	const person = createMemo(() => getPersonQuery(memberId()), { deferStream: true });
	const companies = createMemo(() => getCompaniesQuery(), { deferStream: true });

	const addEmail = useAction(addPersonEmailAction);
	const removeEmail = useAction(removePersonEmailAction);
	const linkCompany = useAction(linkPersonCompanyAction);
	const unlinkCompany = useAction(unlinkPersonCompanyAction);
	const [error, setError] = createSignal("");

	const unlinkedCompanies = () =>
		(companies() ?? []).filter((c) => !(person()?.companies ?? []).some((mc) => mc.id === c.id));

	const Section = (props: { title: string; count?: number; children?: JSX.Element }) => (
		<div style={{ "margin-top": "40px" }}>
			<div class="section-heading">
				{props.title}
				{props.count !== undefined && <span class="muted" style={{ "font-weight": "400", "margin-left": "8px" }}>{props.count}</span>}
			</div>
			{props.children}
		</div>
	);

	return (
		<Layout user={user()}>
			<Title>Person — Basalt</Title>
			<a href="/admin/contacts" class="muted" style={{ "font-size": "13px", "margin-bottom": "8px", display: "inline-block" }}>
				All People
			</a>

			<Show when={person()} fallback={<p class="muted">Loading…</p>}>
				{(p) => (
					<>
						<div style={{ display: "flex", "align-items": "center", gap: "12px" }}>
							<h1 class="page-title" style={{ margin: "0" }}>{p().member.name}</h1>
							<span class={`badge ${p().member.isActive ? "badge-active" : "badge-paused"}`}>
								{p().member.isActive ? "active" : "disabled"}
							</span>
							<Show when={p().brain}>
								{(b) => (
									<a href="/admin/brain" class="muted" style={{ "font-size": "13px" }}>
										Brain page: {b().slug}
									</a>
								)}
							</Show>
						</div>

						<Show when={error()}>
							<p class="login-error" style={{ "margin-top": "8px" }}>{error()}</p>
						</Show>

						{/* ── Addresses + companies ── */}
						<Card style={{ padding: "16px", "margin-top": "16px" }}>
							<div style={{ display: "flex", gap: "40px", "flex-wrap": "wrap" }}>
								<div style={{ flex: "1", "min-width": "280px" }}>
									<div class="muted" style={{ "font-size": "13px", "margin-bottom": "8px" }}>
										Email addresses — every address below matches their email threads
									</div>
									<For each={[{ id: "primary", email: p().member.email, primary: true }, ...p().addresses.filter((a) => a !== p().member.email).map((a) => ({ id: a, email: a, primary: false }))].map((x, i) => ({ ...x, key: String(i) }))}>
										{(addr) => (
											<div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px", "font-size": "14px" }}>
												<span class="mono">{addr.email}</span>
												<Show when={addr.primary}>
													<span class="badge badge-active">primary · login</span>
												</Show>
												<Show when={!addr.primary}>
													<ConfirmButton
														label="Remove"
														confirmText="Remove this address?"
														danger
														onConfirm={async () => {
															const fd = new FormData();
															fd.set("id", addr.id);
															fd.set("member_id", memberId());
															const res = (await removeEmail(fd)) as { error?: string } | undefined;
															if (res?.error) setError(res.error);
															await revalidate(getPersonQuery.keyFor(memberId()));
														}}
													/>
												</Show>
											</div>
										)}
									</For>
									<CreateDialog
										label="Add address"
										title="Add an email address"
										submitLabel="Add"
										triggerClass="btn btn-sm"
										onSubmit={async (fd) => {
											fd.set("member_id", memberId());
											const res = (await addEmail(fd)) as { error?: string } | undefined;
											if (res?.error) setError(res.error);
											await revalidate(getPersonQuery.keyFor(memberId()));
											return res;
										}}
									>
										<div class="form-group">
											<label for="email">Email address</label>
											<input type="email" id="email" name="email" required placeholder="eric@personal.com" spellcheck={false} />
										</div>
									</CreateDialog>
									<p class="muted" style={{ "font-size": "12px", "margin-top": "6px" }}>
										Emails where this person is CC'd aren't tracked (Gmail sync reads To/From only).
									</p>
								</div>
								<div style={{ flex: "1", "min-width": "240px" }}>
									<div class="muted" style={{ "font-size": "13px", "margin-bottom": "8px" }}>Companies</div>
									<Show when={p().companies.length > 0} fallback={<p class="muted" style={{ "font-size": "13px" }}>No companies linked.</p>}>
										<For each={p().companies}>
											{(c) => (
												<div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px", "font-size": "14px" }}>
													<a href={`/admin/companies/${c.id}`}>{c.name}</a>
													<ConfirmButton
														label="Unlink"
														confirmText="Unlink this company?"
														onConfirm={async () => {
															const fd = new FormData();
															fd.set("member_id", memberId());
															fd.set("company_id", c.id);
															const res = (await unlinkCompany(fd)) as { error?: string } | undefined;
															if (res?.error) setError(res.error);
															await revalidate(getPersonQuery.keyFor(memberId()));
														}}
													/>
												</div>
											)}
										</For>
									</Show>
									<Show when={unlinkedCompanies().length > 0}>
										<form
											style={{ display: "flex", gap: "8px", "margin-top": "8px", "align-items": "center" }}
											onSubmit={async (e) => {
												e.preventDefault();
												const fd = new FormData(e.target as HTMLFormElement);
												fd.set("member_id", memberId());
												const res = (await linkCompany(fd)) as { error?: string } | undefined;
												if (res?.error) setError(res.error);
												await revalidate(getPersonQuery.keyFor(memberId()));
											}}
										>
											<SelectField
												id="company_id"
												name="company_id"
												required
												placeholder="Choose…"
												options={() => unlinkedCompanies().map((c) => ({ value: c.id, label: c.name }))}
											/>
											<Button variant="outline" size="sm" type="submit">Link</Button>
										</form>
									</Show>
								</div>
							</div>
						</Card>

						{/* ── Outreach lifecycle ── */}
						<Show when={p().prospects.length > 0}>
							<Section title="Outreach" count={p().prospects.length}>
								<For each={p().prospects}>
									{(pr) => (
										<Card style={{ padding: "14px 20px", "margin-bottom": "8px" }}>
											<div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
												<span style={{ "font-size": "14px", "font-weight": "500" }}>{pr.company}</span>
												<span class="badge badge-active">{stageLabel(pr.stage)}</span>
									<Show when={pr.companyId}>
										<a href={`/admin/companies/${pr.companyId}`} class="muted" style={{ "font-size": "12px" }}>
											client org: {pr.companyName}
										</a>
									</Show>
												<Show when={pr.brainUrl}>
													<a href={pr.brainUrl!} target="_blank" rel="noopener noreferrer" class="muted" style={{ "font-size": "12px" }}>brain</a>
												</Show>
											</div>
											<Show when={pr.notes}>
												<p class="muted" style={{ "font-size": "13px", "margin": "4px 0 0" }}>{pr.notes}</p>
											</Show>
										</Card>
									)}
								</For>
							</Section>
						</Show>

						{/* ── Recent email ── */}
						<Section title="Recent email" count={p().messages.length}>
							<Show when={p().messages.length > 0} fallback={<Card class="empty">No email to/from their addresses.</Card>}>
								<For each={p().messages}>
									{(m) => (
										<Card style={{ padding: "12px 20px", "margin-bottom": "6px" }}>
											<div style={{ display: "flex", "align-items": "baseline", gap: "10px", "flex-wrap": "wrap" }}>
												<span class={`badge ${m.isSent ? "badge-active" : "badge-paused"}`}>{m.isSent ? "sent" : "received"}</span>
												<span style={{ "font-size": "14px" }}>{m.subject}</span>
												<span class="muted" style={{ "font-size": "12px" }}>{m.fromEmail ?? ""}</span>
												<span class="muted" style={{ "font-size": "12px", "margin-left": "auto" }}>{fmtDate(m.date)}</span>
											</div>
											<Show when={m.attachments.length > 0}>
												<div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap", "margin-top": "6px" }}>
													<For each={m.attachments}>
														{(a) => (
															<span class="badge badge-active" title={`${a.mimeType} · ${(a.size / 1024).toFixed(0)} KB · fetch bytes via MCP get_email_attachment`}>
																📎 {a.filename}
															</span>
														)}
													</For>
												</div>
											</Show>
										</Card>
									)}
								</For>
							</Show>
						</Section>

						{/* ── Projects / Quotes / Invoices / Deliverables ── */}
						<Section title="Projects" count={p().projects.length}>
							<Show when={p().projects.length > 0} fallback={<Card class="empty">No projects for their companies.</Card>}>
								<For each={p().projects}>
									{(proj) => (
										<Card style={{ padding: "14px 20px", "margin-bottom": "8px" }}>
											<div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
												<a href={`/admin/projects/${proj.id}`} style={{ "font-size": "14px", "font-weight": "500" }}>{proj.name}</a>
												<span class="badge badge-active">{proj.status}</span>
												<span class="muted" style={{ "font-size": "12px" }}>{proj.engagementType}</span>
											</div>
										</Card>
									)}
								</For>
							</Show>
						</Section>

						<Show when={p().quotes.length > 0}>
							<Section title="Quotes" count={p().quotes.length}>
								<For each={p().quotes}>
									{(q) => (
										<Card style={{ padding: "12px 20px", "margin-bottom": "6px" }}>
											<a href={`/admin/quotes/${q.id}`} style={{ "font-size": "14px" }}>{q.title}</a>
											<span class="badge badge-active" style={{ "margin-left": "10px" }}>{q.status}</span>
											<span class="muted" style={{ "font-size": "12px", "margin-left": "10px" }}>updated {fmtDate(q.updatedAt)}</span>
										</Card>
									)}
								</For>
							</Section>
						</Show>

						<Show when={p().invoices.length > 0}>
							<Section title="Invoices" count={p().invoices.length}>
								<For each={p().invoices}>
									{(inv) => (
										<div style={{ display: "flex", "align-items": "center", gap: "10px", "font-size": "13px", "margin-bottom": "4px" }}>
											<span class="mono">{inv.number}</span>
											<span class="mono">${inv.amount.toLocaleString()}</span>
											<span class={`badge ${inv.status === "paid" ? "badge-completed" : "badge-active"}`} style={{ "text-transform": "capitalize" }}>{inv.status}</span>
										</div>
									)}
								</For>
							</Section>
						</Show>

						<Show when={p().deliverables.length > 0}>
							<Section title="Deliverables" count={p().deliverables.length}>
								<For each={p().deliverables}>
									{(d) => (
										<div style={{ display: "flex", "align-items": "center", gap: "10px", "font-size": "13px", "margin-bottom": "4px" }}>
											<span>{d.title}</span>
											<span class="badge badge-active" style={{ "text-transform": "capitalize" }}>{d.status}</span>
										</div>
									)}
								</For>
							</Section>
						</Show>

						{/* ── Meetings ── */}
						<Section title="Meetings">
							<Show
								when={p().meetings.speakers.length > 0 || p().meetings.linked.length > 0}
								fallback={<Card class="empty">No meetings where they appear as a speaker or are linked.</Card>}
							>
								<For each={p().meetings.speakers}>
									{(m) => (
										<Card style={{ padding: "12px 20px", "margin-bottom": "6px" }}>
											<span style={{ "font-size": "14px" }}>{m.title}</span>
											<span class="badge badge-active" style={{ "margin-left": "10px" }}>speaker match</span>
											<span class="muted" style={{ "font-size": "12px", "margin-left": "10px" }}>{fmtDate(m.created_at)}</span>
										</Card>
									)}
								</For>
								<For each={p().meetings.linked}>
									{(card) => (
										<Card style={{ padding: "12px 20px", "margin-bottom": "6px" }}>
											<Show when={card.adminUrl} fallback={<span style={{ "font-size": "14px" }}>{card.title}</span>}>
												<a href={card.adminUrl!} style={{ "font-size": "14px" }}>{card.title}</a>
											</Show>
											<span class="badge badge-active" style={{ "margin-left": "10px" }}>linked</span>
										</Card>
									)}
								</For>
							</Show>
						</Section>

						{/* ── Docs & cross-links ── */}
						<Show when={p().links.length > 0}>
							<Section title="Docs & links" count={p().links.length}>
								<For each={p().links}>
									{(l) => (
										<div style={{ display: "flex", "align-items": "center", gap: "10px", "font-size": "13px", "margin-bottom": "4px" }}>
											<span class="muted">{l.direction === "out" ? "→" : "←"}</span>
											<span class="badge badge-active">{l.card.kind}</span>
											<Show when={l.card.adminUrl} fallback={<span>{l.card.title}</span>}>
												<a href={l.card.adminUrl!}>{l.card.title}</a>
											</Show>
											<Show when={l.card.deleted}>
												<span class="muted">(deleted)</span>
											</Show>
										</div>
									)}
								</For>
							</Section>
						</Show>

						{/* ── Brain dossier ── */}
						<Section title="Brain dossier">
							<Show
								when={p().brain}
								fallback={<Card class="empty">No brain page yet — run a brain cycle and their page appears (slug: person-…).</Card>}
							>
								{(b) => (
									<Card style={{ padding: "20px" }}>
										<Show when={b().compiledTruth}>
											<div style={{ "white-space": "pre-wrap", "font-size": "14px", "line-height": "1.6", "margin-bottom": "16px" }}>
												{b().compiledTruth}
											</div>
										</Show>
										<Show when={b().openLoops.length > 0}>
											<div class="muted" style={{ "font-size": "13px", "margin-bottom": "4px" }}>Open loops</div>
											<For each={b().openLoops}>
												{(l) => (
													<div style={{ "font-size": "13px", "margin-bottom": "2px" }}>
														⏳ {l.summary}
														<Show when={l.dueAt}>
															<span class="muted"> · due {fmtDate(l.dueAt!)}</span>
														</Show>
													</div>
												)}
											</For>
										</Show>
										<Show when={b().facts.length > 0}>
											<div class="muted" style={{ "font-size": "13px", "margin": "12px 0 4px" }}>Facts</div>
											<For each={b().facts.slice(0, 12)}>
												{(f) => (
													<div style={{ "font-size": "13px", "margin-bottom": "2px" }}>
														<span class={`badge ${f.notability === "high" ? "badge-active" : "badge-paused"}`}>{f.kind}</span>
														<span style={{ "margin-left": "8px" }}>{f.fact}</span>
													</div>
												)}
											</For>
										</Show>
										<Show when={b().timeline.length > 0}>
											<div class="muted" style={{ "font-size": "13px", "margin": "12px 0 4px" }}>Timeline</div>
											<For each={b().timeline}>
												{(t) => (
													<div style={{ "font-size": "13px", "margin-bottom": "2px" }}>
														<span class="mono muted">{t.date}</span>
														<span style={{ "margin-left": "8px" }}>{t.summary}</span>
													</div>
												)}
											</For>
										</Show>
									</Card>
								)}
							</Show>
						</Section>
					</>
				)}
			</Show>
		</Layout>
	);
}
