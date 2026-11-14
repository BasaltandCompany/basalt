import { Title } from "@solidjs/meta";
import { A, createAsync, useAction } from "@solidjs/router";
import { For, Show, Suspense, createSignal, createMemo } from "solid-js";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import {
	createProjectAction,
	getProjectsQuery,
	getUserQuery,
} from "~/lib/queries";
import { getCompaniesForSelectQuery } from "~/lib/admin-queries";
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui";
import SelectField from "~/components/select-field";

const statusBadge: Record<string, string> = {
	active: "badge-active",
	paused: "badge-paused",
	completed: "badge-completed",
};

export default function Projects() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const projects = createAsync(() => getProjectsQuery(), { deferStream: true });
	const companies = createAsync(() => getCompaniesForSelectQuery(), {
		deferStream: true,
	});
	const createProject = useAction(createProjectAction);
	const [engagementType, setEngagementType] = createSignal("hourly");

	const isHourly = createMemo(() => engagementType() !== "project");

	return (
		<Layout user={user()}>
			<Title>Projects — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">Projects</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>All engagements</p>
				</div>
				<CreateDialog
					label="New Project"
					title="New Project"
					submitLabel="Create Project"
					successMessage="Project created."
					onSubmit={(fd) => createProject(fd) as Promise<{ error?: string } | undefined>}
				>
						<div class="form-row">
							<div class="form-group">
								<label for="name">Project Name</label>
								<input type="text" id="name" name="name" required placeholder="IU Data Agent" />
							</div>
						<div class="form-group">
							<label for="company_id">Company</label>
							<SelectField
								id="company_id"
								name="company_id"
								required
								placeholder="Select a company…"
								options={() => (companies() ?? []).map((c) => ({ value: c.id, label: c.name }))}
							/>
						</div>
					</div>
					<div class="form-row">
						<div class="form-group">
							<label for="engagement_type">Engagement Type</label>
							<SelectField
								id="engagement_type"
								name="engagement_type"
								value="hourly"
								onChange={setEngagementType}
								options={[
									{ value: "hourly", label: "Hourly" },
									{ value: "retainer", label: "Retainer (monthly cap)" },
									{ value: "project", label: "Project (fixed price)" },
								]}
							/>
						</div>
						<Show when={isHourly()}>
							<div class="form-group">
								<label for="hourly_rate">Hourly Rate ($)</label>
								<input type="number" id="hourly_rate" name="hourly_rate" step="1" min="0" value="200" />
							</div>
						</Show>
						<Show when={!isHourly()}>
							<div class="form-group">
								<label for="fixed_price">Fixed Price ($)</label>
								<input type="number" id="fixed_price" name="fixed_price" step="100" min="0" required placeholder="15000" />
							</div>
						</Show>
					</div>
					<Show when={engagementType() === "retainer"}>
						<div class="form-group">
							<label for="monthly_cap_hours">Monthly Cap (hours)</label>
							<input type="number" id="monthly_cap_hours" name="monthly_cap_hours" step="1" min="0" placeholder="Leave blank if uncapped" />
						</div>
					</Show>
					<div class="form-group">
						<label for="notes">Scope / Notes</label>
						<textarea id="notes" name="notes" rows={3} placeholder="What's planned, scope boundaries, deliverables…" />
					</div>
				</CreateDialog>
			</div>

			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show when={projects()} fallback={<p class="muted">Loading…</p>}>
					{(list) => (
						<Show when={list().length > 0} fallback={
							<Card class="empty">No projects yet. Create your first one above.</Card>
						}>
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Project</TableHead>
										<TableHead>Company</TableHead>
										<TableHead>Type</TableHead>
										<TableHead>Rate / Price</TableHead>
										<TableHead>Cap</TableHead>
										<TableHead>Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={list()}>
										{(p) => (
											<TableRow>
												<TableCell>
													<A href={`/admin/projects/${p.id}`}>{p.name}</A>
												</TableCell>
												<TableCell class="muted">{p.companyName}</TableCell>
												<TableCell style={{ "text-transform": "capitalize" }}>{p.engagementType}</TableCell>
												<TableCell class="mono">
													{p.engagementType === "project"
														? `$${(p.fixedPrice ?? 0).toLocaleString()} fixed`
														: `$${p.hourlyRate}/hr`}
												</TableCell>
												<TableCell class="muted">{p.monthlyCapHours ? `${p.monthlyCapHours}h` : "—"}</TableCell>
												<TableCell><span class={`badge ${statusBadge[p.status]}`}>{p.status}</span></TableCell>
											</TableRow>
										)}
									</For>
								</TableBody>
							</Table>
						</Show>
					)}
				</Show>
			</Suspense>
		</Layout>
	);
}
