import { Title } from "@solidjs/meta";
import { createMemo, For, Show, createSignal, onSettled } from "solid-js";

import ConfirmButton from "~/components/ConfirmButton";
import CreateDialog from "~/components/CreateDialog";
import Layout from "~/components/Layout";
import { getUserQuery } from "~/lib/queries";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui2";
import SelectField from "~/components/select-field";

type Share = {
	id: string;
	title: string;
	token: string;
	status: string;
	note: string | null;
	expiresAt: string | null;
	createdAt: string;
	projectName: string | null;
	itemCount: number;
	lastUploadAt: string | null;
};
type ProjectOption = { id: string; name: string };

const isExpired = (s: Share) => Boolean(s.expiresAt && new Date(s.expiresAt).getTime() < Date.now());
const statusLabel = (s: Share) => (isExpired(s) ? "expired" : s.status);
const fmtBytes = (n: number | null) =>
	n === null ? "—" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

// Secure shares — guest upload links for secrets (.env files, API keys).
// Everything is AES-256-GCM encrypted at rest under a master key; contents are
// admin-viewable only. Clients upload via /drop/<token> with no login.
export default function AdminSecureShares() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const [shares, setShares] = createSignal<Share[]>([]);
	const [projectOptions, setProjectOptions] = createSignal<ProjectOption[]>([]);

	async function refresh() {
		const r = await fetch("/api/secure-shares");
		if (r.ok) {
			const body = (await r.json()) as { shares: Share[]; projects: ProjectOption[] };
			setShares(body.shares);
			setProjectOptions(body.projects);
		}
	}
	onSettled(() => void refresh());

	async function create(fd: FormData): Promise<{ error?: string; success?: string; token?: string }> {
		const r = await fetch("/api/secure-shares", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: String(fd.get("title") ?? "").trim(),
				note: String(fd.get("note") ?? "").trim(),
				projectId: String(fd.get("projectId") ?? "") || null,
				expiresAt: String(fd.get("expiresAt") ?? "") || null,
			}),
		});
		const body = (await r.json()) as { error?: string; share?: { token: string } };
		if (!r.ok || !body.share) return { error: body.error ?? "Create failed" };
		await refresh();
		return { success: "Secure share created", token: body.share.token };
	}

	async function setStatus(s: Share, status: "open" | "closed") {
		const r = await fetch(`/api/secure-shares/${s.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status }),
		});
		if (!r.ok) return { error: ((await r.json()) as { error?: string }).error ?? "Update failed" };
		await refresh();
	}

	async function remove(s: Share) {
		const r = await fetch(`/api/secure-shares/${s.id}`, { method: "DELETE" });
		if (!r.ok) return { error: ((await r.json()) as { error?: string }).error ?? "Delete failed" };
		await refresh();
	}

	const [copied, setCopied] = createSignal("");
	async function copyDropUrl(s: Share) {
		await navigator.clipboard.writeText(`${location.origin}/drop/${s.token}`);
		setCopied(s.id);
		setTimeout(() => setCopied(""), 1200);
	}

	return (
		<Layout user={user()}>
			<Title>Secure shares — Basalt</Title>
			<h1 class="page-title" style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "16px", "margin-bottom": "4px" }}>
				Secure Shares
				<CreateDialog
					label="Create a share link"
					title="Create a secure share link"
					submitLabel="Create link"
					onSubmit={create}
					renderSuccess={(result) => {
						const token = String(result.token ?? "");
						return (
							<div>
								<p style={{ "font-size": "13px", "margin-bottom": "8px" }}>
									Send this link to your client. Anyone with it can upload (encrypted); only the admin can read.
								</p>
								<code style={{ "font-size": "13px", "word-break": "break-all", display: "block", "margin-bottom": "12px" }}>
									{location.origin}/drop/{token}
								</code>
								<Button
									type="button"
									onClick={() => {
										void navigator.clipboard.writeText(`${location.origin}/drop/${token}`);
										setCopied(token);
									}}
								>
									{copied() === token ? "Copied" : "Copy link"}
								</Button>
							</div>
						);
					}}
				>
					<div class="form-group">
						<label for="share_title">Title (what the client sees)</label>
						<input id="share_title" name="title" placeholder="Acme — project credentials" required />
					</div>
					<div class="form-group">
						<label for="share_note">Note to the guest (optional)</label>
						<textarea id="share_note" name="note" rows={3} placeholder="Paste your .env and API keys here…" />
					</div>
					<div class="form-group">
						<label for="share_project">Project (optional)</label>
						<SelectField
							id="share_project"
							name="projectId"
							value=""
							options={() => [{ value: "", label: "— none —" }, ...projectOptions().map((p) => ({ value: p.id, label: p.name }))]}
						/>
					</div>
					<div class="form-group">
						<label for="share_expires">Expires (optional)</label>
						<input id="share_expires" name="expiresAt" type="date" />
					</div>
				</CreateDialog>
			</h1>
			<p class="page-subtitle">
				Guest links for secrets — clients upload with no login, contents are encrypted at rest and viewable only here.
			</p>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Title</TableHead>
						<TableHead>Project</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Items</TableHead>
						<TableHead>Last upload</TableHead>
						<TableHead>Expires</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					<For each={shares()}>
						{(s) => (
							<TableRow>
								<TableCell>
									<a href={`/admin/secure-shares/${s.id}`}>{s.title}</a>
								</TableCell>
								<TableCell>
									<Show when={s.projectName} fallback={<span class="muted">—</span>}>
										{s.projectName}
									</Show>
								</TableCell>
								<TableCell>
									<span
										style={{
											"font-size": "12px",
											padding: "2px 8px",
											border: "1px solid currentColor",
											color: statusLabel(s) === "open" ? "#2d6a2d" : statusLabel(s) === "expired" ? "#a06020" : "#666",
										}}
									>
										{statusLabel(s)}
									</span>
								</TableCell>
								<TableCell style={{ "font-variant-numeric": "tabular-nums" }}>{s.itemCount}</TableCell>
								<TableCell>
									<Show when={s.lastUploadAt} fallback={<span class="muted">—</span>}>
										{new Date(s.lastUploadAt!).toLocaleString()}
									</Show>
								</TableCell>
								<TableCell>
									<Show when={s.expiresAt} fallback={<span class="muted">never</span>}>
										{new Date(s.expiresAt!).toLocaleDateString()}
									</Show>
								</TableCell>
								<TableCell>
									<span style={{ display: "inline-flex", gap: "6px", "align-items": "center" }}>
										<Button variant="outline" size="sm" type="button" onClick={() => void copyDropUrl(s)}>
											{copied() === s.id ? "Copied" : "Copy link"}
										</Button>
										<Button variant="outline" size="sm" type="button" onClick={() => void setStatus(s, statusLabel(s) === "open" ? "closed" : "open")}>
											{statusLabel(s) === "open" ? "Close" : "Reopen"}
										</Button>
										<ConfirmButton label="Delete" danger onConfirm={() => remove(s)} />
									</span>
								</TableCell>
							</TableRow>
						)}
					</For>
				</TableBody>
			</Table>
			<Show when={shares().length === 0}>
				<p class="muted" style={{ "margin-top": "16px" }}>
					No secure shares yet — create a link and send it to a client.
				</p>
			</Show>
		</Layout>
	);
}
