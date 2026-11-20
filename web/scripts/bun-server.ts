// Bun-native production server — replaces the generated node-runtime shim
// (start.nodeServer) so the whole process is bun end to end, no node:http
// compat layer. Serves static files from dist/client (precompressed .gz/.br,
// pretty-URL /index.html and <path>.html resolution) and falls back to the
// SSR handleRequest, which streams and supports multiple Set-Cookie headers.
// Importing dist/server/server.js also boots serverSetup (scheduler) once.
import path from "node:path";
import { statSync } from "node:fs";

const { handleRequest } = await import("../dist/server/server.js");

const clientRoot = path.resolve(import.meta.dir, "..", "dist", "client");
const assetsRoot = path.join(clientRoot, "assets") + path.sep;


const MIME: Record<string, string> = {
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".map": "application/json; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".xml": "application/xml",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
	".txt": "text/plain; charset=utf-8",
	".wasm": "application/wasm",
	".webm": "video/webm",
	".mp4": "video/mp4",
};

/** Resolve a URL path to a file under clientRoot, pretty URLs included. */
function resolveStatic(pathname: string): string | null {
	let decoded: string;
	try {
		decoded = decodeURIComponent(pathname);
	} catch {
		return null;
	}
	if (decoded.split("/").some((s) => s.startsWith("."))) return null;
	const base = path.join(clientRoot, decoded);
	for (const f of [base, base + ".html", path.join(base, "index.html")]) {
		if (!f.startsWith(clientRoot + path.sep)) continue; // blocks clientRoot itself (the "/" join) and traversal
		try {
			if (statSync(f).isFile()) return f;
		} catch {}
	}
	return null;
}

function serveStatic(req: Request, file: string): Response {
	const ext = path.extname(file).toLowerCase();
	const headers = new Headers({ "Content-Type": MIME[ext] ?? "application/octet-stream" });
	if (file.startsWith(assetsRoot)) {
		headers.set("Cache-Control", "public, max-age=31536000, immutable");
	} else {
		headers.set("Cache-Control", "public, max-age=0, must-revalidate");
		headers.set("Last-Modified", statSync(file).mtime.toUTCString());
	}
	// serve precompressed variants when the client accepts them
	const enc = req.headers.get("accept-encoding") ?? "";
	let body = Bun.file(file);
	if (/\bbr\b/.test(enc) && isFile(file + ".br")) {
		body = Bun.file(file + ".br");
		headers.set("Content-Encoding", "br");
		headers.set("Vary", "Accept-Encoding");
	} else if (/\bgzip\b/.test(enc) && isFile(file + ".gz")) {
		body = Bun.file(file + ".gz");
		headers.set("Content-Encoding", "gzip");
		headers.set("Vary", "Accept-Encoding");
	}
	if (req.method === "HEAD") {
		headers.set("Content-Length", String(body.size));
		return new Response(null, { headers });
	}
	return new Response(body, { headers });
}

function isFile(p: string): boolean {
	try {
		return statSync(p).isFile();
	} catch {
		return false;
	}
}

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";

const server = Bun.serve({
	port,
	hostname,
	async fetch(req) {
		const url = new URL(req.url);
		if (req.method === "GET" || req.method === "HEAD") {
			const file = resolveStatic(url.pathname);
			if (file) return serveStatic(req, file);
		}
		try {
			return await handleRequest(req);
		} catch (error) {
			console.error(error);
			return new Response("Internal Server Error", {
				status: 500,
				headers: { "content-type": "text/plain; charset=utf-8" },
			});
		}
	},
});

console.log(`Listening on http://${server.hostname}:${server.port}`);
