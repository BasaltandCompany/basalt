// Client-facing notification emails via Resend — system broadcasts, not
// drafts, so they bypass the Gmail outbox entirely (publish.ts set the
// Resend precedent for this app). One email per stakeholder: a single
// batch send would expose every stakeholder's address to the others.
import { and, eq, gte } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "~/db";
import {
	clientCompanyMembers,
	clientMembers,
	companies,
	deliverables,
	projects,
	quoteItems,
	quotes,
	timeEntries,
} from "~/db/schema";
import { computeQuoteTotals, money } from "~/lib/quotes";
import { SITE_URL, renderStatusUpdateEmail, renderQuoteReadyEmail } from "~/lib/notify-emails";

// Same envs publish.ts uses; NOTIFY_FROM only needs to be an address on the
// verified Resend domain (basalt.ac).
const NOTIFY_FROM = process.env.NOTIFY_FROM ?? "Collin Pfeifer <collin@basalt.ac>";
const REPLY_TO = process.env.ALERT_EMAIL ?? "cpfeifer@basalt.ac";

export type NotifyResult =
	| { ok: true; delivered: number; failed: string[]; note?: string }
	| { ok: false; error: string };

/** Active portal members of a company — the broadcast audience. */
export async function getCompanyStakeholders(companyId: string): Promise<string[]> {
	const rows = await db
		.select({ email: clientMembers.email })
		.from(clientCompanyMembers)
		.innerJoin(clientMembers, eq(clientMembers.id, clientCompanyMembers.memberId))
		.where(and(eq(clientCompanyMembers.companyId, companyId), eq(clientMembers.isActive, true)));
	return [...new Set(rows.map((r) => r.email.toLowerCase()))];
}

/** First ~3 non-empty lines, capped — the email preview; the full body lives in the portal. */
export function previewLines(body: string, maxChars = 300): string {
	const lines = body
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(0, 3)
		.join("\n");
	return lines.length > maxChars ? `${lines.slice(0, maxChars).trimEnd()}…` : lines;
}

/** "6.5h logged this week · 2 deliverables completed · 3 open" from the trailing 7 days. */
async function projectDigest(projectId: string): Promise<string | null> {
	const since = new Date(Date.now() - 7 * 86_400_000);
	const [entries, dels] = await Promise.all([
		db
			.select({ hours: timeEntries.hours })
			.from(timeEntries)
			.where(and(eq(timeEntries.projectId, projectId), gte(timeEntries.entryDate, since))),
		db
			.select({ status: deliverables.status, updatedAt: deliverables.updatedAt })
			.from(deliverables)
			.where(eq(deliverables.projectId, projectId)),
	]);
	const hours = entries.reduce((s, e) => s + e.hours, 0);
	const completed = dels.filter((d) => d.status === "completed" && d.updatedAt >= since).length;
	const open = dels.filter((d) => d.status !== "completed").length;
	const bits: string[] = [];
	if (hours > 0) bits.push(`${Number.isInteger(hours) ? hours : hours.toFixed(1)}h logged this week`);
	if (completed > 0) bits.push(`${completed} deliverable${completed === 1 ? "" : "s"} completed`);
	if (open > 0) bits.push(`${open} open`);
	return bits.length ? bits.join(" · ") : null;
}

async function sendToStakeholders(
	recipients: string[],
	subject: string,
	html: string,
	text: string,
): Promise<{ delivered: number; failed: string[]; missingKey?: boolean }> {
	const key = process.env.RESEND_API_KEY;
	if (!key) return { delivered: 0, failed: [], missingKey: true };
	const resend = new Resend(key);
	const failed: string[] = [];
	let delivered = 0;
	for (const to of recipients) {
		try {
			const { error } = await resend.emails.send({ from: NOTIFY_FROM, to: [to], subject, html, text, replyTo: REPLY_TO });
			if (error) {
				failed.push(`${to}: ${error.message}`);
				continue;
			}
			delivered++;
		} catch (e) {
			failed.push(`${to}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return { delivered, failed };
}

function withNote(res: { delivered: number; failed: string[]; missingKey?: boolean }): NotifyResult {
	if (res.missingKey) return { ok: true, delivered: 0, failed: [], note: "RESEND_API_KEY not configured — posted without email." };
	if (res.failed.length)
		return { ok: true, ...res, note: `Delivered ${res.delivered}; ${res.failed.length} failed: ${res.failed.join("; ")}` };
	return { ok: true, ...res };
}

/** Broadcast a posted status update to the project company's active members. */
export async function sendStatusUpdateEmail(input: {
	projectId: string;
	title: string | null;
	body: string;
}): Promise<NotifyResult> {
	const [project] = await db
		.select({ id: projects.id, name: projects.name, companyId: projects.companyId })
		.from(projects)
		.where(eq(projects.id, input.projectId))
		.limit(1);
	if (!project) return { ok: false, error: "Project not found." };
	const stakeholders = await getCompanyStakeholders(project.companyId);
	if (!stakeholders.length) return { ok: true, delivered: 0, failed: [], note: "No portal members to notify — invite them first." };

	const heading = input.title?.trim() || `Update on ${project.name}`;
	const preview = previewLines(input.body);
	const digest = await projectDigest(project.id);
	const portalUrl = `${SITE_URL}/portal`;
	const html = renderStatusUpdateEmail({ heading, projectName: project.name, preview, digest, portalUrl });
	const text = `${heading}\n\n${preview}${digest ? `\n\n${digest}` : ""}\n\nRead the full update in your portal: ${portalUrl}`;
	return withNote(await sendToStakeholders(stakeholders, `${heading} — Basalt & Company`, html, text));
}

/** Notify stakeholders that a quote is ready for review (draft → sent). */
export async function sendQuoteReadyEmail(quoteId: string): Promise<NotifyResult> {
	const [row] = await db
		.select({ quote: quotes, companyName: companies.name })
		.from(quotes)
		.innerJoin(companies, eq(companies.id, quotes.companyId))
		.where(eq(quotes.id, quoteId))
		.limit(1);
	if (!row) return { ok: false, error: "Quote not found." };
	const stakeholders = await getCompanyStakeholders(row.quote.companyId);
	if (!stakeholders.length) return { ok: true, delivered: 0, failed: [], note: "No portal members to notify — invite them first." };

	const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
	const totals = computeQuoteTotals(items);
	const lines = totals.optional.count > 0 ? `${totals.required.count}+${totals.optional.count} lines` : `${totals.required.count} lines`;
	const total = money(totals.total);
	const quoteUrl = `${SITE_URL}/portal/quotes/${row.quote.id}`;
	const html = renderQuoteReadyEmail({ title: row.quote.title, company: row.companyName, total, lines, quoteUrl });
	const text = `A new quote is ready for review: ${row.quote.title} — ${total} (${lines}).\n\nReview and sign in your portal: ${quoteUrl}`;
	return withNote(await sendToStakeholders(stakeholders, `Quote ready for review: ${row.quote.title}`, html, text));
}
