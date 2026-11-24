import { Title } from "@solidjs/meta";
import "./app.css";
import { Errored, Loading } from "solid-js";
import { httpStatus, isServer } from "@solidjs/web";
import { paths, Router } from "./router";

// Stale-bundle recovery: after a deploy the cached page still references old
// chunk hashes, so the first SPA navigation to a route whose chunk isn't in
// memory dies to a dynamic-import failure ("Uncaught Client Exception" in the
// desktop webview). One silent reload picks up the fresh deploy. The 30s
// guard keeps a genuine broken chunk from reload-looping — after it, the
// fallback shows and the next user click may retry the reload.
const CHUNK_FAIL = /dynamically imported module|module script failed|Importing a module/i;
function hardReloadOnce(): boolean {
	if (isServer) return false;
	try {
		const at = Number(sessionStorage.getItem("chunk-reload-at") ?? 0);
		if (Date.now() - at < 30_000) return false;
		sessionStorage.setItem("chunk-reload-at", String(Date.now()));
	} catch {
		return false; // storage blocked — show the fallback instead of looping
	}
	return true;
}

// Deploy watcher: the desktop app is a launch-at-login tray app whose
// webview keeps executing the bundle it booted with — deploys never reached
// a running session, so every crash fix "still" fired for days afterwards.
// The prerendered "/" gets a fresh Last-Modified per deploy (built in-image);
// poll it and one reload picks up the new bundle. Dev SSR has no
// Last-Modified → inert.
const DEPLOY_POLL_MS = 60_000;
if (!isServer) {
	let deployStamp = "";
	const checkDeploy = async () => {
		try {
			const res = await fetch("/", { method: "HEAD", cache: "no-store" });
			const lm = res.headers.get("last-modified") ?? "";
			if (!lm) return; // dev: no static Last-Modified, never baseline
			if (deployStamp && lm !== deployStamp && hardReloadOnce()) location.reload();
			deployStamp = lm;
		} catch {
			// offline/proxy flap — retry next tick
		}
	};
	setInterval(checkDeploy, DEPLOY_POLL_MS);
	checkDeploy();
}


export default function App() {
	return (
		<Errored
			fallback={(error) => {
				console.error(error());
				httpStatus(500);
				const e = error() as Error | null;
				if (!isServer && e instanceof Error && CHUNK_FAIL.test(e.message) && hardReloadOnce()) {
					location.reload();
				}
				return (
					<span style="font-size:1.5em;text-align:center;position:fixed;left:0;bottom:55%;width:100%">
						{isServer ? "500 | Internal Server Error" : "Error | Uncaught Client Exception"}
					</span>
				);
			}}
		>
			<Router>
				{(props) => (
					<>
						<Title>Basalt &amp; Company</Title>
						<Loading fallback={<main>Loading…</main>}>{props.children}</Loading>
					</>
				)}
			</Router>
		</Errored>
	);
}
