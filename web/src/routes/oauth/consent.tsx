import { Title } from "@solidjs/meta";
import { createAsync, useAction, useSearchParams } from "@solidjs/router";
import { For, Show, createEffect, createSignal } from "solid-js";
import { Button, Card } from "@basaltac/ui";
import Brand from "~/components/Brand";
import {
	getConsentQuery,
	oauthLoginAction,
	approveConsentAction,
	denyConsentAction,
} from "~/lib/oauth-queries";

/** Human copy for the scopes an app requests; falls back to the raw scope. */
const SCOPE_LABELS: Record<string, string> = {
	openid: "Confirm who you are",
	email: "Your email address",
	profile: "Your profile (name, picture)",
	phone: "Your phone number",
};

/** Hosted login + consent page — the authorization UI for Basalt's OAuth
 *  provider (Supabase OAuth 2.1 server redirects third-party apps here).
 *  Signed out → password form; signed in → "Continue as <email>". */
export default function OAuthConsent() {
	const [searchParams] = useSearchParams();
	const authorizationId = () => String(searchParams.authorization_id ?? "");
	const consent = createAsync(() => getConsentQuery(authorizationId()), { deferStream: true });

	const login = useAction(oauthLoginAction);
	const approve = useAction(approveConsentAction);
	const deny = useAction(denyConsentAction);
	const [error, setError] = createSignal("");
	const [pending, setPending] = createSignal("");

	const invalid = () => {
		const s = consent();
		return s?.status === "invalid" ? s : undefined;
	};
	const grant = () => {
		const s = consent();
		return s?.status === "consent" ? s : undefined;
	};

	// Repeat sign-ins where the user already granted: the server skipped consent
	// and handed us the redirect with the code — just continue it.
	createEffect(() => {
		const s = consent();
		if (s?.status === "continue") window.location.assign(s.redirectUrl);
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		setError("");
		const result = await login(new FormData(e.target as HTMLFormElement));
		if (result?.error) setError(result.error);
	}

	async function decide(kind: "approve" | "deny") {
		if (pending()) return;
		setError("");
		setPending(kind);
		const fd = new FormData();
		fd.set("authorization_id", authorizationId());
		const result = await (kind === "approve" ? approve(fd) : deny(fd));
		setPending("");
		if (result?.error) setError(result.error);
		else if (result?.redirectUrl) window.location.assign(result.redirectUrl);
	}

	return (
		<div class="login-shell">
			<Title>Sign in — Basalt</Title>
			<Card
				style={{
					width: "100%",
					"max-width": "400px",
					padding: "40px",
					margin: "20px",
				}}
			>
				<div class="login-brand">
					<div class="login-brand-name"><Brand /></div>
					<div class="login-brand-sub">Sign in</div>
				</div>

				<Show when={invalid()} keyed>
					{(s) => (
						<>
							<h1 class="login-title">Sign-in request unavailable</h1>
							<p class="muted" style={{ "font-size": "14px", "margin-bottom": "0" }}>
								{s.message}
							</p>
						</>
					)}
				</Show>

				<Show when={consent()?.status === "signed-out"}>
					<form onSubmit={handleSubmit}>
						<div class="form-group">
							<label for="email">Email</label>
							<input
								type="email"
								id="email"
								name="email"
								required
								autocomplete="email"
								placeholder="you@company.com"
								spellcheck={false}
							/>
						</div>
						<div class="form-group">
							<label for="password">Password</label>
							<input
								type="password"
								id="password"
								name="password"
								required
								autocomplete="current-password"
								placeholder="••••••••"
							/>
						</div>
						<Show when={error()}>
							<p class="login-error">{error()}</p>
						</Show>
						<Button type="submit" style={{ width: "100%", "margin-top": "8px" }}>
							Sign in
						</Button>
					</form>
				</Show>

				<Show when={grant()} keyed>
					{(g) => (
						<>
							<h1 class="login-title">Continue to {g.appName}</h1>
							<p class="muted" style={{ "font-size": "14px", margin: 0 }}>
								Signing in as {g.email}. This will let {g.appName} access your Basalt account:
							</p>
							<ul class="login-scopes">
								<For each={g.scopes}>
									{(scope) => <li>{SCOPE_LABELS[scope] ?? scope}</li>}
								</For>
							</ul>
							<Show when={error()}>
								<p class="login-error">{error()}</p>
							</Show>
							<div style={{ display: "flex", gap: "8px", "margin-top": "16px" }}>
								<Button
									style={{ flex: "1" }}
									disabled={pending() === "approve"}
									onClick={() => decide("approve")}
								>
									{pending() === "approve" ? "Signing in…" : "Continue"}
								</Button>
								<Button
									variant="outline"
									disabled={pending() === "deny"}
									onClick={() => decide("deny")}
								>
									Cancel
								</Button>
							</div>
						</>
					)}
				</Show>
			</Card>
		</div>
	);
}
