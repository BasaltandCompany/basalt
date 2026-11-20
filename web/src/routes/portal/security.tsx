import { Title } from "@solidjs/meta";
import { createMemo, For, Show } from "solid-js";
import PortalLayout from "~/components/PortalLayout";
import { getClientSecurityQuery, getClientUserQuery } from "~/lib/client-queries";
import { formatWeekOf, summaryLine, type SecurityReportSummary } from "~/lib/security-reports";
import { SIGNAL_RED } from "~/brand/logo";
import { Card } from "@basaltac/ui";

/** Weekly security reviews delivered by the security-review skill pipeline.
 *  Read-only: rows land service-side; HTML/PDF open through signed URLs. */
export default function PortalSecurity() {
	const user = createMemo(() => getClientUserQuery(), { deferStream: true });
	const data = createMemo(() => getClientSecurityQuery(), { deferStream: true });

	return (
		<PortalLayout user={user()}>
			<Title>Security — Basalt Client Portal</Title>
			<h1 class="page-title">Security</h1>
			<p class="page-subtitle">Weekly security reviews of your repos, websites, and systems</p>

			<Show when={data()} fallback={<p class="muted">Loading…</p>}>
				{(d) => (
					<Show
						when={d().reports.length > 0}
						fallback={<p class="muted">No security reports yet — your first weekly review will appear here.</p>}
					>
						<div style={{ "margin-top": "24px", display: "grid", gap: "16px" }}>
							<For each={d().reports}>
								{(r) => {
									const summary = r.summary as SecurityReportSummary;
									return (
										<Card style={{ padding: "20px" }}>
											<div style={{ display: "flex", "justify-content": "space-between", gap: "12px", "flex-wrap": "wrap" }}>
												<div>
													<div style={{ "font-weight": 600 }}>{r.title}</div>
													<div class="muted" style={{ "font-size": "13px", "margin-top": "2px" }}>
														Week of {formatWeekOf(r.weekOf)} · {r.companyName}
													</div>
												</div>
												<Show when={(summary?.kev ?? 0) > 0}>
													<span
														style={{
															background: SIGNAL_RED,
															color: "#fff",
															"font-size": "11px",
															padding: "3px 8px",
															"letter-spacing": "0.08em",
															"font-weight": "600",
														}}
													>
														{summary.kev} actively exploited
													</span>
												</Show>
											</div>

											<Show when={r.verdict}>
												<p style={{ "margin-top": "10px" }}>{r.verdict}</p>
											</Show>
											<div class="muted" style={{ "font-size": "13px", "margin-top": "8px" }}>
												{summaryLine(summary)}
											</div>

											<div style={{ display: "flex", gap: "16px", "margin-top": "14px", "font-size": "14px" }}>
												<a href={`/api/security-report?path=${encodeURIComponent(r.htmlPath)}`}>View report ↗</a>
												<a href={`/api/security-report?path=${encodeURIComponent(r.pdfPath)}&download=1`}>Download PDF</a>
											</div>
										</Card>
									);
								}}
							</For>
						</div>
					</Show>
				)}
			</Show>
		</PortalLayout>
	);
}
