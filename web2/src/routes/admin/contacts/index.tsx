import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { For, Show, Loading } from "solid-js";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import { createPersonAction, getCompaniesQuery, getPeopleQuery } from "~/lib/admin-queries";
import { getUserQuery } from "~/lib/queries";
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui2";

export default function People() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const people = createMemo(() => getPeopleQuery(), { deferStream: true });
	const companies = createMemo(() => getCompaniesQuery(), { deferStream: true });
	const createPerson = createPersonAction;

	return (
		<Layout user={user()}>
			<Title>People — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">People</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
						Every person the firm knows — one profile per human, all their addresses and history
					</p>
				</div>
				<CreateDialog
					label="New Person"
					title="Add a person"
					successMessage="Person created."
					onSubmit={(fd) => createPerson(fd) as Promise<{ error?: string } | undefined>}
				>
					<div class="form-group">
						<label for="name">Name</label>
						<input type="text" id="name" name="name" required placeholder="Eric Brownell" />
					</div>
					<div class="form-group">
						<label for="email">Primary email</label>
						<input type="email" id="email" name="email" required placeholder="eric@bcwforms.com" spellcheck={false} />
					</div>
					<div class="form-group">
						<label for="company_id">Company (optional)</label>
						<select id="company_id" name="company_id">
							<option value="">None</option>
							<For each={companies() ?? []}>{(c) => <option value={c.id}>{c.name}</option>}</For>
						</select>
					</div>
					<p class="muted" style={{ "font-size": "12px" }}>
						No portal invite is sent — invite from the company page when they need portal access.
					</p>
				</CreateDialog>
			</div>

			<Loading fallback={<p class="muted">Loading…</p>}>
				<Show when={people()} fallback={<p class="muted">Loading…</p>}>
					{(list) => (
						<Show when={list().length > 0} fallback={<Card class="empty">No people yet. Add one above.</Card>}>
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Person</TableHead>
										<TableHead>Primary email</TableHead>
										<TableHead>Extra addresses</TableHead>
										<TableHead>Companies</TableHead>
										<TableHead>Status</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={list()}>
										{(m) => (
											<TableRow>
												<TableCell>
													<a href={`/admin/contacts/${m.id}`}>{m.name}</a>
												</TableCell>
												<TableCell class="muted">{m.email}</TableCell>
												<TableCell class="muted">
													{m.extraEmails.length > 0 ? `+${m.extraEmails.length}` : "—"}
												</TableCell>
												<TableCell class="muted">
													{m.companies.map((c) => c.name).join(", ") || "—"}
												</TableCell>
												<TableCell>
													<span class={`badge ${m.isActive ? "badge-active" : "badge-paused"}`}>
														{m.isActive ? "active" : "disabled"}
													</span>
												</TableCell>
											</TableRow>
										)}
									</For>
								</TableBody>
							</Table>
						</Show>
					)}
				</Show>
			</Loading>
		</Layout>
	);
}
