import { Title } from "@solidjs/meta";
import { createAsync, useAction } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { getUserQuery, loginAction } from "~/lib/queries";
import { Button, Card } from "@basaltac/ui";
import Brand from "~/components/Brand";

export default function Login() {
	const user = createAsync(() => getUserQuery(), { deferStream: true });
	const login = useAction(loginAction);
	const [error, setError] = createSignal("");
	const [loading, setLoading] = createSignal(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		setError("");
		setLoading(true);
		const fd = new FormData(e.target as HTMLFormElement);
		const result = await login(fd);
		setLoading(false);
		if (result?.error) setError(result.error);
	}

	return (
		<Show
			when={user()}
			fallback={
				<div class="login-shell">
					<Title>Login — Basalt</Title>
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
						<h1 class="login-title">Sign in</h1>
						<p class="muted" style={{ "margin-bottom": "24px", "font-size": "14px" }}>
							Sign in to access your dashboard.
						</p>
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
							<Button type="submit"  style={{ width: "100%", "margin-top": "8px" }} disabled={loading()}>
								{loading() ? "Signing in…" : "Sign in"}
							</Button>
						</form>
					</Card>
				</div>
			}
		>
			<script>window.location.href = "/admin"</script>
		</Show>
	);
}
