import { Title } from "@solidjs/meta";
import { Loading } from "solid-js";
import { paths, Router } from "./router";

export default function App() {
	return (
		<Router>
			{(props) => (
				<>
					<Title>Basalt &amp; Company</Title>
					<Loading fallback={<main>Loading…</main>}>{props.children}</Loading>
				</>
			)}
		</Router>
	);
}
