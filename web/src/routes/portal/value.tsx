import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { For, Show } from "solid-js";
import PortalLayout from "~/components/PortalLayout";
import { getClientUserQuery, getClientValueQuery } from "~/lib/client-queries";
import { usd } from "~/lib/value";
import { SIGNAL_RED } from "~/brand/logo";
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@basaltac/ui";

/** Cumulative gross-savings line — inline SVG, no chart dependency. */
function SavingsChart(props: { series: { label: string; saved: number }[] }) {
	const w = 560;
	const h = 180;
	const pad = 30;
	const pts = props.series;
	const max = Math.max(...pts.map((p) => p.saved), 1);
	const stepX = pts.length > 1 ? (w - pad * 2) / (pts.length - 1) : 0;
	const coords = pts.map((p, i) => ({
		x: pad + i * stepX,
		y: h - pad - (p.saved / max) * (h - pad * 2),
	}));
	const path = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

	return (
		<svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ "max-width": "640px" }} role="img" aria-label="Cumulative savings over time">
			<polyline points={path} fill="none" stroke={SIGNAL_RED} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
			<For each={coords}>
				{(c, i) => (
					<g>
						<circle cx={c.x} cy={c.y} r="3" fill={SIGNAL_RED} />
						<Show when={i() === 0 || i() === coords.length - 1}>
							<text x={c.x} y={h - 10} text-anchor={i() === 0 ? "start" : i() === coords.length - 1 ? "end" : "middle"} font-size="10" fill="#666">
								{pts[i()].label}
							</text>
						</Show>
					</g>
				)}
			</For>
			<text x={pad} y={pad - 10} font-size="10" fill="#666">{usd(max)}</text>
		</svg>
	);
}

export default function PortalValue() {
	const user = createMemo(() => getClientUserQuery(), { deferStream: true });
	const data = createMemo(() => getClientValueQuery(), { deferStream: true });

	return (
		<PortalLayout user={user()}>
			<Title>Value — Basalt Client Portal</Title>
			<h1 class="page-title">Value</h1>
			<p class="page-subtitle">Savings from replacing SaaS subscriptions with your own software</p>

			<Show when={data()} fallback={<p class="muted">Loading…</p>}>
				{(d) => (
					<Show
						when={d().tools.length > 0}
						fallback={<Card class="empty">No replaced tools yet — savings appear here as each one is cut over.</Card>}
					>
						{/* Headline + investment strip */}
						<div class="stat-grid" style={{ "margin-top": "24px" }}>
							<div class="stat-card">
								<div class="label">Saved to date</div>
								<div class="value">{usd(d().savedToDate)}</div>
							</div>
							<div class="stat-card">
								<div class="label">Tools replaced</div>
								<div class="value">{d().tools.filter((t) => t.cutoverDate).length}</div>
							</div>
							<div class="stat-card">
								<div class="label">Hours this month</div>
								<div class="value">{Math.round(d().hoursThisMonth * 10) / 10}</div>
							</div>
							<div class="stat-card">
								<div class="label">Hours total</div>
								<div class="value">{Math.round(d().totalHours * 10) / 10}</div>
							</div>
						</div>

						{/* Cumulative savings chart */}
						<Show when={d().series.length > 1}>
							<div style={{ "margin-top": "32px" }}>
								<div class="section-heading">Cumulative savings</div>
								<Card style={{ padding: "20px" }}>
									<SavingsChart series={d().series} />
								</Card>
							</div>
						</Show>

						{/* Replaced tools */}
						<div style={{ "margin-top": "32px" }}>
							<div class="section-heading">Replaced tools</div>
							<Table class="table">
								<TableHeader>
									<TableRow>
										<TableHead>Tool</TableHead>
										<TableHead>Was</TableHead>
										<TableHead>Cut over</TableHead>
										<TableHead>Saved to date</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									<For each={d().tools}>
										{(t) => (
											<TableRow>
												<TableCell>{t.name}</TableCell>
												<TableCell class="mono">{usd(t.monthlyCost)}/mo</TableCell>
												<TableCell class="muted">
													{t.cutoverDate ? new Date(t.cutoverDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "planned"}
												</TableCell>
												<TableCell class="mono" style={{ "font-weight": "500" }}>{usd(t.saved)}</TableCell>
											</TableRow>
										)}
									</For>
								</TableBody>
							</Table>
						</div>
					</Show>
				)}
			</Show>
		</PortalLayout>
	);
}
