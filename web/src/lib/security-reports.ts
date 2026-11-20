// Pure helpers for the /portal/security page and the signed-URL route.

export interface SecurityReportSummary {
	open?: number;
	new?: number;
	fixed?: number;
	accepted?: number;
	kev?: number;
}

/** One-line human summary of a report card's counts. */
export function summaryLine(summary: SecurityReportSummary | null | undefined): string {
	const s = summary ?? {};
	const parts: string[] = [];
	parts.push(`${s.open ?? 0} open`);
	if ((s.new ?? 0) > 0) parts.push(`${s.new} new`);
	if ((s.fixed ?? 0) > 0) parts.push(`${s.fixed} fixed`);
	if ((s.kev ?? 0) > 0) parts.push(`${s.kev} actively exploited`);
	return parts.join(" · ");
}

/** Storage paths are {companyId}/{weekOf}/report.{html,pdf}. A member may only
 *  touch paths under one of their own companies. */
export function reportPathAllowed(path: string, companyIds: string[]): boolean {
	if (!path || path.includes("..")) return false;
	return companyIds.some((id) => path.startsWith(`${id}/`));
}

/** "2026-11-16" → "Nov 16, 2026" (parse date parts only — no TZ drift). */
export function formatWeekOf(weekOf: string): string {
	const [y, m, d] = weekOf.split("-").map(Number);
	if (!y || !m || !d) return weekOf;
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}
