import { Title } from "@solidjs/meta";
import { createAsync, useAction } from "@solidjs/router";
import { For, Show, Suspense } from "solid-js";
import ConfirmButton from "~/components/ConfirmButton";
import Layout from "~/components/Layout";
import { getUserQuery } from "~/lib/queries";
import {
	getGithubInstallationsQuery,
	getGithubIdentitiesQuery,
	unlinkGithubIdentityAction,
} from "~/lib/admin-queries";
import { Button, Card } from "@basaltac/ui";

/** GitHub App admin — what's connected and who's who. Identities come from
 *  the user-authorization flow (callback gated by the Basalt session, i.e.
 *  the same identity pool the OAuth server issues); installations mirror
 *  webhook events. */
export default function AdminGithub() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const installations = createAsync(() => getGithubInstallationsQuery(), { deferStream: true });
	const identities = createAsync(() => getGithubIdentitiesQuery(), { deferStream: true });
	const unlink = useAction(unlinkGithubIdentityAction);

	async function handleUnlink(githubId: number) {
		const fd = new FormData();
		fd.set("github_id", String(githubId));
		return unlink(fd);
	}

	return (
		<Layout user={user()}>
			<Title>GitHub App — Basalt</Title>
			<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "16px", "margin-bottom": "32px" }}>
				<div>
					<h1 class="page-title">GitHub App</h1>
					<p class="page-subtitle" style={{ "margin-bottom": "0" }}>
						PRs link to deliverables by the DEL-N key; installs and identities are
						authenticated with your Basalt account.
					</p>
				</div>
				<a href="/api/github/authorize">
					<Button>Link GitHub account</Button>
				</a>
			</div>

			<div class="section-heading">Installations</div>
			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show when={installations()?.length} fallback={<p class="muted">No installations yet — install the GitHub App on a repo and it shows here.</p>}>
					<div style={{ display: "flex", "flex-direction": "column", gap: "8px", "margin-bottom": "32px" }}>
						<For each={installations()}>
							{(inst) => (
								<Card style={{ padding: "14px 20px", display: "flex", "align-items": "center", gap: "12px" }}>
									<span style={{ "font-weight": "600", "font-size": "14px" }}>{inst.accountLogin || "(account pending)"}</span>
									<span class="mono muted" style={{ "font-size": "12px" }}>installation {inst.installationId}</span>
									<span class="badge">{inst.repoSelection || "installed"}</span>
									<span class="muted" style={{ "font-size": "12px", "margin-left": "auto" }}>
										{new Date(inst.createdAt).toLocaleDateString()}
									</span>
								</Card>
							)}
						</For>
					</div>
				</Show>
			</Suspense>

			<div class="section-heading">Linked identities</div>
			<Suspense fallback={<p class="muted">Loading…</p>}>
				<Show when={identities()?.length} fallback={<p class="muted">No GitHub accounts linked yet — “Link GitHub account” ties one to your Basalt login.</p>}>
					<div style={{ display: "flex", "flex-direction": "column", gap: "8px", "margin-bottom": "32px" }}>
						<For each={identities()}>
							{(identity) => (
								<Card style={{ padding: "14px 20px", display: "flex", "align-items": "center", gap: "12px" }}>
									<span style={{ "font-weight": "600", "font-size": "14px" }}>{identity.login}</span>
									<span class="mono muted" style={{ "font-size": "12px" }}>{identity.githubId}</span>
									<span class="muted" style={{ "font-size": "12px", "margin-left": "auto" }}>
										linked {new Date(identity.linkedAt).toLocaleDateString()}
									</span>
									<ConfirmButton label="Unlink" danger onConfirm={() => handleUnlink(identity.githubId)} />
								</Card>
							)}
						</For>
					</div>
				</Show>
			</Suspense>

			<div class="section-heading">Setup</div>
			<Card style={{ padding: "20px" }}>
				<p class="muted" style={{ "font-size": "13px", "line-height": "1.7" }}>
					GitHub App settings → General:
					<br />
					• Callback URL: <code>{typeof window !== "undefined" ? window.location.origin : ""}/admin/github/link</code>
					<br />
					• Enable “Request user authorization (OAuth) during installation”
					<br />
					• Webhook URL: <code>{typeof window !== "undefined" ? window.location.origin : ""}/api/github/webhook</code> (pull_request + installation events)
					<br />
					Fly secrets: <code>GITHUB_WEBHOOK_SECRET</code>, <code>GITHUB_APP_CLIENT_ID</code>, <code>GITHUB_APP_CLIENT_SECRET</code>
				</p>
			</Card>
		</Layout>
	);
}
