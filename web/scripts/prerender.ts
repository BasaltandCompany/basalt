// Replaces nitro's prerender of the static marketing pages (migration plan phase 6).
// The generated nodeServer runtime serves static files only on exact hits — no
// directory-index or .html fallback — so this script (1) spawns the built
// artifact on an ephemeral port, saves the marketing pages into dist/client,
// and (2) patches staticFile() in node-runtime.js to resolve <path>/index.html
// and <path>.html so pretty URLs hit the prerendered files.
// Runs as the postbuild script (bun run executes pre/post hooks).
// We spawn instead of importing dist/server/server.js because importing boots
// the scheduler (serverSetup) — side effects we don't want in a build step.
// /scorecard is NOT prerendered: it is a deliberate 302 to /brain (retired
// lead magnet — see src/routes/scorecard.ts); a static file would shadow it.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const dist = path.join(import.meta.dir, "..", "dist");
const PORT = 3199;
const ROUTES: [string, string][] = [
	["/", "index.html"],
	["/case-study", "case-study.html"],
];

const server = spawn("bun", [path.join(dist, "server", "node.js")], {
	env: { ...process.env, PORT: String(PORT) },
	stdio: "ignore",
});
try {
	let up = false;
	for (let i = 0; i < 50 && !up; i++) {
		await new Promise((r) => setTimeout(r, 100));
		up = await fetch(`http://localhost:${PORT}/`)
			.then((r) => r.ok)
			.catch(() => false);
	}
	if (!up) throw new Error("prerender: built server did not start");

	for (const [route, file] of ROUTES) {
		const res = await fetch(`http://localhost:${PORT}${route}`, { redirect: "manual" });
		if (res.status >= 300 && res.status < 400)
			throw new Error(`prerender: ${route} redirects to ${res.headers.get("location")} — remove it from ROUTES`);
		if (!res.ok) throw new Error(`prerender: ${route} -> ${res.status}`);
		const out = path.join(dist, "client", file);
		mkdirSync(path.dirname(out), { recursive: true });
		writeFileSync(out, await res.text());
		console.log(`prerendered ${route} -> dist/client/${file}`);
	}
	// stale artifact from earlier runs would shadow the /scorecard -> /brain redirect
	rmSync(path.join(dist, "client", "scorecard"), { recursive: true, force: true });
} finally {
	server.kill();
}

// Patch the generated staticFile() for pretty URLs (idempotent).
// statSync().isFile(), not existsSync(): bun's path.join(clientRoot, "/")
// keeps the trailing slash, so the directory itself "exists" and sendFile
// would reject it, silently falling back to SSR.
const rt = path.join(dist, "server", "node-runtime.js");
let src = readFileSync(rt, "utf8");
if (!src.includes("statSync(f).isFile()")) {
	const anchor = `return file.startsWith(clientRoot + path.sep) ? file : null;`;
	if (!src.includes(anchor)) throw new Error("prerender: staticFile anchor not found — @solidjs/vite-plugin changed its output");
	src = src.replace(
		anchor,
		`const candidates = [file, file + ".html", path.join(file, "index.html")];\n\treturn candidates.filter((f) => f.startsWith(clientRoot + path.sep)).find((f) => { try { return statSync(f).isFile(); } catch { return false; } }) ?? null;`,
	);
	src = src.replace(
		`import { stat } from "node:fs/promises";`,
		`import { stat } from "node:fs/promises";\nimport { statSync } from "node:fs";`,
	);
	writeFileSync(rt, src);
	console.log("prerender: staticFile patched for pretty URLs");
}
