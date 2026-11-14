import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { ErrorBoundary, Suspense } from "solid-js";
import "./app.css";
import { Button } from "@basaltac/ui";

export default function App() {
	return (
		<Router
			root={(props) => (
				<MetaProvider>
					<Title>Basalt & Company</Title>
					<ErrorBoundary
						fallback={(err, reset) => (
							<div style={{ padding: "48px", "max-width": "640px" }}>
								<h1 style={{ "font-size": "18px", "margin-bottom": "8px" }}>Something broke</h1>
								<pre style={{ "white-space": "pre-wrap", "font-family": "monospace", "font-size": "13px", color: "#a33", "margin-bottom": "16px" }}>
									{err instanceof Error ? (err.stack ?? err.message) : String(err)}
								</pre>
								<Button variant="outline" size="sm" type="button"  onClick={() => reset()}>Retry</Button>{" "}
								<Button variant="outline" size="sm" type="button"  onClick={() => window.location.reload()}>Reload</Button>
							</div>
						)}
					>
						<Suspense>{props.children}</Suspense>
					</ErrorBoundary>
				</MetaProvider>
			)}
		>
			<FileRoutes />
		</Router>
	);
}
