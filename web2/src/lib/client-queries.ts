import { query, formAction, revalidate } from "@solidjs/router";
import { redirect } from "@solidjs/web";
import { eq, and, desc, inArray } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { getClient, clientSignIn, setClientSessionCookie } from "./client-session";
import { supabaseAdmin, supabaseService } from "./supabase";
import { generateApiKey, hashKey, keyPrefix } from "./crypto";
import { db, raw } from "~/db";
import {
	projects,
	companies,
	clientCompanyMembers,
	clientMembers,
	documents,
	invoices,
	deliverables,
	deliverableUpdates,
	apiKeys,
	quotes,
	quoteItems,
	quoteVersions,
	quoteSignatures,
	docs,
	timeEntries,
	tools,
} from "~/db/schema";
import type { DocumentType, QuoteStatus } from "~/db/schema";
import { computeQuoteTotals, composeQuoteMarkdown } from "~/lib/quotes";
import { marked } from "marked";
import { sql, asc } from "drizzle-orm";
import { grossSavedForCompany, grossSavedForTool, cumulativeSavingsSeries } from "~/lib/value";

// ── Client portal queries ──────────────────────────────────────────

export const getClientUserQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	return { id: member.id, name: member.name, email: member.email };
}, "client-user");

export const getClientDashboardQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");

	// All companies this member belongs to
	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));

	const companyIds = memberCompanies.map((c) => c.companyId);
	if (companyIds.length === 0)
		return { projects: [], deliverables: [], docCount: 0, invoiceCount: 0 };

	// All projects across the member's companies
	const memberProjects = await db
		.select({
			...getTableColumns(projects),
			companyName: companies.name,
		})
		.from(projects)
		.innerJoin(companies, eq(companies.id, projects.companyId))
		.where(inArray(projects.companyId, companyIds))
		.orderBy(desc(projects.createdAt));

	const projectIds = memberProjects.map((p) => p.id);

	// Deliverables across all projects
	const allDeliverables =
		projectIds.length > 0
			? await db
					.select()
					.from(deliverables)
					.where(inArray(deliverables.projectId, projectIds))
					.orderBy(deliverables.sortOrder)
			: [];

	const delvIds = allDeliverables.map((d) => d.id);
	const allUpdates =
		delvIds.length > 0
			? await db
					.select()
					.from(deliverableUpdates)
					.where(inArray(deliverableUpdates.deliverableId, delvIds))
			: [];

	const updatesByDeliverable = new Map<
		string,
		typeof deliverableUpdates.$inferSelect[]
	>();
	for (const u of allUpdates) {
		const arr = updatesByDeliverable.get(u.deliverableId) ?? [];
		arr.push(u);
		updatesByDeliverable.set(u.deliverableId, arr);
	}

	const deliverablesWithUpdates = allDeliverables.map((d) => ({
		...d,
		updates: updatesByDeliverable.get(d.id) ?? [],
	}));

	// Doc + invoice counts
	const docRows =
		projectIds.length > 0
			? await db
					.select({ id: documents.id })
					.from(documents)
					.where(
						and(
							inArray(documents.projectId, projectIds),
							eq(documents.visibility, "client"),
						),
					)
			: [];

	const invoiceRows =
		projectIds.length > 0
			? await db
					.select({ id: invoices.id })
					.from(invoices)
					.where(
						and(
							inArray(invoices.projectId, projectIds),
							inArray(invoices.status, ["sent", "draft"]),
						),
					)
			: [];

	return {
		projects: memberProjects,
		deliverables: deliverablesWithUpdates,
		docCount: docRows.length,
		invoiceCount: invoiceRows.length,
	};
}, "client-dashboard");

/** The value story for the member's companies: gross saved, cumulative
 *  series for the chart, per-tool rows, and hours invested. Fees are
 *  deliberately absent — cost math is admin-only. */
export const getClientValueQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");

	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));
	const companyIds = memberCompanies.map((c) => c.companyId);
	if (companyIds.length === 0)
		return { savedToDate: 0, series: [], tools: [], totalHours: 0, hoursThisMonth: 0 };

	const toolRows = await db
		.select()
		.from(tools)
		.where(inArray(tools.companyId, companyIds))
		.orderBy(asc(tools.cutoverDate)); // ASC: nulls last → replaced tools first, planned at the end

	const projectRows = await db
		.select({ id: projects.id })
		.from(projects)
		.where(inArray(projects.companyId, companyIds));
	const projectIds = projectRows.map((p) => p.id);
	const entryRows =
		projectIds.length > 0
			? await db
					.select({ hours: timeEntries.hours, entryDate: timeEntries.entryDate })
					.from(timeEntries)
					.where(inArray(timeEntries.projectId, projectIds))
			: [];

	const now = new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	return {
		savedToDate: grossSavedForCompany(toolRows),
		series: cumulativeSavingsSeries(toolRows),
		tools: toolRows.map((t) => ({
			name: t.name,
			monthlyCost: t.monthlyCost,
			cutoverDate: t.cutoverDate,
			saved: grossSavedForTool(t),
		})),
		totalHours: entryRows.reduce((s, e) => s + e.hours, 0),
		hoursThisMonth: entryRows
			.filter((e) => new Date(e.entryDate) >= monthStart)
			.reduce((s, e) => s + e.hours, 0),
	};
}, "client-value");

export interface SearchHit {
	id: string;
	title: string;
	type: DocumentType;
	url: string | null;
	file_name: string | null;
	description: string | null;
	content_snippet: string | null;
}

/** Client-side full-text search across documents the member can see.
 *  Replaces the old untyped `/api/search` fetch. */
export const searchDocumentsQuery = query(async (q: string): Promise<SearchHit[]> => {
	"use server";
	if (!q || q.trim().length < 2) return [];

	const member = await getClient();
	if (!member) throw redirect("/portal/login");

	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));
	const companyIds = memberCompanies.map((c) => c.companyId);
	if (companyIds.length === 0) return [];

	const memberProjects = await db
		.select({ id: projects.id })
		.from(projects)
		.where(inArray(projects.companyId, companyIds));
	const projectIds = memberProjects.map((p) => p.id);
	if (projectIds.length === 0) return [];

	const results = await raw<{
		id: string;
		title: string;
		type: string;
		url: string | null;
		file_name: string | null;
		description: string | null;
		snippet: string | null;
	}>(sql`
		SELECT d.id, d.title, d.type, d.url, d.file_name, d.description,
			CASE WHEN d.content IS NOT NULL THEN
				ts_headline('english', d.content, websearch_to_tsquery('english', ${q}),
					'MaxFragments=1, MinWords=5, MaxWords=30')
			ELSE NULL END as snippet
		FROM documents d
		WHERE d.project_id = ANY(${projectIds}::uuid[])
			AND d.visibility = 'client'
			AND to_tsvector('english', coalesce(d.title,'') || ' ' || coalesce(d.description,'') || ' ' || coalesce(d.content,''))
				@@ websearch_to_tsquery('english', ${q})
		ORDER BY ts_rank(
				to_tsvector('english', coalesce(d.title,'') || ' ' || coalesce(d.description,'') || ' ' || coalesce(d.content,'')),
				websearch_to_tsquery('english', ${q})
			) DESC
		LIMIT 10
	`);

	return results.map((d) => ({
		id: d.id,
		title: d.title,
		type: d.type as DocumentType,
		url: d.url,
		file_name: d.file_name,
		description: d.description,
		content_snippet: d.snippet ? d.snippet.replace(/<\/?b>/g, "") : null,
	}));
}, "client-search");

export const getClientDocumentsQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");

	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));

	const companyIds = memberCompanies.map((c) => c.companyId);
	if (companyIds.length === 0) return [];

	const memberProjects = await db
		.select({ id: projects.id })
		.from(projects)
		.where(inArray(projects.companyId, companyIds));

	const projectIds = memberProjects.map((p) => p.id);
	if (projectIds.length === 0) return [];

	return db
		.select()
		.from(documents)
		.where(
			and(
				inArray(documents.projectId, projectIds),
				eq(documents.visibility, "client"),
			),
		)
		.orderBy(desc(documents.createdAt));
}, "client-documents");

export const getClientInvoicesQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");

	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));

	const companyIds = memberCompanies.map((c) => c.companyId);
	if (companyIds.length === 0) return [];

	const memberProjects = await db
		.select({ id: projects.id })
		.from(projects)
		.where(inArray(projects.companyId, companyIds));

	const projectIds = memberProjects.map((p) => p.id);
	if (projectIds.length === 0) return [];

	return db
		.select()
		.from(invoices)
		.where(inArray(invoices.projectId, projectIds))
		.orderBy(desc(invoices.createdAt));
}, "client-invoices");

export const getClientApiKeysQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	return db
		.select({
			id: apiKeys.id,
			memberId: apiKeys.memberId,
			label: apiKeys.label,
			keyPrefix: apiKeys.keyPrefix,
			lastUsedAt: apiKeys.lastUsedAt,
			revokedAt: apiKeys.revokedAt,
			createdAt: apiKeys.createdAt,
		})
		.from(apiKeys)
		.where(eq(apiKeys.memberId, member.id))
		.orderBy(desc(apiKeys.createdAt));
}, "client-api-keys");

// ── Client portal actions ──────────────────────────────────────────

export const clientLoginAction = formAction(async (formData: FormData) => {
	"use server";
	const email = String(formData.get("email"));
	const password = String(formData.get("password"));
	const result = await clientSignIn(email, password);
	if (result.error) return { error: result.error };
	throw redirect("/portal");
}, "client-login");

// Consumes the token Supabase appends to /portal/login after an invite-email
// click and sets the member's first password. Two proof shapes are accepted:
// an implicit-flow access_token (fragment; what admin-API invites produce with
// the default email template) or a token_hash (query param; custom templates).
export const setInvitePasswordAction = formAction(async (formData: FormData) => {
	"use server";
	const accessToken = String(formData.get("access_token") || "");
	const tokenHash = String(formData.get("token_hash") || "");
	const password = String(formData.get("password") || "");
	if (password.length < 6) return { error: "Password must be at least 6 characters." };

	let user: { id: string; email?: string } | null = null;
	try {
		if (accessToken) {
			const { data, error } = await supabaseAdmin().auth.getUser(accessToken);
			if (!error) user = data.user;
		} else if (tokenHash) {
			const { data, error } = await supabaseAdmin().auth.verifyOtp({
				token_hash: tokenHash,
				type: "invite",
			});
			if (!error) user = data.user;
		}
	} catch {
		// treat as expired below — Supabase timeout config wraps fetch with 10s abort
	}
	if (!user?.email)
		return { error: "This invite link is invalid or has expired. Ask us to resend the invite." };

	const [member] = await db
		.select({ id: clientMembers.id, isActive: clientMembers.isActive })
		.from(clientMembers)
		.where(eq(clientMembers.email, user.email.toLowerCase()))
		.limit(1);
	if (!member || !member.isActive)
		return { error: "Your portal account isn't active. Contact us for access." };

	const { error } = await supabaseService().auth.admin.updateUserById(user.id, { password });
	if (error) return { error: `Could not set password: ${error.message}` };

	// Token proves control of the invite email — sign them straight in.
	setClientSessionCookie(member.id);
	throw redirect("/portal");
}, "set-invite-password");

export const createApiKeyAction = formAction(async (formData: FormData) => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	const label = String(formData.get("label") || "Default");
	const rawKey = generateApiKey();
	try {
		await db.insert(apiKeys).values({
			memberId: member.id,
			label,
			keyHash: hashKey(rawKey),
			keyPrefix: keyPrefix(rawKey),
		});
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Failed to create API key." };
	}
	return { key: rawKey };
}, "createApiKey");

export const revokeApiKeyAction = formAction(async (formData: FormData) => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	const id = String(formData.get("id"));
	try {
		await db
			.update(apiKeys)
			.set({ revokedAt: new Date() })
			.where(and(eq(apiKeys.id, id), eq(apiKeys.memberId, member.id)));
		return { success: "Key revoked." };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Failed to revoke key." };
	}
}, "revokeApiKey");

// ── Quotes (client portal) ─────────────────────────────────────────

export const getClientQuotesQuery = query(async () => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));
	const companyIds = memberCompanies.map((c) => c.companyId);
	if (companyIds.length === 0) return [];
	const rows = await db
		.select({
			id: quotes.id,
			title: quotes.title,
			status: quotes.status,
			companyName: companies.name,
			updatedAt: quotes.updatedAt,
		})
		.from(quotes)
		.innerJoin(companies, eq(companies.id, quotes.companyId))
		.where(inArray(quotes.companyId, companyIds))
		.orderBy(desc(quotes.updatedAt));
	const allItems = await db.select().from(quoteItems);
	return rows.map((q) => ({
		...q,
		totals: computeQuoteTotals(allItems.filter((i) => i.quoteId === q.id)),
	}));
}, "client-quotes");

export const getClientQuoteQuery = query(async (id: string) => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));
	const companyIds = memberCompanies.map((c) => c.companyId);
	const [row] = await db
		.select({ quote: quotes, companyName: companies.name })
		.from(quotes)
		.innerJoin(companies, eq(companies.id, quotes.companyId))
		.where(and(eq(quotes.id, id), inArray(quotes.companyId, companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"])))
		.limit(1);
	if (!row) return null;
	const [items, bodyDoc, versions, signatures] = await Promise.all([
		db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(quoteItems.sortOrder),
		db.select({ id: docs.id, markdown: docs.markdown }).from(docs).where(eq(docs.id, row.quote.bodyDocId)).limit(1),
		db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, id)).orderBy(desc(quoteVersions.version)),
		db.select().from(quoteSignatures).where(eq(quoteSignatures.quoteId, id)).orderBy(desc(quoteSignatures.createdAt)),
	]);
	const composed = bodyDoc[0]
		? composeQuoteMarkdown({
				quote: { validDays: row.quote.validDays, quotedCapHours: row.quote.quotedCapHours, createdAt: row.quote.createdAt },
				companyName: row.companyName,
				bodyMarkdown: bodyDoc[0].markdown,
				items,
				signature: signatures[0] ? { signerName: signatures[0].signerName, signedAt: signatures[0].createdAt } : null,
			})
		: "";
	return {
		...row.quote,
		companyName: row.companyName,
		memberName: member.name,
		items,
		totals: computeQuoteTotals(items),
		bodyDoc: bodyDoc[0] ? { id: bodyDoc[0].id } : null,
		composedHtml: (marked.parse(composed, { async: false }) as string) ?? "",
		versions,
		signatures,
	};
}, "client-quote");

// Click-to-sign (ESIGN-valid): typed legal name + portal identity + timestamp.
// Flips sent → accepted and syncs the project's fixed price to the total.
export const signQuoteAction = formAction(async (formData: FormData) => {
	"use server";
	const member = await getClient();
	if (!member) throw redirect("/portal/login");
	const quoteId = String(formData.get("quote_id") || "");
	const signerName = String(formData.get("signer_name") || "").trim();
	if (signerName.length < 3) return { error: "Enter your full legal name to sign." };
	const memberCompanies = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));
	const companyIds = memberCompanies.map((c) => c.companyId);
	const [quote] = await db
		.select()
		.from(quotes)
		.where(and(eq(quotes.id, quoteId), inArray(quotes.companyId, companyIds.length > 0 ? companyIds : ["00000000-0000-0000-0000-000000000000"])))
		.limit(1);
	if (!quote) return { error: "Quote not found." };
	if (quote.status !== "sent") return { error: `This quote is ${quote.status} — only sent quotes can be signed.` };
	const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
	const totals = computeQuoteTotals(items);
	const [last] = await db
		.select({ version: quoteVersions.version })
		.from(quoteVersions)
		.where(eq(quoteVersions.quoteId, quoteId))
		.orderBy(desc(quoteVersions.version))
		.limit(1);
	await db.insert(quoteSignatures).values({ quoteId, memberId: member.id, signerName });
	await db.insert(quoteVersions).values({
		quoteId,
		version: (last?.version ?? 0) + 1,
		status: "accepted" as QuoteStatus,
		itemsJson: items,
		subtotal: totals.total,
	});
	await db.update(quotes).set({ status: "accepted" }).where(eq(quotes.id, quoteId));
	if (quote.projectId) {
		await db.update(projects).set({ fixedPrice: totals.total }).where(eq(projects.id, quote.projectId));
	}
	await revalidate([getClientQuoteQuery.keyFor(quoteId), getClientQuotesQuery.key]);
	return { success: `Signed by ${signerName}. The quote is now accepted.` };
}, "clientSignQuote");
