import { defineConfig } from "@playwright/test";

// E2E for the client portal: real invite email → real browser flow against
// the local Supabase stack. Prereqs: `supabase start` + Mailpit (:54324) up.
export default defineConfig({
	testDir: "./e2e",
	globalSetup: "./e2e/global-setup.ts",
	fullyParallel: false,
	workers: 1,
	use: {
		baseURL: "http://localhost:3011",
	},
	webServer: {
		command: "bun run dev",
		url: "http://localhost:3011",
		reuseExistingServer: true,
		timeout: 60_000,
	},
});
