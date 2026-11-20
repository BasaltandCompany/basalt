// Post-build tripwire for the "Buffer is not defined" bug class.
//
// SolidStart's client/server boundary is directive-based ("use server"), so a
// single careless export can drag a server-only import chain (db → postgres →
// Buffer.allocUnsafe at module eval) into a client chunk. No compiler or LSP
// catches that; the built artifact is the only ground truth. This scans the
// client bundle for markers that should NEVER ship to the browser and fails
// the build if any appear. Run as part of `bun run build`.
import { Glob } from "bun";

const ASSETS = "dist/client/assets";

// Every marker names a module that must stay server-side. Add more as new
// server-only chains appear — the point is catching the leak, not the culprit.
const MARKERS: Array<[RegExp, string]> = [
	// globalThis.Buffer-qualified refs are feature-detected fallbacks (safe in
	// browsers); a bare Buffer.* is a real server-chain leak
	[/(?<!globalThis\.)Buffer\.[A-Za-z$_]/, "Node Buffer referenced (db/postgres chain or node lib leaked)"],
	[/allocUnsafe/, "postgres.js internals"],
	[/DATABASE_URL is not set/, "src/db/index.ts in client graph"],
	[/pg_is_in_recovery/, "postgres.js type parsers"],
	[/execFile|child_process/, "node child_process in client graph"],
];

const files = [...new Glob("*.js").scanSync({ cwd: ASSETS })];
let failed = false;
for (const file of files) {
	const src = await Bun.file(`${ASSETS}/${file}`).text();
	// seroval (Start's hydration serializer — shipped to browsers by design)
	// feature-detects Buffer in a base64 codec whose else-branch no textual
	// guard heuristic can see. Skip the bare-Buffer marker for chunks that ARE
	// seroval; the other markers (allocUnsafe, DATABASE_URL, pg_is_in_recovery,
	// execFile) still scan every chunk, and those are the signatures an actual
	// db-chain leak carries.
	const isSeroval = src.includes("maxBase64Length");
	for (const [re, why] of MARKERS) {
		if (re.source.includes("Buffer\\.")) {
			if (isSeroval) continue;
			// Bare-Buffer scan with feature-detect awareness: seroval (hydration
			// serializer, always client-side) guards its Buffer use with
			// `typeof Buffer<"u"` — same safety class as globalThis qualification.
			// Anything NOT within 24 chars after a typeof/globalThis guard is a leak.
			const bare = /Buffer\.[A-Za-z$_]/g;
			let m: RegExpExecArray | null;
			let leaked = false;
			while ((m = bare.exec(src))) {
				const before = src.slice(Math.max(0, m.index - 40), m.index);
				if (/typeof Buffer\s*[<>=!]+/.test(before)) continue;
				if (before.includes("globalThis.")) continue;
				leaked = true;
				break;
			}
			if (leaked) {
				console.error(`✗ ${file}: ${why} (matched /${re.source}/)`);
				failed = true;
			}
			continue;
		}
		if (re.test(src)) {
			console.error(`✗ ${file}: ${why} (matched /${re.source}/)`);
			failed = true;
		}
	}
}
if (failed) {
	console.error("\nServer-only code leaked into the client bundle. Find the client module");
	console.error("that imports it (vite build --sourcemap, then read the chunk .map sources)");
	console.error("and move the offending exports to a server-only module.");
	process.exit(1);
}
console.log(`client-bundle check: ${files.length} chunks clean`);
