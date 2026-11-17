import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createResource, createSignal, Show, type JSX } from "solid-js";
import { getOpenDropMeta } from "~/lib/drop-share";

// Public guest upload page for secure shares. Matches the share/[token]
// aesthetic: plain, centered, serif. Upload-only — nothing here reads a drop.
const page = { "max-width": "640px", margin: "64px auto", padding: "0 24px", "font-family": "Georgia, 'Times New Roman', serif" };
const field: JSX.CSSProperties = { display: "block", width: "100%", padding: "10px", margin: "8px 0 16px", border: "1px solid #ccc", "font-family": "inherit", "font-size": "15px", "box-sizing": "border-box" };
const btn: JSX.CSSProperties = { padding: "10px 22px", border: "1px solid #000", background: "#0a0a0a", color: "#fff", "font-family": "inherit", "font-size": "15px", cursor: "pointer" };

export default function DropPage() {
	const params = useParams();
	const [meta] = createResource(async () => getOpenDropMeta(params.token ?? ""));
	const [result, setResult] = createSignal<{ ok?: boolean; error?: string } | null>(null);
	const [busy, setBusy] = createSignal(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (busy()) return;
		const form = e.currentTarget as HTMLFormElement;
		setBusy(true);
		setResult(null);
		try {
			const r = await fetch(`/api/drop/${encodeURIComponent(params.token ?? "")}`, {
				method: "POST",
				body: new FormData(form),
			});
			const body = (await r.json().catch(() => ({}))) as { error?: string };
			if (!r.ok) setResult({ error: body.error ?? "Upload failed — please try again." });
			else {
				setResult({ ok: true });
				form.reset();
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<main style={page}>
			<Show
				when={meta()}
				fallback={
					<>
						<Title>Not found — Basalt</Title>
						<p>This link is no longer accepting uploads.</p>
					</>
				}
			>
				{(m) => (
					<>
						<Title>{m().title} — Secure upload</Title>
						<h1 style={{ "font-size": "26px", "margin-bottom": "4px" }}>{m().title}</h1>
						<p style={{ color: "#555", "font-size": "14px" }}>
							Everything you upload here is encrypted before it is stored — only the consulting team can view it.
						</p>
						<Show when={m().note}>
							<p style={{ "border-left": "3px solid #bc9c5c", "padding-left": "12px", color: "#333" }}>{m().note}</p>
						</Show>
						<Show
							when={!result()?.ok}
							fallback={
								<p style={{ border: "1px solid #2d6a2d", color: "#2d6a2d", padding: "14px" }}>
									Thanks — your upload was encrypted and stored securely.
								</p>
							}
						>
							<form onSubmit={submit}>
								<label for="name" style={{ "font-size": "14px" }}>
									Your name (optional)
								</label>
								<input id="name" name="name" style={field} placeholder="e.g. Sam at Acme" />
								<label for="text" style={{ "font-size": "14px" }}>
									Paste text (.env, API keys, notes)
								</label>
								<textarea id="text" name="text" rows={7} style={field} placeholder="SECRET_KEY=…" />
								<label for="files" style={{ "font-size": "14px" }}>
									Or attach files (10 MB each)
								</label>
								<input id="files" name="files" type="file" multiple style={{ ...field, border: "none", padding: "0" }} />
								<Show when={result()?.error}>
									<p style={{ color: "#a02020", "font-size": "14px" }}>{result()?.error}</p>
								</Show>
								<button type="submit" disabled={busy()} style={{ ...btn, opacity: busy() ? 0.6 : 1 }}>
									{busy() ? "Encrypting…" : "Upload securely"}
								</button>
							</form>
						</Show>
					</>
				)}
			</Show>
		</main>
	);
}
