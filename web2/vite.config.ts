// Vite's SSR module runner doesn't inherit bun's auto-.env loading; this
// populates process.env for dev/preview. Production reads real env vars
// and this line is a no-op when no .env file exists.
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { fileRoutes } from "filesystem-routing/vite";
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

// Solid 2 start mode: no index.html, no entry files — the plugin generates
// entries around src/App.tsx wrapped in src/Document.tsx. Build emits
// dist/client (assets) + dist/server/server.js (handleRequest).
export default defineConfig({
	plugins: [
		solid({
			start: {
				middleware: "./src/middleware.ts",
				serverSetup: "./src/server-setup.ts",
			},
			ssr: true,
			serverFunctions: true,
			// The fileRoutes plugin emits route modules with query-string ids;
			// this makes the Solid transform accept them.
			extensions: [".jsx", ".tsx"],
		}),
		fileRoutes({ httpMethods: true, types: true }),
	],
	resolve: {
		alias: {
			// start mode does not carry SolidStart's ~ alias over.
			"~": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		port: 3011,
	},
	build: {
		target: "esnext",
		assetsInlineLimit: 0,
	},
});
