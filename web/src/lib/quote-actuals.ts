// Server-side quote actuals (hours vs cost vs invoiced vs quote). Split from
// lib/quotes.ts so the pure math/compose functions stay importable by client
// components without dragging the db into the client bundle.
import { and, eq, sql } from "drizzle-orm";
import { db } from "~/db";
import { invoices, projects, quotes, quoteItems, timeEntries } from "~/db/schema";
import { computeQuoteTotals } from "~/lib/quotes";

/** Cost vs hours vs quote — the calibration loop for better estimates. */
export async function getProjectActuals(projectId: string) {
	const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
	if (!project) return null;
	const [entries, invoiceRows, linkedQuotes] = await Promise.all([
		db.select({ hours: timeEntries.hours, billable: timeEntries.billable }).from(timeEntries).where(eq(timeEntries.projectId, projectId)),
		db.select({ amount: invoices.amount, status: invoices.status }).from(invoices).where(eq(invoices.projectId, projectId)),
		db.select({ id: quotes.id, title: quotes.title, quotedCapHours: quotes.quotedCapHours }).from(quotes).where(and(eq(quotes.projectId, projectId), sql`true`)),
	]);
	const quoteRefs = await Promise.all(
		linkedQuotes.map(async (q) => {
			const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, q.id));
			const totals = computeQuoteTotals(items);
			return { ...q, requiredSubtotal: totals.required.subtotal, optionalSubtotal: totals.optional.subtotal, total: totals.total, quotedHours: totals.required.hours + totals.optional.hours };
		}),
	);
	const hours = {
		total: entries.reduce((s, e) => s + e.hours, 0),
		billable: entries.reduce((s, e) => s + (e.billable ? e.hours : 0), 0),
	};
	const byStatus: Record<string, number> = {};
	for (const inv of invoiceRows) byStatus[inv.status] = (byStatus[inv.status] ?? 0) + inv.amount;
	const invoicedTotal = invoiceRows.filter((i) => i.status !== "draft").reduce((s, i) => s + i.amount, 0);
	const laborCost = hours.billable * project.hourlyRate;
	const quote = quoteRefs.at(-1) ?? null;
	return {
		project: { id: project.id, name: project.name, engagementType: project.engagementType, hourlyRate: project.hourlyRate, fixedPrice: project.fixedPrice },
		hours,
		laborCost,
		invoiced: { total: invoicedTotal, byStatus },
		quote,
		variance: quote ? laborCost - quote.total : null,
		varianceVsCap: quote?.quotedCapHours ? hours.billable - quote.quotedCapHours : null,
	};
}
