import type { APIEvent } from "filesystem-routing/api";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getAuthedClient } from "~/lib/session";
import { getClient } from "~/lib/client-session";
import { db } from "~/db";
import { companies, docs, quotes, quoteItems, quoteSignatures, clientCompanyMembers } from "~/db/schema";
import { composeQuoteMarkdown } from "~/lib/quotes";
import { renderPdf } from "~/lib/doc-export";
import { mentionTitles } from "~/lib/mention-render";

/** Quote PDF — the composed quote (header, narrative, item tables, signature
 *  block) through the same doc-export pipeline. Admin-session OR a portal
 *  member of the owning company. GET /api/quotes/:id/pdf */
export const GET = async (event: APIEvent) => {
	const [row] = await db
		.select({ quote: quotes, companyName: companies.name, markdown: docs.markdown })
		.from(quotes)
		.innerJoin(companies, eq(companies.id, quotes.companyId))
		.innerJoin(docs, eq(docs.id, quotes.bodyDocId))
		.where(eq(quotes.id, event.params!.id))
		.limit(1);
	if (!row) return new Response("Not found", { status: 404 });

	const admin = await getAuthedClient();
	let allowed = Boolean(admin);
	if (!allowed) {
		const member = await getClient();
		if (member) {
			const membership = await db
				.select({ companyId: clientCompanyMembers.companyId })
				.from(clientCompanyMembers)
				.where(and(eq(clientCompanyMembers.memberId, member.id), eq(clientCompanyMembers.companyId, row.quote.companyId)))
				.limit(1);
			allowed = membership.length > 0;
		}
	}
	if (!allowed) return new Response("Unauthorized", { status: 401 });

	const [items, sigs] = await Promise.all([
		db.select().from(quoteItems).where(eq(quoteItems.quoteId, row.quote.id)).orderBy(quoteItems.sortOrder),
		db.select().from(quoteSignatures).where(eq(quoteSignatures.quoteId, row.quote.id)).orderBy(desc(quoteSignatures.createdAt)).limit(1),
	]);
	const md = await mentionTitles(
		composeQuoteMarkdown({
			quote: { validDays: row.quote.validDays, quotedCapHours: row.quote.quotedCapHours, createdAt: row.quote.createdAt },
			companyName: row.companyName,
			bodyMarkdown: row.markdown,
			items,
			signature: sigs[0] ? { signerName: sigs[0].signerName, signedAt: sigs[0].createdAt } : null,
		}),
	);
	const buf = await renderPdf(row.quote.title, md);
	const name = (row.quote.title || "quote").replace(/[^\w-]+/g, "-");
	return new Response(buf, {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${name}.pdf"`,
		},
	});
};
