import { Title } from "@solidjs/meta";
import { useSearchParams } from "@solidjs/router";
import { createMemo } from "solid-js";
import { Show, Loading } from "solid-js";
import Layout from "~/components/Layout";
import { getUserQuery } from "~/lib/queries";
import {
	getGithubLinkPreviewQuery,
	linkGithubIdentityAction,
	type GithubLinkPreview,
} from "~/lib/admin-queries";
import { Button, Card } from "@basaltac/ui2";

/** GitHub App callback target (registered as the App's callback URL). The
 *  visitor must already carry a Basalt session — authentication happens here,
 *  the GitHub identity comes from the code exchange. Install-initiated
 *  callbacks (no state) stop at a confirm step so a crafted link can't
 *  silently attach someone else's GitHub identity to a signed-in admin. */
export default function GithubLink() {
	const [searchParams] = useSearchParams();
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const preview = createMemo(
		() =>
			getGithubLinkPreviewQuery(
				String(searchParams.code ?? ""),
				String(searchParams.state ?? ""),
				String(searchParams.installation_id ?? ""),
			),
		{ deferStream: true },
	);
	const ready = () => {
		const p = preview();
		return p?.status === "ready" ? p : undefined;
	};
	const link = linkGithubIdentityAction;

	async function handleLink(e: Event) {
		e.preventDefault();
		await link(new FormData(e.currentTarget as HTMLFormElement));
	}

	const failure = () => {
		const p = preview();
		if (p === undefined) return "Loading…";
		switch (p.status) {
			case "invalid-state":
				return "This link expired or wasn't initiated by Basalt. Start again from /admin/github.";
			case "no-code":
				return "No GitHub authorization code in the URL. Start from /admin/github.";
			case "error":
				return `Link failed: ${p.message}`;
			default:
				return "";
		}
	};

	return (
		<Layout user={user()}>
			<Title>Link GitHub account — Basalt</Title>
			<Card style={{ width: "100%", "max-width": "480px", padding: "32px" }}>
				<h1 class="page-title" style={{ "font-size": "20px" }}>Link GitHub account</h1>
				<Loading fallback={<p class="muted">Checking the GitHub authorization…</p>}>
					<Show when={ready()} fallback={<p class="muted" style={{ "font-size": "13px", "margin-top": "12px" }}>{failure()}</p>}>
						{(identity) => (
							<>
								<p style={{ "font-size": "14px", "line-height": "1.6", margin: "12px 0 20px" }}>
									Link GitHub user <strong>{identity().login}</strong> to your Basalt
									account <strong>{user()?.email}</strong>? Future PRs authored by{" "}
									{identity().login} can then be attributed to you.
								</p>
								<form onSubmit={handleLink}>
									<input type="hidden" name="github_id" value={String(identity().githubId)} />
									<input type="hidden" name="login" value={identity().login} />
									<Button type="submit">Link account</Button>
								</form>
							</>
						)}
					</Show>
				</Loading>
			</Card>
		</Layout>
	);
}
