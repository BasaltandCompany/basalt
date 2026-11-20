import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@basaltac/ui";
import { Logo } from "~/brand/logo";
import { getOpenDropMeta } from "~/lib/drop-share";

// Public guest upload page for secure shares. Ink system: black canvas, logo
// top-left, hairline fields. Upload-only — nothing here reads a drop.
const field =
	"w-full border border-border bg-card px-3 py-2.5 font-sans text-[15px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring";
const label = "block font-sans text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground";

export default function DropPage() {
	const params = useParams();
	const meta = createMemo(async () => getOpenDropMeta(params.token ?? ""));
	const [files, setFiles] = createSignal<File[]>([]);
	const [result, setResult] = createSignal<{ ok?: boolean; error?: string } | null>(null);
	const [busy, setBusy] = createSignal(false);

	// One Title outside the branches so SSR emits a single <title>; hydration
	// never re-applies solid-meta's reactive text to the SSR'd element, so drive
	// document.title explicitly once the resource resolves.
	const title = () =>
		meta() ? `${meta()!.title} — Secure upload` : "Not found — Basalt";
	// Solid 2: compute tracks, effect writes.
	createEffect(
		() => title(),
		(t) => {
			document.title = t;
		},
	);

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
				setFiles([]);
				form.reset();
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<div class="flex min-h-screen flex-col bg-background text-foreground">
			<Title>{title()}</Title>
			<header class="flex items-center border-b border-border px-6 py-5">
				<a href="/" aria-label="Basalt & Company home">
					<Logo variant="word" redDot suffix="& Company" class="text-[20px]" />
				</a>
			</header>
			<main class="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 py-16">
				<Show
					when={meta()}
					fallback={
						<div>
							<h1 class="serif-display font-serif text-2xl leading-tight">Link closed</h1>
							<p class="mt-2 text-sm text-muted-foreground">This link is no longer accepting uploads.</p>
						</div>
					}
				>
					{(m) => (
						<Show
							when={!result()?.ok}
							fallback={
								<div class="border border-border bg-card p-6">
									<p class="serif-display font-serif text-lg">✓ Upload received</p>
									<p class="mt-1 text-sm text-muted-foreground">
										Your upload was encrypted and stored securely.
									</p>
								</div>
							}
						>
							<h1 class="serif-display font-serif text-[28px] leading-tight">{m().title}</h1>
							<p class="mt-2 text-sm text-muted-foreground">
								Everything you upload here is encrypted before it is stored — only the consulting team
								can view it.
							</p>
							<Show when={m().note}>
								<p class="mt-4 border-l-2 border-l-[#bc9c5c] pl-3 text-sm text-muted-foreground">
									{m().note}
								</p>
							</Show>
							<form onSubmit={submit} class="mt-10">
								<label for="name" class={label}>
									Your name (optional)
								</label>
								<input id="name" name="name" class={`${field} mt-2`} placeholder="e.g. Sam at Acme" />
								<label for="text" class={`${label} mt-6`}>
									Paste text (.env, API keys, notes)
								</label>
								<textarea
									id="text"
									name="text"
									rows={7}
									class={`${field} mt-2 font-mono text-sm`}
									placeholder="SECRET_KEY=…"
								/>
								<label for="files" class={`${label} mt-6`}>
									Or attach files (10 MB each)
								</label>
								<label
									for="files"
									class="mt-2 block cursor-pointer border border-dashed border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground hover:border-foreground/30"
								>
									<input
										id="files"
										name="files"
										type="file"
										multiple
										class="sr-only"
										onChange={(e) => setFiles([...(e.currentTarget.files ?? [])])}
									/>
									Choose files
								</label>
								<Show when={files().length}>
									<ul class="mt-2 space-y-0.5 text-xs text-muted-foreground">
										<For each={files()}>
											{(f) => <li>{f.name} · {Math.ceil(f.size / 1024)} KB</li>}
										</For>
									</ul>
								</Show>
								<Show when={result()?.error}>
									<p class="mt-3 text-sm text-destructive">{result()?.error}</p>
								</Show>
								<Button type="submit" disabled={busy()} class="mt-8 min-w-40">
									{busy() ? "Encrypting…" : "Upload securely"}
								</Button>
							</form>
						</Show>
					)}
				</Show>
			</main>
		</div>
	);
}
