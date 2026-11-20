import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createMemo } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import PortalLayout from "~/components/PortalLayout";
import { getClientQuoteQuery, getClientUserQuery, signQuoteAction } from "~/lib/client-queries";
import { Button, Card } from "@basaltac/ui2";

export default function PortalQuoteDetail() {
	const params = useParams();
	const user = createMemo(() => getClientUserQuery(), { deferStream: true });
	const quote = createMemo(() => getClientQuoteQuery(params.id ?? ""), { deferStream: true });
	const sign = signQuoteAction;
	const [busy, setBusy] = createSignal(false);
	const [error, setError] = createSignal("");

	async function handleSign(e: SubmitEvent) {
		e.preventDefault();
		setError("");
		setBusy(true);
		const res = (await sign(new FormData(e.currentTarget as HTMLFormElement))) as { error?: string; success?: string };
		setBusy(false);
		if (res?.error) setError(res.error);
	}

	return (
		<PortalLayout user={user()}>
			<Title>Quote — Basalt Client Portal</Title>
			<Show when={quote()} fallback={<p class="muted">Loading…</p>}>
				{(q) => (
					<div style={{ "max-width": "820px", margin: "0 auto" }}>
						<div style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "12px", "margin-bottom": "24px" }}>
							<h1 class="page-title" style={{ margin: 0 }}>{q().title}</h1>
							{/* download attr: solid router would otherwise intercept the click and client-side-navigate to the API URL — no download (see admin/quotes/[id]) */}
							<Button as="a" variant="outline" size="sm" href={`/api/quotes/${q().id}/pdf`} download="">PDF</Button>
						</div>

						<Show when={q().status === "sent"}>
							<Card style={{ padding: "20px", "margin-bottom": "24px", border: "2px solid var(--color-accent, #0a0a0a)" }}>
								<h2 style={{ margin: "0 0 8px", "font-size": "18px" }}>Review & sign</h2>
								<p class="muted" style={{ "margin-top": 0 }}>
									Signing below accepts this quote as written. Typing your full legal name is your electronic signature
									(recorded with your account, the date, and the time).
								</p>
								<form onSubmit={handleSign} style={{ display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap" }}>
									<input type="hidden" name="quote_id" value={q().id} />
									<input
										name="signer_name"
										placeholder={`Full legal name (e.g. ${q().memberName})`}
										required
										minLength={3}
										style={{ flex: "1", "min-width": "220px" }}
									/>
									<Button type="submit" disabled={busy()}>{busy() ? "Signing…" : "Sign to accept"}</Button>
								</form>
								<Show when={error()}>
									<p style={{ color: "#c0392b", "font-size": "13px", "margin-bottom": 0 }}>{error()}</p>
								</Show>
							</Card>
						</Show>

						<Show when={q().status === "accepted" && q().signatures.length > 0}>
							<Card style={{ padding: "16px", "margin-bottom": "24px" }}>
								✍ <b>Signed{q().signatures[0].signerName ? `: ${q().signatures[0].signerName}` : ""}</b>{" "}
								<span class="muted">{q().signatures[0].createdAt.toLocaleString()}</span> — this quote is accepted and serves as the agreement.
							</Card>
						</Show>

						<Show when={q().composedHtml} fallback={<p class="muted">This quote has no body yet.</p>}>
							<style>{`
								.quote-prose { font-family: Georgia, 'Times New Roman', serif; line-height: 1.6; }
								.quote-prose h1, .quote-prose h2 { margin-top: 28px; }
								.quote-prose table { border-collapse: collapse; width: 100%; margin: 12px 0; }
								.quote-prose th, .quote-prose td { border: 1px solid #d8d8d8; padding: 6px 10px; font-size: 14px; text-align: left; vertical-align: top; }
								.quote-prose th { background: #f5f5f5; }
							`}</style>
							<div class="quote-prose" innerHTML={q().composedHtml} />
						</Show>

						<Show when={q().versions.length > 1}>
							<Card style={{ padding: "16px", "margin-top": "32px" }}>
								<h2 style={{ margin: "0 0 8px", "font-size": "16px" }}>History</h2>
									<For each={q().versions}>
									{(v) => (
										<div style={{ "font-size": "13px" }}>
											v{v.version} · {v.status} · ${Math.round(v.subtotal).toLocaleString("en-US")} · {v.createdAt.toLocaleString()}
										</div>
									)}
								</For>
							</Card>
						</Show>
					</div>
				)}
			</Show>
		</PortalLayout>
	);
}
