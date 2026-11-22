// Solid 2 start mode: no index.html, no entry files — the plugin generates
// entries around src/App.tsx wrapped in src/Document.tsx. Build emits
// dist/client (assets) + dist/server/server.js (handleRequest).
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import "dotenv/config";
// dev-setup.sh writes local-stack overrides to .env.local, but dotenv/config only
// reads .env — without this the SSR server runs auth against the PROD project.
dotenv.config({ override: true, path: ".env.local" });
import { fileRoutes } from "filesystem-routing/vite";
import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		// fileRoutes BEFORE solid(): the start-mode scan resolves
		// virtual:file-routes while walking src, so the virtual module must
		// already be resolvable when solid's scanner runs.
		tailwindcss(),
		fileRoutes({ httpMethods: true, types: true }),
		solid({
			start: {
				middleware: "./src/middleware.ts",
				serverSetup: "./src/server-setup.ts",
			nodeServer: true,
			},
			ssr: true,
			serverFunctions: true,
			// The fileRoutes plugin emits route modules with query-string ids;
			// this makes the Solid transform accept them.
			extensions: [".jsx", ".tsx"],
			// @solidjs/router and cmdk-solid ship raw .jsx in node_modules;
			// without this they fall through to the classic JSX runtime (jsxDEV),
			// which solid's runtime doesn't export — raw JSX must go through the
			// solid transform in BOTH environments.
			// filter is supported at runtime (options.filter?.include in the plugin) but
			// missing from the published option types.
			// @ts-expect-error runtime-supported option
			filter: {
				include: [
					/\bsrc\//,
					/node_modules\/@solidjs\/router\//,
					/node_modules\/cmdk-solid\//,
				],
			},
		}),
	],
	resolve: {
		alias: {
			// start mode does not carry SolidStart's ~ alias over.
			"~": fileURLToPath(new URL("./src", import.meta.url)),
			"@": fileURLToPath(new URL("./src", import.meta.url)),
			// feedback-widget is solid-1-built; stub until it ships solid 2.
			"@aspectrr/feedback-widget": fileURLToPath(new URL("./src/feedback-widget-stub.ts", import.meta.url)),
		},
	},
	// Dedup: everything EXCEPT the raw-JSX packages goes through the prebundle
	// so rolldown shares one solid-js/signals chunk across kobalte, web, and app
	// code. The raw-JSX packages (router, cmdk) stay out — they need the solid
	// babel transform — and their solid-js imports still resolve to the shared
	// prebundled chunk. Forking the signals instance kills client reactivity
	// silently: SSR renders fine while nothing updates in the browser.
	optimizeDeps: { exclude: ["cmdk-solid", "@aspectrr/feedback-widget", "@solidjs/router"] },
	server: {
		port: 3011,
	},
	build: {
		target: "esnext",
		assetsInlineLimit: 0,
	},
});
