import type { APIEvent } from "filesystem-routing/api";
import { redirect } from "@solidjs/web";
import { getAuthedClient } from "~/lib/session";
import { makeGithubAuthState } from "~/lib/github-prs";

// Kicks off the "Link GitHub account" flow: admin-only → GitHub authorize
// URL with an HMAC state. GitHub redirects back to /admin/github/link
// (this URL must match the App's registered callback URL).
export const GET = async (event: APIEvent) => {
	if (!(await getAuthedClient())) redirect("/admin/login");
	const clientId = process.env.GITHUB_APP_CLIENT_ID;
	const secret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!clientId || !secret) {
		return new Response(JSON.stringify({ error: "GITHUB_APP_CLIENT_ID / GITHUB_WEBHOOK_SECRET not set" }), {
			status: 503,
			headers: { "Content-Type": "application/json" },
		});
	}
	const origin = new URL(event.request.url).origin;
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: `${origin}/admin/github/link`,
		state: makeGithubAuthState(secret),
	});
	redirect(`https://github.com/login/oauth/authorize?${params}`);
};
