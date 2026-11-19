import { createMemo, createSignal } from "solid-js";
import { getGreeting } from "../lib/hello";

export default function Home() {
	// Solid 2: async read = async memo. First read suspends into <Loading>
	// (App.tsx); the SSR stream resolves it before the shell flushes.
	const greeting = createMemo(() => getGreeting("Basalt"));
	const [count, setCount] = createSignal(0);

	return (
		<main style={{ padding: "48px", "font-family": "system-ui, sans-serif" }}>
			<h1>Solid 2 target — basalt-web2</h1>
			<p>{greeting()?.message ?? "loading…"}</p>
			<button type="button" onClick={() => setCount(count() + 1)}>
				Clicks: {count()}
			</button>
		</main>
	);
}
