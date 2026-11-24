/** Visibility heartbeat (ASPTR-227): while this component is mounted on a
 * project-scoped admin page, it pings /api/activity/heartbeats every 30s —
 * only while the tab is visible. A hidden tab, sleeping machine, or locked
 * screen stops the pings and the server-side block dies at the last one,
 * so an abandoned dashboard tab accrues nothing. Renders nothing. */
import { createEffect, onCleanup } from "solid-js";

const PING_MS = 30_000;

export default function ActivityHeartbeat(props: { projectId: string }) {
	// two-arg form: compute a constant, run setup once on the client
	createEffect(
		() => props.projectId,
		() => {
			const send = () => {
				if (document.visibilityState !== "visible") return;
				// fire-and-forget: a dropped ping just shortens the block by 30s
				void fetch("/api/activity/heartbeats", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId: props.projectId }),
				}).catch(() => {});
			};
			send();
			const id = setInterval(send, PING_MS);
			const onVisible = () => document.visibilityState === "visible" && send();
			document.addEventListener("visibilitychange", onVisible);
			onCleanup(() => {
				clearInterval(id);
				document.removeEventListener("visibilitychange", onVisible);
			});
		},
	);
	return null;
}
