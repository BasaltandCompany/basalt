import { Title } from "@solidjs/meta";
import { useParams, useAction } from "@solidjs/router";
import { createMemo, For, Show, createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

import Layout from "~/components/Layout";
import SelectField from "~/components/select-field";
import { toast } from "~/lib/toast";
import { getUserQuery } from "~/lib/queries";
import {
	getQuoteQuery,
	getProjectsForSelectQuery,
	updateQuoteMetaAction,
	upsertQuoteItemAction,
	deleteQuoteItemAction,
	setQuoteStatusAction,
} from "~/lib/admin-queries";
import { money } from "~/lib/quotes";
import { Button, Card } from "@basaltac/ui";

const statusBadge: Record<string, string> = {
	draft: "badge-paused",
	sent: "badge-active",
	accepted: "badge-completed",
	rejected: "badge-paused",
};

type ItemLike = { id: string; name: string; detail: string | null; hours: number; unitRate: number; sortOrder: number };

// ponytail: field-sizing: content does this natively in Chrome/Edge 123+; JS fit is the Safari/Firefox fallback. Drop fit() once Safari ships field-sizing.
const canFieldSize = typeof CSS !== "undefined" && !!CSS.supports?.("field-sizing", "content");
function fit(el: HTMLTextAreaElement) {
	if (canFieldSize) return;
	el.style.height = "auto";
	el.style.height = `${el.scrollHeight}px`;
}

if (!canFieldSize && typeof document !== "undefined") {
	const refitAll = () => document.querySelectorAll<HTMLTextAreaElement>("textarea[name='detail']").forEach(fit);
	// late web-font load and window resizes invalidate the measured height; re-fit so fallback browsers self-heal instead of flapping
	document.fonts.ready.then(refitAll);
	window.addEventListener("resize", refitAll);
}

function ItemRows(props: {
	items: ItemLike[];
	quoteId: string;
	group: "required" | "optional";
	totalHours: number;
	subtotal: number;
	totalLabel: string;
}) {
	const save = useAction(upsertQuoteItemAction);
	const remove = useAction(deleteQuoteItemAction);
	const [busy, setBusy] = createSignal(false);

	async function submit(e: SubmitEvent, action: (fd: FormData) => Promise<unknown>) {
		e.preventDefault();
		setBusy(true);
		const res = (await action(new FormData(e.currentTarget as HTMLFormElement))) as { error?: string; success?: string };
		setBusy(false);
		if (res?.error) toast(res.error, "error");
		else if (res?.success) toast(res.success, "success");
	}

	const rowStyle: JSX.CSSProperties = {
		display: "flex",
		gap: "8px",
		"align-items": "center",
		padding: "8px 0",
		"border-bottom": "1px solid var(--border, #eee)",
		"flex-wrap": "wrap",
	};

	return (
		<div style={{ "margin-bottom": "24px" }}>
			<h2 style={{ "font-size": "16px", margin: "0 0 12px" }}>
				{props.group === "required" ? "Required line items" : "Optional add-ons"}{" "}
				<span class="muted">— {props.totalHours}h · {money(props.subtotal)}</span>
			</h2>
			<Show when={props.items.length > 0} fallback={<p class="muted">No lines yet.</p>}>
				<For each={props.items}>
					{(item) => (
						<div style={rowStyle}>
							<form style={{ display: "flex", gap: "8px", "align-items": "center", flex: "1", "flex-wrap": "wrap" }} onSubmit={(e) => submit(e, (fd) => save(fd))}>
								<input type="hidden" name="quote_id" value={props.quoteId} />
								<input type="hidden" name="item_id" value={item.id} />
								<input type="hidden" name="group" value={props.group} />
								<input name="sort_order" type="number" value={item.sortOrder} style={{ width: "52px" }} title="Sort order" />
								<input name="name" value={item.name} required style={{ width: "180px" }} />
								<textarea name="detail" rows={1} ref={fit} onInput={(e) => fit(e.currentTarget)} style={{ flex: "1", "min-width": "160px", "min-height": "64px", resize: "vertical", "field-sizing": "content" }}>{item.detail ?? ""}</textarea>
								<input name="hours" type="number" step="0.5" value={item.hours} style={{ width: "80px" }} title="Hours" />
								<input name="unit_rate" type="number" step="1" value={item.unitRate} style={{ width: "100px" }} title="Rate" />
								<span class="mono" style={{ "min-width": "80px", "text-align": "right" }}>{money(item.hours * item.unitRate)}</span>
								<Button type="submit" size="sm" variant="outline" disabled={busy()}>Save</Button>
							</form>
							<form onSubmit={(e) => submit(e, (fd) => remove(fd))}>
								<input type="hidden" name="quote_id" value={props.quoteId} />
								<input type="hidden" name="item_id" value={item.id} />
								<Button type="submit" size="sm" variant="ghost" disabled={busy()} title="Delete line">✕</Button>
							</form>
						</div>
					)}
				</For>
			</Show>
			<div style={{ "text-align": "right", "font-weight": "600", padding: "8px 0" }}>
				{props.totalLabel} — {props.totalHours}h · {money(props.subtotal)}
			</div>
			<form style={{ display: "flex", gap: "8px", "align-items": "center", "margin-top": "8px", "flex-wrap": "wrap" }} onSubmit={(e) => submit(e, (fd) => save(fd))}>
				<input type="hidden" name="quote_id" value={props.quoteId} />
				<input type="hidden" name="group" value={props.group} />
				<input name="sort_order" type="number" value={props.items.length + 1} style={{ width: "52px" }} title="Sort order" />
				<input name="name" placeholder="Line item name" required style={{ width: "180px" }} />
							<textarea name="detail" rows={1} ref={fit} onInput={(e) => fit(e.currentTarget)} placeholder="What it covers" style={{ flex: "1", "min-width": "160px", "min-height": "48px", resize: "vertical", "field-sizing": "content" }} />
				<input name="hours" type="number" step="0.5" placeholder="Hours" style={{ width: "80px" }} />
				<input name="unit_rate" type="number" step="1" placeholder="Rate" style={{ width: "100px" }} />
				<Button type="submit" size="sm" disabled={busy()}>Add line</Button>
			</form>
		</div>
	);
}

export default function AdminQuoteDetail() {
	const params = useParams();
	const user = createMemo(() => getUserQuery(), { deferStream: true });
	const quote = createMemo(() => getQuoteQuery(params.id ?? ""), { deferStream: true });
	const projects = createMemo(() => getProjectsForSelectQuery(), { deferStream: true });
	const setStatus = useAction(setQuoteStatusAction);
	const saveMeta = useAction(updateQuoteMetaAction);

	async function changeStatus(status: string) {
		const fd = new FormData();
		fd.set("id", params.id ?? "");
		fd.set("status", status);
		const res = (await setStatus(fd)) as { error?: string; success?: string };
		if (res?.error) toast(res.error, "error");
		else if (res?.success) toast(res.success, "success");
	}

	async function saveHeader(e: SubmitEvent) {
		e.preventDefault();
		const res = (await saveMeta(new FormData(e.currentTarget as HTMLFormElement))) as { error?: string; success?: string };
		if (res?.error) toast(res.error, "error");
		else if (res?.success) toast(res.success, "success");
	}

	return (
		<Layout user={user()}>
			<Title>Quote — Basalt</Title>
			<Show when={quote()} fallback={<p class="muted">Loading…</p>}>
				{(q) => (
					<div>
						<div style={{ display: "flex", "justify-content": "space-between", "align-items": "flex-start", gap: "16px", "margin-bottom": "24px" }}>
							<div>
								<h1 class="page-title">{q().title}</h1>
								<p class="page-subtitle" style={{ "margin-bottom": "8px" }}>
									{q().companyName}
									<Show when={q().projectName}> · project: {q().projectName}</Show>
									{" · "}
									<span class={`badge ${statusBadge[q().status] ?? "badge-paused"}`}>{q().status}</span>
								</p>
								<div style={{ display: "flex", gap: "8px" }}>
									<Show when={q().status !== "sent"}>
										<Button size="sm" onClick={() => changeStatus("sent")}>Mark sent</Button>
									</Show>
									<Show when={q().status === "sent"}>
										<Button size="sm" onClick={() => changeStatus("accepted")}>Mark accepted</Button>
										<Button size="sm" variant="outline" onClick={() => changeStatus("rejected")}>Mark rejected</Button>
									</Show>
									<Show when={q().status !== "draft"}>
										<Button size="sm" variant="outline" onClick={() => changeStatus("draft")}>Back to draft</Button>
									</Show>
								</div>
								<p class="muted" style={{ "font-size": "12px", "margin-top": "8px" }}>
									Sending snapshots the lines as a version. Accepted syncs the project's fixed price to the everything-in total. Clients sign in the portal.
								</p>
							</div>
							<div style={{ display: "flex", "flex-direction": "column", gap: "8px", "align-items": "flex-end" }}>
								<Show when={q().bodyDoc}>
									<Button as="a" size="sm" variant="outline" href={`/admin/docs/${q().bodyDoc!.id}`}>
										Edit body prose ↗
									</Button>
										{/* download attr: without it the solid router intercepts the click and
client-side-navigates to the API URL — no file ever downloads. Skips interception
for a native same-tab download (Content-Disposition still names the file). */}
										<Button as="a" size="sm" variant="outline" href={`/api/quotes/${q().id}/pdf`} download="">
											PDF
										</Button>
								</Show>
							</div>
						</div>

						<div style={{ display: "flex", gap: "16px", "flex-wrap": "wrap", "margin-bottom": "24px" }}>
							<Card style={{ flex: "1", "min-width": "260px", padding: "16px" }}>
								<div class="muted" style={{ "font-size": "12px" }}>Base subtotal (required)</div>
								<div class="mono" style={{ "font-size": "20px", "font-weight": "600" }}>{money(q().totals.required.subtotal)}</div>
								<div class="muted">{q().totals.required.hours}h across {q().totals.required.count} lines</div>
							</Card>
							<Show when={q().totals.optional.count > 0}>
								<Card style={{ flex: "1", "min-width": "260px", padding: "16px" }}>
									<div class="muted" style={{ "font-size": "12px" }}>Optional add-ons</div>
									<div class="mono" style={{ "font-size": "20px", "font-weight": "600" }}>{money(q().totals.optional.subtotal)}</div>
									<div class="muted">{q().totals.optional.hours}h across {q().totals.optional.count} lines</div>
								</Card>
							</Show>
							<Card style={{ flex: "1", "min-width": "260px", padding: "16px" }}>
								<div class="muted" style={{ "font-size": "12px" }}>Everything-in total</div>
								<div class="mono" style={{ "font-size": "20px", "font-weight": "600" }}>{money(q().totals.total)}</div>
								<Show when={q().quotedCapHours} fallback={<div class="muted">no hour cap</div>}>
									<div class="muted">cap: {q().quotedCapHours}h</div>
								</Show>
							</Card>
						</div>

						<ItemRows
							items={q().items.filter((i) => i.group === "required")}
							quoteId={q().id}
							group="required"
							totalHours={q().totals.required.hours}
							subtotal={q().totals.required.subtotal}
							totalLabel={q().totals.optional.count > 0 ? "Base subtotal" : "Total"}
						/>
						<ItemRows
							items={q().items.filter((i) => i.group === "optional")}
							quoteId={q().id}
							group="optional"
							totalHours={q().totals.optional.hours}
							subtotal={q().totals.optional.subtotal}
							totalLabel="Everything-in total"
						/>

						<div style={{ display: "flex", gap: "16px", "flex-wrap": "wrap" }}>
							<Card style={{ flex: "1", "min-width": "300px", padding: "16px" }}>
								<h2 style={{ "font-size": "16px", margin: "0 0 12px" }}>Header</h2>
								<form onSubmit={saveHeader} style={{ display: "grid", gap: "8px" }}>
									<input type="hidden" name="id" value={q().id} />
									<label class="muted" style={{ "font-size": "12px" }}>
										Title
										<input name="title" value={q().title} style={{ width: "100%" }} />
									</label>
									<label class="muted" style={{ "font-size": "12px" }}>
										Project (enables variance)
										<SelectField
											name="project_id"
											value={q().projectId ?? null}
											options={[{ value: "", label: "— none —" }, ...(projects() ?? []).map((p) => ({ value: p.id, label: p.name }))]}
										/>
									</label>
									<div style={{ display: "flex", gap: "8px" }}>
										<label class="muted" style={{ "font-size": "12px", flex: "1" }}>
											Valid days
											<input name="valid_days" type="number" value={q().validDays} style={{ width: "100%" }} />
										</label>
										<label class="muted" style={{ "font-size": "12px", flex: "1" }}>
											Hour cap (blank = none)
											<input name="quoted_cap_hours" type="number" value={q().quotedCapHours ?? ""} style={{ width: "100%" }} />
										</label>
									</div>
									<div style={{ display: "flex", gap: "8px" }}>
										<label class="muted" style={{ "font-size": "12px", flex: "1" }}>
											Start date
											<input name="start_date" type="date" value={q().startDate ?? ""} style={{ width: "100%" }} />
										</label>
										<label class="muted" style={{ "font-size": "12px", flex: "1" }}>
											End date
											<input name="end_date" type="date" value={q().endDate ?? ""} style={{ width: "100%" }} />
										</label>
									</div>
									<Button type="submit" size="sm">Save header</Button>
								</form>
							</Card>

							<Show when={q().actuals}>
								{(a) => (
									<Card style={{ flex: "1", "min-width": "300px", padding: "16px" }}>
										<h2 style={{ "font-size": "16px", margin: "0 0 12px" }}>Actuals vs quote</h2>
										<div style={{ display: "grid", gap: "4px", "font-size": "14px" }}>
											<span>Hours logged: <b>{a().hours.total}</b> ({a().hours.billable} billable)</span>
											<span>Labor cost: <b>{money(a().laborCost)}</b> (billable × {money(a().project.hourlyRate)}/h)</span>
											<span>Invoiced: <b>{money(a().invoiced.total)}</b></span>
											<Show when={a().quote}>
												<span>Quoted: <b>{money(a().quote!.total)}</b></span>
												<span>Variance (labor − quote): <b>{money(a().variance ?? 0)}</b></span>
												<Show when={a().varianceVsCap !== null && a().quote?.quotedCapHours}>
													<span>Vs cap: <b>{a().varianceVsCap! > 0 ? `+${a().varianceVsCap}` : a().varianceVsCap}h</b> against the {a().quote!.quotedCapHours}h cap</span>
												</Show>
											</Show>
										</div>
									</Card>
								)}
							</Show>

							<Card style={{ flex: "1", "min-width": "300px", padding: "16px" }}>
								<h2 style={{ "font-size": "16px", margin: "0 0 12px" }}>Versions & signatures</h2>
								<Show when={q().versions.length > 0} fallback={<p class="muted">No versions yet — they snapshot on every status change.</p>}>
									<For each={q().versions}>
										{(v) => (
											<div style={{ "font-size": "13px" }}>
												v{v.version} · {v.status} · {money(v.subtotal)} · {v.createdAt.toLocaleString()}
											</div>
										)}
									</For>
								</Show>
								<Show when={q().signatures.length > 0}>
									<div style={{ "margin-top": "12px" }}>
										<For each={q().signatures}>
											{(s) => (
												<div style={{ "font-size": "13px" }}>
													✍ {s.signerName} · {s.createdAt.toLocaleString()}
												</div>
											)}
										</For>
									</div>
								</Show>
							</Card>
						</div>
					</div>
				)}
			</Show>
		</Layout>
	);
}
