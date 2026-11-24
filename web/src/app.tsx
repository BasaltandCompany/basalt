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
