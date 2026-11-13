import { Title } from "@solidjs/meta";
import { A, createAsync } from "@solidjs/router";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import Layout from "~/components/Layout"
import { toast } from "~/lib/toast"

const errT = (m: string) => toast(m, "error");
const okT = (m: string) => toast(m, "success");;
import { getUserQuery } from "~/lib/queries";

type Stage = { key: string; label: string; gate: string; method: string };
type Funnel = { id: string; name: string; description: string | null; stages: Stage[]; archivedAt: string | null };
type Run = { id: string; funnelId: string; funnelName: string; source: string; status: string; note: string | null; createdAt: string; closedAt: string | null };

const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Funnels — staged ICP verification. A run is one pull of companies; each item
// walks the funnel's stages until it passes all (auto-promotes to Outreach) or
// fails one (stays as audit). Finished funnels are archived (never deleted) —
// they grey out below the runs table and drop out of the New-run dropdown.
export default function AdminFunnels() {
	createAsync(() => getUserQuery(), { deferStream: true });
	const [funnels, setFunnels] = createSignal<Funnel[]>([]);
	const [runs, setRuns] = createSignal<Run[]>([]);
	const [itemCounts, setItemCounts] = createSignal<Record<string, number>>({});

	async function refresh() {
		const r = await fetch("/api/funnels");
		if (!r.ok) return errT((await r.json().catch(() => ({})) as { error?: string }).error ?? "Load failed");
		const body = (await r.json()) as { funnels: Funnel[]; runs: Run[]; itemCounts: Record<string, number> };
		setFunnels(body.funnels);
		setRuns(body.runs);
		setItemCounts(body.itemCounts ?? {});
	}
	onMount(() => void refresh());

	const active = createMemo(() => funnels().filter((f) => !f.archivedAt));
	const archived = createMemo(() =>
		funnels()
			.filter((f) => f.archivedAt)
			.sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : -1)),
	);

	async function createRun(e: Event) {
		e.preventDefault();
		errT("");
		const fd = new FormData(e.target as HTMLFormElement);
		const r = await fetch("/api/funnels", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ funnelId: String(fd.get("funnelId")), source: String(fd.get("source")), note: String(fd.get("note") ?? "") }),
		});
		const body = (await r.json()) as { error?: string; run?: Run };
		if (!r.ok || !body.run) return errT(body.error ?? "Create failed");
		location.href = `/admin/funnels/${body.run.id}`;
	}

	async function setArchived(f: Funnel, toArchive: boolean) {
		if (toArchive) {
			const runCount = runs().filter((r) => r.funnelId === f.id).length;
			if (!confirm(`Archive "${f.name}"? ${runCount} run(s), ${itemCounts()[f.id] ?? 0} item(s) stay restorable — nothing is deleted.`)) return;
		}
		const r = await fetch("/api/funnels/archive", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ funnelId: f.id, archived: toArchive }),
		});
		if (!r.ok) return errT((await r.json().catch(() => ({})) as { error?: string }).error ?? "Archive failed");
		okT(toArchive ? `Archived ${f.name}` : `${f.name} restored`);
		void refresh();
	}

	return (
		<Layout>
			<Title>Funnels</Title>
			<h1 class="page-title">Funnels</h1>
			<p class="page-subtitle">Staged ICP verification — pull companies in, work them through the gates, survivors promote to Outreach.</p>

			<For each={active()}>
				{(f) => (
					<div class="card" style={{ "margin-bottom": "16px" }}>
						<h2 style={{ "font-size": "15px", margin: "0 0 4px" }}>{f.name}</h2>
						<Show when={f.description}><p class="muted" style={{ margin: "0 0 8px", "font-size": "13px" }}>{f.description}</p></Show>
						<div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>
							<For each={f.stages}>
								{(s, i) => (
									<span class="badge" title={s.gate}>{i() + 1}. {s.label} <span class="muted">({s.method})</span></span>
								)}
							</For>
						</div>
						<button class="btn" style={{ "margin-top": "8px" }} onClick={() => void setArchived(f, true)}>Archive</button>
					</div>
				)}
			</For>

			<div class="card" style={{ "margin-bottom": "16px" }}>
				<h2 style={{ "font-size": "15px", margin: "0 0 8px" }}>New run</h2>
				<form class="form-row" onSubmit={createRun}>
					<select name="funnelId" required>
						<For each={active()}>{(f) => <option value={f.id}>{f.name}</option>}</For>
					</select>
					<select name="source">
						<option value="paste">paste</option>
						<option value="importyeti">importyeti</option>
						<option value="fmcsa">fmcsa</option>
						<option value="mixed">mixed</option>
					</select>
					<input name="note" placeholder="note (e.g. ImportYeti pull, Sep 29)" />
					<button type="submit" class="btn btn-primary">Open run</button>
				</form>
			</div>

			<table class="table">
				<thead>
					<tr><th>Run</th><th>Funnel</th><th>Source</th><th>Status</th><th>Opened</th></tr>
				</thead>
				<tbody>
					<For each={runs()}>
						{(r) => (
							<tr>
								<td><A href={`/admin/funnels/${r.id}`}>{r.note || r.id.slice(0, 8)}</A></td>
								<td>{r.funnelName}</td>
								<td>{r.source}</td>
								<td>{r.status === "open" ? <span class="badge badge-active">open</span> : <span class="muted">closed</span>}</td>
								<td class="muted">{fmtDate(r.createdAt)}</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
			<Show when={runs().length === 0}>
				<p class="empty">No runs yet — open one above, then import companies (paste, or <code class="mono">freight-pull.ts</code>).</p>
			</Show>

			<Show when={archived().length > 0}>
				<h2 class="muted" style={{ "font-size": "15px", margin: "48px 0 12px" }}>Archived</h2>
				<For each={archived()}>
					{(f) => (
						<div class="card" style={{ "margin-bottom": "12px", opacity: "0.55" }}>
							<h2 class="muted" style={{ "font-size": "15px", margin: "0 0 4px" }}>
								{f.name} <span class="muted" style={{ "font-weight": "normal" }}>archived {fmtDate(f.archivedAt!)}</span>
							</h2>
							<Show when={f.description}><p class="muted" style={{ margin: "0 0 8px", "font-size": "13px" }}>{f.description}</p></Show>
							<div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px", "margin-bottom": "8px" }}>
								<For each={f.stages}>
									{(s, i) => (
										<span class="badge" title={s.gate}>{i() + 1}. {s.label} <span class="muted">({s.method})</span></span>
									)}
								</For>
							</div>
							<button class="btn" onClick={() => void setArchived(f, false)}>Unarchive</button>
						</div>
					)}
				</For>
			</Show>
		</Layout>
	);
}
