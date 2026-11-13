// The brain-test lead magnet is retired — /gift (3 months of Claude, free)
// is the one funnel. Old bookmarks and links 302 here, no lost traffic.
import type { APIEvent } from "@solidjs/start/server";

export const GET = async (_event: APIEvent) => {
	return new Response(null, { status: 302, headers: { Location: "/gift" } });
};
