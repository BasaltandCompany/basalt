// Quote math + composition. The BCW Forms quote (docs 396f836e on prod) is the
// canonical structure: header block, narrative body, required line items with a
// Base subtotal, optional add-ons with an Everything-in total, signature block.
// Totals are computed on read — nothing stored, so the math can't drift.
// PURE module (no db imports): client components import it directly, so any
// db-touching code belongs in lib/quote-actuals.ts instead.

export type QuoteItemLike = {
	group: "required" | "optional";
	name: string;
	detail?: string | null;
	hours: number;
	unitRate: number;
};

export type QuoteTotals = {
	perItem: number[];
	required: { hours: number; subtotal: number; count: number };
	optional: { hours: number; subtotal: number; count: number };
	/** everything-in total (required + optional) */
	total: number;
};

export function computeQuoteTotals(items: QuoteItemLike[]): QuoteTotals {
	const perItem = items.map((i) => i.hours * i.unitRate);
	const group = (g: "required" | "optional") => {
		const idx = items.map((i, n) => (i.group === g ? n : -1)).filter((n) => n >= 0);
		return {
			hours: idx.reduce((s, n) => s + items[n].hours, 0),
			subtotal: idx.reduce((s, n) => s + perItem[n], 0),
			count: idx.length,
		};
	};
	return {
		perItem,
		required: group("required"),
		optional: group("optional"),
		total: perItem.reduce((s, n) => s + n, 0),
	};
}

/** "Rate: $120/hour. Fixed Price Quote Project." — only when every rate matches. */
export function quoteRateLine(items: QuoteItemLike[]): string | null {
	const rates = [...new Set(items.map((i) => i.unitRate))];
	if (rates.length !== 1 || rates[0] <= 0) return null;
	return `Rate: ${money(rates[0])}/hour. Fixed Price Quote Project.`;
}

/** Whole dollars when exact ($9,600), two decimals when not ($747.50). */
export function money(n: number): string {
	const rounded = Math.round(n * 100) / 100;
	return `$${Number.isInteger(rounded) ? rounded.toLocaleString("en-US") : rounded.toFixed(2)}`;
}

const dateLine = (d: Date) =>
	d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const DATE_BLANK = "Date: \\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_\\_";

/** The full quote as markdown — header block, narrative, item tables, signature. */
export function composeQuoteMarkdown(opts: {
	quote: { validDays: number; quotedCapHours?: number | null; createdAt?: Date | null };
	companyName: string;
	bodyMarkdown: string;
	items: QuoteItemLike[];
	signature?: { signerName: string; signedAt: Date } | null;
	preparedBy?: string;
}): string {
	const { quote, companyName, bodyMarkdown, items, signature } = opts;
	const totals = computeQuoteTotals(items);
	const lines: string[] = [
		`Prepared for: ${companyName}`,
		`Prepared by: ${opts.preparedBy ?? "Collin Pfeifer"}`,
		"",
		`Date: ${dateLine(quote.createdAt ?? new Date())}`,
	];
	const rate = quoteRateLine(items);
	if (rate) lines.push(rate);
	lines.push(`Quote valid: ${quote.validDays} days`, "", bodyMarkdown.trim(), "");

	const table = (rows: number[], header: string, totalLabel: string) => {
		const out = [`## ${header}`, "", "| Part | Line item | Hours | Price |", "| --- | --- | --- | --- |"];
		rows.forEach((n, i) => {
			const it = items[n];
			const part = header === "Optional add-ons" ? String.fromCharCode(65 + i) : String(i + 1);
			const text = it.detail ? `${it.name} — ${it.detail}` : it.name;
			out.push(`| ${part} | ${text} | ${it.hours} | ${money(totals.perItem[n])} |`);
		});
		const g = header === "Optional add-ons" ? totals.optional : totals.required;
		// no optionals → the required table closes with the grand total
		const label = header === "Optional add-ons" ? totalLabel : totals.optional.count > 0 ? totalLabel : "Total";
		out.push(`|  | **${label}** | **${g.hours}** | **${money(g.subtotal)}** |`);
		return out.join("\n");
	};

	const reqIdx = items.map((i, n) => (i.group === "required" ? n : -1)).filter((n) => n >= 0);
	if (reqIdx.length > 0) lines.push(table(reqIdx, "Required line items", "Base subtotal"));
	if (totals.optional.count > 0) {
		const optIdx = items.map((i, n) => (i.group === "optional" ? n : -1)).filter((n) => n >= 0);
		lines.push("", table(optIdx, "Optional add-ons", "Everything-in total"), "", `Everything-in total: ${money(totals.total)} (${totals.optional.hours + totals.required.hours} hours).`);
	}
	if (quote.quotedCapHours) lines.push("", `Quoted cap: ${quote.quotedCapHours} hours.`);

	const clientBlock = signature
		? `**Signed: ${signature.signerName}** — ${dateLine(signature.signedAt)} (Basalt client portal)`
		: `${companyName}\n\n${DATE_BLANK}`;
	lines.push(
		"",
		"## Signature",
		"",
		"By signing below, both parties agree to the terms outlined in this quote.",
		"",
		"Collin Pfeifer",
		"",
		DATE_BLANK,
		"",
		clientBlock,
	);
	return lines.join("\n");
}
