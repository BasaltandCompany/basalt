// Replaces nitro's prerender of the static marketing pages (migration plan phase 6).
// Writes the marketing pages into dist/client; scripts/bun-server.ts serves
// them with pretty-URL resolution (index.html / <path>.html).
// Runs as the postbuild script (bun run executes pre/post hooks).
// We spawn instead of importing dist/server/server.js because importing boots
// the scheduler (serverSetup) — side effects we don't want in a build step.
// /scorecard is NOT prerendered: it is a deliberate 302 to /brain (retired
// lead magnet — see src/routes/scorecard.ts); a static file would shadow it.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const dist = path.join(import.meta.dir, "..", "dist");
const PORT = 3199;
const ROUTES: [string, string][] = [
	["/", "index.html"],
	["/case-study", "case-study.html"],
];

const server = spawn("bun", [path.join(dist, "server", "node.js")], {
	// CI has no .env file (bun only auto-loads one locally), so the spawned
	// server needs a DATABASE_URL even though the prerendered routes never
	// query it. Prod builds pass the real one through.
	env: {
		...process.env,
		PORT: String(PORT),
		DATABASE_URL: process.env.DATABASE_URL ?? "postgres://dummy@localhost:5/dummy",
	},
	// inherit stderr: a crashed prerender server must show why (CI once
	// failed here with the cause swallowed)
	stdio: ["ignore", "inherit", "inherit"],
});
try {
	let up = false;
	for (let i = 0; i < 150 && !up; i++) {
		await new Promise((r) => setTimeout(r, 200));
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

