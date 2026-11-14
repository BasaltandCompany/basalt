import { Title } from "@solidjs/meta";
import { createAsync, useAction } from "@solidjs/router";
import { For, Show, Suspense, createSignal } from "solid-js";
import CreateDialog, { type CreateResult } from "~/components/CreateDialog";
import ConfirmButton from "~/components/ConfirmButton";
import Layout from "~/components/Layout";
import { getUserQuery } from "~/lib/queries";
import {
	getOAuthAppsQuery,
	createOAuthAppAction,
	deleteOAuthAppAction,
} from "~/lib/oauth-queries";
import { Button, Card } from "@basaltac/ui";

type AppCreatedResult = { clientId?: string; clientSecret?: string | null; error?: string };

/** Apps that sign users in with the Basalt account pool via Supabase's OAuth
 *  2.1 server (authorization code + PKCE). The hosted consent page lives at
 *  /oauth/consent; source of truth is Supabase Auth, not our Postgres. */
export default function AdminOAuth() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const apps = createAsync(() => getOAuthAppsQuery(), { deferStream: true });
	const createApp = useAction(createOAuthAppAction);
	const deleteApp = useAction(deleteOAuthAppAction);

	async function handleDelete(clientId: string) {
		const fd = new FormData();
		fd.set("client_id", clientId);
		return deleteApp(fd);
	}

	return (
		<Layout user={user()}>
			<Title>OAuth Apps — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "16px", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">OAuth Apps</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
						Apps that sign users in with the Basalt account pool (OAuth 2.1 + PKCE). Users
						land on <code>/oauth/consent</code>. Integration guide: <code>docs/oauth-provider.md</code>
					</p>
				</div>
				<CreateDialog
					label="Add App"
					title="Register OAuth app"
					submitLabel="Create App"
					onSubmit={(fd) => createApp(fd) as Promise<AppCreatedResult>}
					renderSuccess={(res) => <AppCreated result={res} />}
				>
					<div class="form-group">
						<label for="name">App name</label>
						<input type="text" id="name" name="name" placeholder="e.g. bcw-ada-scanner" />
					</div>
					<div class="form-group">
						<label for="redirect_uris">Redirect URIs (one per line, exact match)</label>
						<textarea
							id="redirect_uris"
							name="redirect_uris"
							rows="3"
							placeholder={"https://scanner.example.com/auth/callback"}
						/>
					</div>
					<div class="form-group">
						<label for="auth_method">Token endpoint auth</label>
						<select id="auth_method" name="auth_method">
							<option value="none">Public — PKCE, no secret</option>
							<option value="client_secret_post">Confidential — secret in body</option>
							<option value="client_secret_basic">Confidential — basic auth header</option>
						</select>
					</div>
				</CreateDialog>
			</div>

			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show
					when={apps()?.length}
					fallback={<p class="muted">No OAuth apps registered yet.</p>}
				>
					<div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
						<For each={apps()}>
							{(app) => (
								<Card style={{ padding: "14px 20px", display: "flex", "align-items": "center", gap: "12px" }}>
									<div style={{ flex: "1" }}>
										<span style={{ "font-weight": "600", "font-size": "14px" }}>{app.name}</span>
										<span class="mono muted" style={{ "font-size": "12px", "margin-left": "8px" }}>
											{app.clientId}
										</span>
										<div class="muted" style={{ "font-size": "12px", "margin-top": "2px" }}>
											{app.redirectUris.join(", ")}
										</div>
									</div>
									<span class="badge">
										{app.authMethod === "none" ? "public" : "confidential"}
									</span>
									<span class="muted" style={{ "font-size": "12px" }}>
										created {new Date(app.createdAt).toLocaleDateString()}
									</span>
									<ConfirmButton label="Delete" danger onConfirm={() => handleDelete(app.clientId)} />
								</Card>
							)}
						</For>
					</div>
				</Show>
			</Suspense>
		</Layout>
	);
}

/** One-time credentials panel — the dialog stays open until this is dismissed.
 *  The secret is only ever returned at creation. */
function AppCreated(props: { result: NonNullable<CreateResult> }) {
	const [copied, setCopied] = createSignal<"id" | "secret" | "">("");
	const clientId = () => String(props.result.clientId ?? "");
	const clientSecret = () => String(props.result.clientSecret ?? "");

	function CopyButton(props: { value: string; kind: "id" | "secret" }) {
		return (
			<Button
				variant="outline"
				size="sm"
				type="button"
				onClick={() => {
					navigator.clipboard.writeText(props.value);
					setCopied(props.kind);
					setTimeout(() => setCopied(""), 2000);
				}}
			>
				{copied() === props.kind ? "Copied" : "Copy"}
			</Button>
		);
	}

	return (
		<div style={{ "border-top": "1px solid #16a34a", "border-bottom": "1px solid #16a34a", padding: "12px 0" }}>
			<div style={{ "font-weight": "600", "margin-bottom": "6px" }}>App created.</div>
			<div style={{ display: "flex", gap: "8px", "align-items": "center", "margin-bottom": "8px" }}>
				<code class="mono" style={{ "font-size": "13px", "word-break": "break-all", flex: "1" }}>
					{clientId()}
				</code>
				<CopyButton value={clientId()} kind="id" />
			</div>
			<Show when={clientSecret()}>
				<div style={{ display: "flex", gap: "8px", "align-items": "center" }}>
					<code class="mono" style={{ "font-size": "13px", "word-break": "break-all", flex: "1" }}>
						{clientSecret()}
					</code>
					<CopyButton value={clientSecret()} kind="secret" />
				</div>
				<p class="muted" style={{ "font-size": "12px", "margin": "8px 0 0" }}>
					Copy the secret now — it is not shown again.
				</p>
			</Show>
		</div>
	);
}
