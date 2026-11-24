// /admin/activity (ASPTR-227) — the weekly truth: observed hours by
// client/internal/personal bucket, agent tokens + API-equivalent cost per
// project, unassigned-block review with learn-on-assign, matcher CRUD, and
// convert-to-time-entry. Observed hours stay separate from billable entries.
import { Title } from "@solidjs/meta";
import { useAction } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import Layout from "~/components/Layout";
import SelectField from "~/components/select-field";
import { getActivityQuery, assignActivityAction, convertActivityAction, addMatcherAction, deleteMatcherAction } from "~/lib/activity-queries";
import { getUserQuery } from "~/lib/queries";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui";

const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n));

export default function ActivityPage() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const [weekOffset, setWeekOffset] = createSignal(0);
	const data = createMemo(() => getActivityQuery(weekOffset()), { deferStream: true });
	const assign = useAction(assignActivityAction);
	const convert = useAction(convertActivityAction);
	const addMatcher = useAction(addMatcherAction);
	const deleteMatcher = useAction(deleteMatcherAction);
	const [msg, setMsg] = createSignal("");

	async function run(fn: (fd: FormData) => Promise<{ error?: string; success?: string } | undefined>, fd: FormData) {
		const res = (await fn(fd)) as { error?: string; success?: string } | undefined;
		setMsg(res?.error ?? res?.success ?? "");
	}

	const assignForm = (id: string, remember: boolean) => (e: Event) => {
		e.preventDefault();
		const form = e.currentTarget as HTMLFormElement;
		const fd = new FormData(form);
		fd.set("id", id);
		if (remember) fd.set("remember", "on");
		void run(assign, fd);
	};

	return (
		<Layout user={user()}>
			<Title>Activity — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "12px" }}>
				<div>
					<h1 style={{ margin: 0 }}>Activity</h1>
					<span class="muted" style={{ "font-size": "13px" }}>
						Week of {data()?.weekOf} — automatically observed, never auto-billed
					</span>
				</div>
				<div style={{ display: "flex", gap: "6px" }}>
					<Button type="button" onClick={() => setWeekOffset(weekOffset() + 1)}>← Earlier</Button>
					<Button type="button" onClick={() => setWeekOffset(Math.max(0, weekOffset() - 1))} disabled={weekOffset() === 0}>
						Later →
					</Button>
				</div>
			</div>
			<Show when={msg()}>
				<div class="muted" style={{ "margin-bottom": "8px" }}>{msg()}</div>
			</Show>

			<Show when={data()}>
				{(d) => (
					<>
						<div class="stat-grid">
							<div class="stat-card">
								<div class="label">Client Hours</div>
								<div class="value">
									{d().clientTotalHours.toFixed(1)}
									<span class="unit"> hrs</span>
								</div>
							</div>
							<div class="stat-card">
								<div class="label">Internal</div>
								<div class="value">
									{d().internal.hours.toFixed(1)}
									<span class="unit"> hrs</span>
								</div>
							</div>
							<div class="stat-card">
								<div class="label">Personal</div>
								<div class="value">
									{d().personal.hours.toFixed(1)}
									<span class="unit"> hrs</span>
								</div>
							</div>
							<div class="stat-card">
								<div class="label">Unassigned</div>
								<div class="value">
									{d().unassigned.hours.toFixed(1)}
									<span class="unit"> hrs</span>
								</div>
							</div>
						</div>

						<div class="section-heading">Projects — hours · tokens · API-equivalent cost</div>
						<Card class="p-6">
							<Show
								when={(d().projects ?? []).length > 0}
								fallback={<p class="muted">No attributed work this week yet. Matchers decide attribution — check them below.</p>}
							>
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>Project</TableHead>
											<TableHead>Hours</TableHead>
											<TableHead>Tokens</TableHead>
											<TableHead>Sessions</TableHead>
											<TableHead>API-equiv $</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={d().projects}>
											{(p) => (
												<TableRow>
													<TableCell>{p.name}</TableCell>
													<TableCell class="mono">{p.hours.toFixed(1)}</TableCell>
													<TableCell class="mono">{fmtTokens(p.tokens)}</TableCell>
													<TableCell class="mono">{p.sessions}</TableCell>
													<TableCell class="mono">${p.apiCostUsd.toFixed(2)}</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
							</Show>
							<p class="muted" style={{ "font-size": "12px", "margin-top": "10px" }}>
								Tokens {fmtTokens(d().totalTokens)} · API-equivalent ${d().totalApiCostUsd.toFixed(2)} across all buckets. API-equivalent is
								what the same usage would cost at list price — with a coding plan it verifies the subscription, it is not spend.
							</p>
						</Card>

						<Show when={(d().unassignedBlocks ?? []).length > 0}>
							<div class="section-heading">Unassigned blocks — review &amp; assign</div>
							<Card class="p-6">
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>When</TableHead>
											<TableHead>Hours</TableHead>
											<TableHead>Context</TableHead>
											<TableHead>Assign</TableHead>
											<TableHead>Log</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={d().unassignedBlocks}>
											{(b) => (
												<TableRow>
													<TableCell class="muted" style={{ "white-space": "nowrap" }}>
														{new Date(b.startedAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}
													</TableCell>
													<TableCell class="mono">{b.hours.toFixed(1)}</TableCell>
													<TableCell>
														{b.appName ?? b.source}
														<Show when={b.titleSnippet}>
															<span class="muted"> · {b.titleSnippet}</span>
														</Show>
													</TableCell>
													<TableCell>
														<form onSubmit={assignForm(b.id, true)} style={{ display: "flex", gap: "6px" }}>
															<SelectField
																name="target"
																required
																placeholder="Project or bucket…"
																options={() => [
																	...d().projectOptions.map((p) => ({ value: `p:${p.id}`, label: p.name })),
																	{ value: "c:internal", label: "Internal" },
																	{ value: "c:personal", label: "Personal" },
																]}
															/>
															<Button type="submit">Assign</Button>
														</form>
														<span class="muted" style={{ "font-size": "11px" }}>remembers this app for next time</span>
													</TableCell>
													<TableCell>
														<Show
															when={b.convertedEntryId}
															fallback={
																<form
																	onSubmit={(e) => {
																		e.preventDefault();
																		const fd = new FormData();
																		fd.set("id", b.id);
																		void run(convert, fd);
																	}}
																>
																	<Button type="submit" disabled={!b.hours}>→ time entry</Button>
																</form>
															}
														>
															<span class="muted" style={{ "font-size": "11px" }}>logged ✓</span>
														</Show>
													</TableCell>
												</TableRow>
											)}
										</For>
									</TableBody>
								</Table>
								<p class="muted" style={{ "font-size": "12px", "margin-top": "10px" }}>
									Assigning an unassigned block with a project selected also learns the app → project matcher. Convert only after assigning to a project.
								</p>
							</Card>
						</Show>

						<div class="section-heading">Attribution matchers</div>
						<Card class="p-6">
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Kind</TableHead>
										<TableHead>Pattern</TableHead>
										<TableHead>Maps to</TableHead>
										<TableHead>Source</TableHead>
										<TableHead>Uses</TableHead>
										<TableHead />
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={d().matchers}>
										{(m) => (
											<TableRow>
												<TableCell class="mono">{m.kind}</TableCell>
												<TableCell class="mono">{m.pattern}</TableCell>
												<TableCell>{m.projectName ?? m.category ?? "—"}</TableCell>
												<TableCell class="muted">{m.source}</TableCell>
												<TableCell class="mono">{m.useCount}</TableCell>
												<TableCell>
													<form
														onSubmit={(e) => {
															e.preventDefault();
															const fd = new FormData();
															fd.set("id", m.id);
															void run(deleteMatcher, fd);
														}}
													>
														<Button type="submit" class="btn-danger">Delete</Button>
													</form>
												</TableCell>
											</TableRow>
										)}
									</For>
								</TableBody>
							</Table>

							<form
								onSubmit={(e) => {
									e.preventDefault();
									void run(addMatcher, new FormData(e.currentTarget as HTMLFormElement));
									(e.currentTarget as HTMLFormElement).reset();
								}}
								style={{ "margin-top": "14px" }}
							>
								<div class="form-row">
									<div class="form-group">
										<label for="m_kind">Kind</label>
										<SelectField
											id="m_kind"
											name="kind"
											required
											placeholder="Kind…"
											options={() => [
												{ value: "worktree", label: "worktree path" },
												{ value: "git_remote", label: "git remote" },
												{ value: "title", label: "window title" },
											]}
										/>
									</div>
									<div class="form-group">
										<label for="m_pattern">Pattern</label>
										<input id="m_pattern" name="pattern" required placeholder="/Users/…/workspaces/cdl · github.com/org/repo · BCW" />
									</div>
									<div class="form-group">
										<label for="m_target">Maps to</label>
										<SelectField
											id="m_target"
											name="target"
											required
											placeholder="Project or bucket…"
											options={() => [
												...d().projectOptions.map((p) => ({ value: `p:${p.id}`, label: p.name })),
												{ value: "c:internal", label: "Internal" },
												{ value: "c:personal", label: "Personal" },
											]}
										/>
									</div>
									<div class="form-group" style={{ "align-self": "flex-end" }}>
										<Button type="submit">Add matcher</Button>
									</div>
								</div>
							</form>
						</Card>
					</>
				)}
			</Show>
		</Layout>
	);
}
