"use server";

import { query } from "@solidjs/router";

// Module-level "use server": every export is a server function. query()
// caches per key, exactly like the old router's query, and the result
// adopts server-rendered data on hydration (3-minute retention window).
export const getGreeting = query(async (name: string) => {
	return { message: `Hello, ${name}! (computed on the server)` };
}, "greeting");
