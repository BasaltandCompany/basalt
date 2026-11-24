// /api/gift-request — validates and stores 12-week pilot applications.
// Older requests retain their original Claude entitlement; never overwrite them.
import type { APIEvent } from "filesystem-routing/api";
import { db } from "~/db";
import { brainRequests } from "~/db/schema";
import { alertEmail } from "~/lib/publish";
import { UUID_RE } from "~/lib/uuid";

// in-memory per-IP limit: 5 submissions per hour — single process, fine for
// the volume this funnel sees. Restart clears it; spam is the failure mode,
// not the lost request.
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
		headers: {
			"Content-Type": "application/json",
			// the Basalt marketing site (different origin) posts here
			"Access-Control-Allow-Origin": "*",
		},
	});
}

// CORS preflight for the Basalt marketing site's POSTs.
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
	if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request." }, 400);

	// honeypot: real users never see (or fill) the "website" field
	if (String(body.website ?? "").trim() !== "") return json({ ok: true });

	const ip = event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
	if (rateLimited(ip)) return json({ error: "Too many requests — try again later." }, 429);

	const str = (k: string) => String(body[k] ?? "").trim();
	const contactName = str("name");
	const contactEmail = str("email").toLowerCase();
	const company = str("company");

	if (!contactName || !company) return json({ error: "Name and company are required." }, 400);
	if (!EMAIL_RE.test(contactEmail)) return json({ error: "A valid work email is required." }, 400);
	const about = str("about");
	const workflow = str("workflow");
	const industry = str("industry");
	const techFootprint = str("techFootprint");
	if (!about || !industry || !techFootprint || body.contactConsent !== "yes") return json({ error: "Describe your business and technology setup, and confirm we may reply." }, 400);
	if ([contactName, contactEmail, company, about, workflow, industry, techFootprint, str("jobTitle"), str("phone"), str("heardAbout")].some((value) => value.length > 2000)) return json({ error: "Please shorten your answers." }, 400);

	// issue attribution: /gift?ref=<docId> from the issue page CTA links
	const ref = str("ref");
	const sourceDocId = UUID_RE.test(ref) ? ref : null;

	// every answer, verbatim — the columns below are just the queryable subset
	const answers: Record<string, unknown> = {
		name: contactName,
		jobTitle: str("jobTitle"),
		phone: str("phone"),
		company,
		email: contactEmail,
		heardAbout: str("heardAbout"),
		about,
		workflow,
		industry,
		techFootprint,
		intent: "pilot",
		contactConsent: "yes",
	};

	const [row] = await db
		.insert(brainRequests)
		.values({
			answers,
			company,
			contactEmail,
			jobTitle: str("jobTitle") || null,
			...(sourceDocId ? { sourceDocId } : {}),
		})
		.returning({ id: brainRequests.id });

	const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	await alertEmail(
		`New pilot application: ${company}`,
		`<p><strong>${esc(contactName)}</strong> (${esc(str("jobTitle") || "—")}) at <strong>${esc(company)}</strong> applied for the 12-week pilot. No slot is reserved.</p>
		 <p><a href="mailto:${esc(contactEmail)}">${esc(contactEmail)}</a> · phone ${esc(str("phone") || "—")}</p>
		 <ul>
			<li><strong>Heard about us:</strong> ${esc(str("heardAbout") || "—")}</li>
			<li><strong>What the business does:</strong> ${esc(about)}</li>
			<li><strong>Industry:</strong> ${esc(industry)}</li>
			<li><strong>Technology footprint:</strong> ${esc(techFootprint)}</li>
			<li><strong>Workflow to improve:</strong> ${esc(workflow)}</li>
		 </ul>
		 <p>Reply personally within a couple of days. Qualify and agree on one workflow before accepting. Dashboard → Lead magnet requests (row ${row.id}).</p>`,
	);

	return json({ ok: true });
};
