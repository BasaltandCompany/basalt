// Server-only auth gate for the funnel API routes. Lives apart from
// funnels.ts because that module is reachable from the client graph (the
// registry imports it), and session.ts → @solidjs/start/http is
// server-only — start 2.2.3's boundary check fails the client build on it.
import { checkApiKey } from "~/lib/api-key";
import { getAuthedClient } from "~/lib/session";

export async function funnelAuthed(request: Request) {
	return (await checkApiKey(request)) || (await getAuthedClient()) !== null;
}
