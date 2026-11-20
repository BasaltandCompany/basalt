// /api/contact — the Basalt /contact form target. Deliverable email to Collin
// via the existing Resend setup (alertEmail). CORS for the marketing origin,
// honeypot + rate limit like brain-request. No storage: the inbox IS the store.
import type { APIEvent } from "filesystem-routing/api";
import { alertEmail } from "~/lib/publish";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
	const now = Date.now();
	const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	if (recent.length >= MAX_PER_WINDOW) return true;
	recent.push(now);
	hits.set(ip, recent);
	return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
	});
}

export function OPTIONS() {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}

export const POST = async (event: APIEvent) => {
	const body = (await event.request.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return json({ error: "Invalid request." }, 400);

	// honeypot: real users never see (or fill) the "website" field
	if (String(body.website ?? "").trim() !== "") return json({ ok: true });

	const ip = event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(ip)) return json({ error: "Too many requests — try again later." }, 429);

	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	const name = String(body.name ?? "").trim();
	const email = String(body.email ?? "").trim().toLowerCase();
	const message = String(body.message ?? "").trim();

	if (!name || !message) return json({ error: "Name and message are required." }, 400);
	if (!EMAIL_RE.test(email)) return json({ error: "A valid email is required." }, 400);

	await alertEmail(
		`Contact form: ${name}`,
		`<p><strong>${esc(name)}</strong> (<a href="mailto:${esc(email)}">${esc(email)}</a>) wrote:</p><pre style="white-space:pre-wrap;font-family:inherit;">${esc(message)}</pre>`,
	);

	return json({ ok: true });
};
