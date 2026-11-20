import { Title } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createEffect, createMemo, For, Match, Switch } from "solid-js";
import { Logo } from "~/brand/logo";
import { getDocByShareToken } from "~/lib/docs-share";
import { mentionTitles } from "~/lib/mention-render-server";

// ponytail: 20-line markdown→HTML for headings/bold/italic/code/lists/links —
// enough for share previews. If shared docs need full GFM, swap in marked.
function mdToHtml(md: string): string {
	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	const inline = (s: string) =>
		esc(s)
			.replace(/`([^`]+)`/g, "<code>$1</code>")
			.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
			.replace(/\*([^*]+)\*/g, "<em>$1</em>")
			.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
	const out: string[] = [];
	let inList = false;
	for (const line of md.split("\n")) {
		const li = line.match(/^\s*[-*]\s+(.*)/);
		if (li) {
			if (!inList) (out.push("<ul>"), (inList = true));
			out.push(`<li>${inline(li[1])}</li>`);
			continue;
		}
		if (inList) (out.push("</ul>"), (inList = false));
		const h = line.match(/^(#{1,4})\s+(.*)/);
		if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
		else if (line.trim() === "") out.push("");
		else if (line.startsWith("```")) out.push("<pre>");
		else out.push(`<p>${inline(line)}</p>`);
	}
	if (inList) out.push("</ul>");
	return out.join("\n");
}

export default function SharedDoc() {
	const params = useParams();
	const doc = createMemo(async () => {
		const d = await getDocByShareToken(params.token ?? "");
		// shared previews degrade mentions to plain @Title text (this page.s
		// tiny md→html escaper would eat raw anchor HTML)
		return d ? { ...d, markdown: await mentionTitles(d.markdown) } : null;
	});

	// One Title outside the branches: under streaming SSR, branch titles leave
	// the fallback's tag in <head> first and browsers keep the first title.
	// Hydration never re-applies solid-meta's reactive text to the SSR'd
	// element, so drive document.title explicitly once the resource resolves.
	const title = () => (doc() ? `${doc()!.title} — Basalt` : "Not found — Basalt");
	createEffect(() => {
		document.title = title();
	});

	return (
		<div class="flex min-h-screen flex-col bg-background text-foreground">
			<Title>{title()}</Title>
			<header class="flex items-center border-b border-border px-6 py-5">
				<a href="/" aria-label="Basalt & Company home">
					<Logo variant="word" redDot suffix="& Company" class="text-[20px]" />
				</a>
			</header>
			<main class="mx-auto w-full max-w-[720px] flex-1 px-6 py-16">
				<Switch fallback={null}>
					<Match when={!doc()}>
						<p class="text-sm text-muted-foreground">This share link is invalid or was unshared.</p>
					</Match>
					<Match when={doc()}>
						<h1 class="serif-display font-serif text-3xl leading-tight">{doc()!.title}</h1>
						<For each={[mdToHtml(doc()!.markdown)]}>
							{(html) => <div class="mt-8 space-y-4 text-[15px] leading-relaxed" innerHTML={html} />}
						</For>
					</Match>
				</Switch>
			</main>
		</div>
	);
}
