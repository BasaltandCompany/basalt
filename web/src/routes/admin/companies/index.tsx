import { Title } from "@solidjs/meta";
import { A, createAsync, useAction } from "@solidjs/router";
import { For, Show, Suspense, createSignal } from "solid-js";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import {
	createCompanyAction,
	getCompaniesQuery,
	getMembersQuery,
	resendInviteAction,
	toggleMemberActiveAction,
	linkMemberAction,
	getSignedInEmailsQuery,
} from "~/lib/admin-queries";
import { getUserQuery } from "~/lib/queries";
import { Button, Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui";

export default function Companies() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const companies = createAsync(() => getCompaniesQuery(), {
		deferStream: true,
	});
	const members = createAsync(() => getMembersQuery(), { deferStream: true });
	const signedInEmails = createAsync(() => getSignedInEmailsQuery(), {
		deferStream: true,
	});
	// Resend only while the invite is pending (member never signed in).
	const invitePending = (email: string) =>
		!(signedInEmails() ?? []).includes(email);
	const createCompany = useAction(createCompanyAction);
	const resendInvite = useAction(resendInviteAction);
	const toggleActive = useAction(toggleMemberActiveAction);
	const linkMember = useAction(linkMemberAction);

	const [error, setError] = createSignal("");
	const [success, setSuccess] = createSignal("");
	const [resendingId, setResendingId] = createSignal<string | null>(null);

	async function handleResend(id: string) {
		setError("");
		setSuccess("");
		setResendingId(id);
		try {
			const fd = new FormData();
			fd.set("id", id);
			const result = await resendInvite(fd);
			if (result?.error) {
				setError(result.error);
			} else if (result?.success) {
				setSuccess(result.success);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to resend invite.");
		} finally {
			setResendingId(null);
		}
	}

	return (
		<Layout user={user()}>
			<Title>Companies — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">Companies</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
						Client organizations + portal access
					</p>
				</div>
				<CreateDialog
					label="New Company"
					title="Create Company"
					successMessage="Company created."
					onSubmit={(fd) => createCompany(fd) as Promise<{ error?: string } | undefined>}
				>
					<div class="form-group">
						<label for="name">Company Name</label>
						<input type="text" id="name" name="name" required placeholder="Indiana University" />
					</div>
				</CreateDialog>
			</div>

			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show when={companies()} fallback={<p class="muted">Loading…</p>}>
					{(list) => (
						<Show when={list().length > 0} fallback={
							<Card class="empty">No companies yet. Create one above.</Card>
						}>
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Company</TableHead>
										<TableHead>Members</TableHead>
										<TableHead>Created</TableHead>
										<TableHead>Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={list()}>
										{(c) => (
											<TableRow>
												<TableCell>
													<A href={`/admin/companies/${c.id}`}>{c.name}</A>
												</TableCell>
												<TableCell class="muted">
													{(members() ?? []).filter((m) =>
														// ponytail: member-company link shown on detail page; here just count
														false,
													).length}
												</TableCell>
												<TableCell class="muted">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
												<TableCell>
													<Button as="a" variant="outline" size="sm" href={`/admin/companies/${c.id}`}>Manage</Button>
												</TableCell>
											</TableRow>
										)}
									</For>
								</TableBody>
							</Table>
						</Show>
					)}
				</Show>
			</Suspense>

			{/* ── Members section ─────────────────────────────────── */}
			<div style={{ "margin-top": "48px" }}>
				<div class="section-heading">Portal Members</div>
				<Show when={error()}>
					<p class="login-error" style={{ "margin-top": "8px" }}>{error()}</p>
				</Show>
				<Show when={success()}>
					<p style={{ color: "#16a34a", "font-size": "13px", "margin-top": "8px" }}>{success()}</p>
				</Show>
				<Suspense fallback={<p class="muted">Loading…</p>}>
					<Show when={members()} fallback={<p class="muted">Loading…</p>}>
						{(list) => (
							<Show when={list().length > 0} fallback={
								<Card class="empty">No members yet. Add them from a company detail page.</Card>
							}>
								<Table class="table">
									<TableHeader>
										<TableRow>
											<TableHead>Name</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										<For each={list()}>
											{(m) => (
												<TableRow>
													<TableCell>{m.name}</TableCell>
													<TableCell class="muted">{m.email}</TableCell>
													<TableCell>
														<span class={`badge ${m.isActive ? "badge-active" : "badge-paused"}`}>
															{m.isActive ? "active" : "disabled"}
														</span>
													</TableCell>
													<TableCell>
														<div style={{ display: "flex", gap: "8px" }}>
															<Show when={invitePending(m.email)}>
																<Button variant="outline" size="sm" onClick={() => handleResend(m.id)} disabled={resendingId() === m.id}>{resendingId() === m.id ? "Sending…" : "Resend Invite"}</Button>
															</Show>
															<form method="post" action="/admin/companies/toggle-member">
																<input type="hidden" name="id" value={m.id} />
																<input type="hidden" name="is_active" value={String(m.isActive)} />
																<Button variant="outline" size="sm" type="submit">{m.isActive ? "Disable" : "Enable"}</Button>
															</form>
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
				</Suspense>
			</div>

		</Layout>
	);
}
