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

// Scheduler + realtime triggers: moved from the old entry-server. GlobalThis
// guards in startScheduler/ensureRealtimeTriggers make re-evaluation harmless.
import { startScheduler } from "~/lib/scheduler";
import { ensureRealtimeTriggers } from "~/lib/live-server";

startScheduler();
ensureRealtimeTriggers();

export {};
