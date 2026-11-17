// Savings math for the SaaS-replacement ledger (tools table).
// Pure functions — DB rows in, dollars out. Day-prorated at 30.44
// days/month (average month length) so a tool cut over mid-month earns
// its fair share. Gross saved goes to the client (/portal/value); net ROI
// (gross − billable fees) is admin-only.

export type ToolRow = {
	name: string;
	monthlyCost: number;
	cutoverDate: Date | string | null;
};

export type BilledHoursRow = {
	hours: number;
	billable: boolean;
	hourlyRate: number;
};

const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 86_400_000;

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

export function grossSavedForTool(tool: ToolRow, now: Date = new Date()): number {
	if (!tool.cutoverDate) return 0;
	const cutover = toDate(tool.cutoverDate);
	if (cutover.getTime() > now.getTime()) return 0;
	const days = Math.max(0, (now.getTime() - cutover.getTime()) / MS_PER_DAY);
	return (tool.monthlyCost * days) / DAYS_PER_MONTH;
}

export function grossSavedForCompany(tools: ToolRow[], now: Date = new Date()): number {
	return tools.reduce((sum, t) => sum + grossSavedForTool(t, now), 0);
}

export function billedAmount(entries: BilledHoursRow[]): number {
	return entries.reduce((sum, e) => sum + (e.billable ? e.hours * e.hourlyRate : 0), 0);
}

export function netRoi(tools: ToolRow[], billed: BilledHoursRow[], now: Date = new Date()): number {
	return grossSavedForCompany(tools, now) - billedAmount(billed);
}

/** Whole-USD display: 14200.4 → "$14,200" */
export function usd(amount: number): string {
	const sign = amount < 0 ? "-" : "";
	return sign + "$" + Math.round(Math.abs(amount)).toLocaleString("en-US");
}

export type SavingsPoint = { label: string; saved: number };

/**
 * Cumulative gross savings at each month boundary from the earliest
 * cutover through now. Empty when nothing has been cut over yet —
 * the caller renders the empty state.
 */
export function cumulativeSavingsSeries(tools: ToolRow[], now: Date = new Date()): SavingsPoint[] {
	const cutovers = tools
		.map((t) => (t.cutoverDate ? toDate(t.cutoverDate) : null))
		.filter((d): d is Date => d !== null && d.getTime() <= now.getTime());
	if (cutovers.length === 0) return [];

	const earliest = new Date(Math.min(...cutovers.map((d) => d.getTime())));
	const points: SavingsPoint[] = [];
	for (
		let cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
		cursor <= now;
		cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
	) {
		const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
		const bucketEnd = nextMonth > now ? now : nextMonth;
		points.push({
			label: cursor.toLocaleString("en-US", { month: "short", year: "2-digit" }),
			saved: grossSavedForCompany(tools, bucketEnd),
		});
	}
	return points;
}
