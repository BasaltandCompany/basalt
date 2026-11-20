import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { useAction } from "@solidjs/router";
import { Show, createSignal, onSettled } from "solid-js";
import {
	getUserQuery,
	adminForgotPasswordAction,
	adminResetPasswordAction,
} from "~/lib/queries";
import { Button, Card } from "@basaltac/ui";
import Brand from "~/components/Brand";

export default function ResetPassword() {
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const forgot = useAction(adminForgotPasswordAction);
	const reset = useAction(adminResetPasswordAction);
	const [token, setToken] = createSignal<{
		accessToken?: string;
		tokenHash?: string;
	} | null>(null);
	const [requested, setRequested] = createSignal(false);
	const [error, setError] = createSignal("");

	// Recovery links land here as an implicit-flow fragment
	// (#access_token=…&type=recovery) or a PKCE query (?token_hash=…) — the
	// token only exists in the browser, so capture it client-side, then strip
	// the URL so a refresh shows the plain request form.
	onSettled(() => {
		if (typeof window === "undefined") return; // onSettled runs on the server too
		const hash = new URLSearchParams(window.location.hash.slice(1));
		const query = new URLSearchParams(window.location.search);
		if (hash.get("type") === "recovery" && hash.get("access_token"))
			setToken({ accessToken: hash.get("access_token")! });
		else if (query.get("type") === "recovery" && query.get("token_hash"))
			setToken({ tokenHash: query.get("token_hash")! });
		else if (hash.get("error") || hash.get("error_description"))
			setError("This reset link is invalid or has expired. Request a new one.");
		history.replaceState(null, "", window.location.pathname);
	});

	async function handleForgot(e: Event) {
		e.preventDefault();
		setError("");
		const fd = new FormData(e.target as HTMLFormElement);
		await forgot(fd);
		setRequested(true);
	}

	async function handleReset(e: Event) {
		e.preventDefault();
		setError("");
		const fd = new FormData(e.target as HTMLFormElement);
		if (fd.get("password") !== fd.get("confirm")) {
			setError("Passwords don't match.");
			return;
		}
		// Success path throws redirect("/admin") server-side; the router follows it.
		const result = await reset(fd);
		if (result?.error) setError(result.error);
	}

	return (
		<div class="login-shell">
			<Title>Reset Password — Basalt</Title>
			<Card style={{
					width: "100%",
					"max-width": "400px",
					padding: "40px",
					"margin": "20px",
				}}>
				<div class="login-brand">
					<div class="login-brand-name"><Brand /></div>
					<div class="login-brand-sub">Portal</div>
				</div>

				<Show when={token()}>
					<h1 class="login-title">Choose a new password</h1>
					<p class="muted" style={{ "margin-bottom": "24px", "font-size": "14px" }}>
						Pick something you don't use anywhere else.
					</p>
					<form onSubmit={handleReset}>
						<input type="hidden" name="access_token" value={token()!.accessToken ?? ""} />
						<input type="hidden" name="token_hash" value={token()!.tokenHash ?? ""} />
						<div class="form-group">
							<label for="new-password">New password</label>
							<input
								type="password"
								id="new-password"
								name="password"
								required
								minlength="6"
								autocomplete="new-password"
								placeholder="At least 6 characters"
							/>
						</div>
						<div class="form-group">
							<label for="confirm-password">Confirm password</label>
							<input
								type="password"
								id="confirm-password"
								name="confirm"
								required
								minlength="6"
								autocomplete="new-password"
								placeholder="••••••••"
							/>
						</div>
						<Show when={error()}>
							<p class="login-error">{error()}</p>
						</Show>
						<Button type="submit" style={{ width: "100%", "margin-top": "8px" }}>
							Set password & sign in
						</Button>
					</form>
				</Show>

				<Show when={!token() && user()}>
					<h1 class="login-title">Change password</h1>
					<p class="muted" style={{ "margin-bottom": "24px", "font-size": "14px" }}>
						You're signed in. Pick a new password for your account.
					</p>
					<form onSubmit={handleReset}>
						<div class="form-group">
							<label for="new-password">New password</label>
							<input
								type="password"
								id="new-password"
								name="password"
								required
								minlength="6"
								autocomplete="new-password"
								placeholder="At least 6 characters"
							/>
						</div>
						<div class="form-group">
							<label for="confirm-password">Confirm password</label>
							<input
								type="password"
								id="confirm-password"
								name="confirm"
								required
								minlength="6"
								autocomplete="new-password"
								placeholder="••••••••"
							/>
						</div>
						<Show when={error()}>
							<p class="login-error">{error()}</p>
						</Show>
						<Button type="submit" style={{ width: "100%", "margin-top": "8px" }}>
							Update password
						</Button>
					</form>
				</Show>

				<Show when={!token() && !user() && requested()}>
					<h1 class="login-title">Check your inbox</h1>
					<p class="muted" style={{ "margin-bottom": "24px", "font-size": "14px" }}>
						If an account exists for that email, a reset link is on its way.
					</p>
					<p class="muted" style={{ "font-size": "13px" }}>
						<a href="/admin/login">Back to sign in</a>
					</p>
				</Show>

				<Show when={!token() && !user() && !requested()}>
					<h1 class="login-title">Reset your password</h1>
					<p class="muted" style={{ "margin-bottom": "24px", "font-size": "14px" }}>
						Enter your email and we'll send you a reset link.
					</p>
					<form onSubmit={handleForgot}>
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
						<Show when={error()}>
							<p class="login-error">{error()}</p>
						</Show>
						<Button type="submit" style={{ width: "100%", "margin-top": "8px" }}>
							Send reset link
						</Button>
					</form>
					<p class="muted" style={{ "text-align": "center", "margin-top": "12px", "font-size": "13px" }}>
						<a href="/admin/login">Back to sign in</a>
					</p>
				</Show>
			</Card>
		</div>
	);
}
