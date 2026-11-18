import type { APIEvent } from "@solidjs/start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applyInstallation, applyPullRequest, type InstallationPayload, type PullRequestPayload } from "~/lib/github-prs";

// GitHub App webhook receiver — pull_request events only. The App itself is
// just delivery (no API credentials; the payload carries everything). Setup:
// webhook URL <host>/api/github/webhook, secret in GITHUB_WEBHOOK_SECRET,
// subscribe to pull_request, install on the repos.
function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function verifySignature(secret: string, raw: string, header: string | null): boolean {
	if (!header?.startsWith("sha256=")) return false;
	const expected = createHmac("sha256", secret).update(raw).digest("hex");
	const given = header.slice(7);
	const a = Buffer.from(expected, "hex");
	const b = Buffer.from(given, "hex");
	return a.length === b.length && timingSafeEqual(a, b);
}

export const POST = async (event: APIEvent) => {
	const secret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!secret) {
		console.error("[github-webhook] GITHUB_WEBHOOK_SECRET not set");
		return json({ error: "Not configured" }, 503);
	}
	const raw = await event.request.text();
	if (!verifySignature(secret, raw, event.request.headers.get("x-hub-signature-256"))) {
		console.log("[github-webhook] bad signature — ignored");
		return json({ error: "Unauthorized" }, 401);
	}
	let payload: PullRequestPayload;
	try {
		payload = JSON.parse(raw);
	} catch {
		return json({ error: "Bad JSON" }, 400);
	}
	if (event.request.headers.get("x-github-event") !== "pull_request") {
		if (event.request.headers.get("x-github-event") === "installation") {
			return json({ ...(await applyInstallation(payload as unknown as InstallationPayload)) });
		}
		return json({ ok: true, ignored: true });
	}
	return json({ ok: true, ...(await applyPullRequest(payload)) });
};
