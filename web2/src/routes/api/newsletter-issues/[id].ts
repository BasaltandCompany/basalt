// Public single-issue render for the Basalt marketing site — the exact
// published render the dashboard's /newsletter/[id] serves as HTML.
import type { APIEvent } from "filesystem-routing/api";
import { getPublishedDispatch } from "~/lib/dispatch";
import { newsletterSubject, renderIssueBody } from "~/lib/publish-core";
import { renderMentionsInMarkdown } from "~/lib/mention-render-server";
import { UUID_RE } from "~/lib/uuid";

export async function GET(event: APIEvent) {
	const id = event.params!.id ?? "";
	if (!UUID_RE.test(id)) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
		});
	}

	const i = await getPublishedDispatch(id);
	if (!i) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
		});
	}

	const md = i.webMarkdown ?? i.markdown;
	const html = renderIssueBody(await renderMentionsInMarkdown(md), i.webAppendix, "web");
	return new Response(
		JSON.stringify({
			id: i.id,
			issueNumber: i.issueNumber,
			publishedAt: i.publishedAt,
			title: i.title,
			subject: newsletterSubject({ markdown: md, title: i.title }),
			html,
		}),
		{ headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
	);
}
