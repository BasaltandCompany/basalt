import { configureServerErrors } from "@solidjs/web";

// Boot-time server wiring (runs once in the handler graph). The error hook
// hears every contained render failure with a real stack — the dev log's
// one-line diagnostics drop it. Replace the console dump with a real
// sink (PostHog captureException) when this becomes the production server.
configureServerErrors({
	onError: (error, context) => {
		console.error(
			`[server-error] kind=${(context as { kind?: string }).kind} handling=${(context as { handling?: string }).handling}`,
			error instanceof Error ? (error.stack ?? error.message) : error,
		);
	},
});

// Scheduler + realtime triggers move here from the old entry-server when
// their modules are ported (phase 3).
export {};
