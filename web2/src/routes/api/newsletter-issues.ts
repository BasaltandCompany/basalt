// Public list of published Dispatch issues for the Basalt marketing site.
// CORS * — the marketing domain differs from the dashboard origin.
import type { APIEvent } from "filesystem-routing/api";
import { listPublishedDispatch } from "~/lib/dispatch";

export async function GET(_event: APIEvent) {
	const issues = await listPublishedDispatch();
	return new Response(JSON.stringify({ issues }), {
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		},
	});
}
