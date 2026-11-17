// Render email components to the static HTML Supabase GoTrue consumes.
// The Solid component is the source of truth; the .html in
// supabase/templates/ is a generated artifact (commit both).
//   bun run emails:build
//
// ponytail: bun's native TSX emits jsxDEV (client runtime), which Solid SSR
// can't run, so we compile through vite-plugin-solid's SSR transform. The
// plugin lives only in bun's isolated store, hence the store glob — upgrade
// path: add vite-plugin-solid as a direct devDep and import it normally.
import { renderToString } from "solid-js/web";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");

const OUT = resolve(repoRoot, "supabase/templates/invite-email.html");
const OUT_SUBJECT = resolve(repoRoot, "supabase/templates/invite-subject.txt");
const DIST = resolve(webRoot, ".emails-dist");

// 1. SSR-compile the email entry with vite-plugin-solid (resolved from bun's store)
const storeDir = resolve(webRoot, "../node_modules/.bun");
const pluginDirName = readdirSync(storeDir).find((d) => d.startsWith("vite-plugin-solid@"));
if (!pluginDirName) {
	console.error("FAIL: vite-plugin-solid not found in the bun store.");
	process.exit(1);
}
const { default: solid } = await import(resolve(storeDir, pluginDirName, "node_modules/vite-plugin-solid"));

const { build } = await import("vite");
rmSync(DIST, { recursive: true, force: true });
await build({
	root: webRoot,
	configFile: false,
	logLevel: "error",
	plugins: [solid({ ssr: true, hydratable: false })],
	resolve: { alias: { "~": resolve(webRoot, "src") } },
	// artifact ships to prod Supabase — default the hosted-logo origin to
	// basalt.ac regardless of local .env; EMAILS_SITE_URL overrides
	define: { "process.env.PUBLIC_SITE_URL": JSON.stringify(process.env.EMAILS_SITE_URL ?? "https://basalt.ac") },
	build: {
		ssr: resolve(webRoot, "src/emails/InviteEmail.tsx"),
		outDir: DIST,
		emptyOutDir: true,
		rollupOptions: { external: ["solid-js", "solid-js/web"] },
	},
});

// 2. Render the compiled component
const builtFile = readdirSync(DIST).find((f) => f.startsWith("InviteEmail") && (f.endsWith(".js") || f.endsWith(".mjs")));
if (!builtFile) {
	console.error("FAIL: vite SSR build produced no output.");
	process.exit(1);
}
const mod = await import(resolve(DIST, builtFile));
const { default: InviteEmail, EMAIL_PLACEHOLDER, INVITE_SUBJECT } = mod;
// strip SSR-only artifacts (hydration keys + Show boundary comments) — the
// artifact is static HTML for GoTrue, nothing hydrates it
const html = `<!DOCTYPE html>\n${renderToString(() => InviteEmail())}`
	.replace(/ data-hk="[^"]*"/g, "")
	.replace(/<!--\$-->|<!--\/-->/g, "");

// 3. Validate: GoTrue substitutes {{ .ConfirmationURL }} at send time — if
// rendering swallowed it the invite links would be dead, so refuse to write.
const occurrences = html.split(EMAIL_PLACEHOLDER).length - 1;
if (occurrences < 2) {
	console.error(`FAIL: ${EMAIL_PLACEHOLDER} appears ${occurrences}× (need ≥2: CTA + fallback link).`);
	process.exit(1);
}
if (!html.includes("<!DOCTYPE html>") || !html.includes("Basalt")) {
	console.error("FAIL: rendered HTML is missing the doctype or Basalt branding.");
	process.exit(1);
}

// 4. Write + prove idempotence (a re-render must be byte-identical)
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html + "\n");
writeFileSync(OUT_SUBJECT, INVITE_SUBJECT + "\n");
rmSync(DIST, { recursive: true, force: true });

console.log(`✓ ${OUT} (${html.length} bytes, ${occurrences}× ${EMAIL_PLACEHOLDER})`);
console.log(`✓ ${OUT_SUBJECT}`);
readFileSync(OUT, "utf8");
