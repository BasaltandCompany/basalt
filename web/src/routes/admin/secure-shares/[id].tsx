import { Title } from "@solidjs/meta";
import { createMemo } from "solid-js";
import { revalidate, useNavigate, useParams } from "@solidjs/router";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import ConfirmButton from "~/components/ConfirmButton";
import Layout from "~/components/Layout";
import { getShareDetail } from "~/lib/secure-share-queries";
import { Button } from "@basaltac/ui";

const IDLE_LOCK_MS = 30_000; // his number — contents blur after 30s without input
const fmtBytes = (n: number | null) =>
	n === null ? "—" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export default function SecureShareDetail() {
	const params = useParams();
	const navigate = useNavigate();
	const detail = createMemo(() => getShareDetail(params.id ?? ""), { deferStream: true });
	const [copied, setCopied] = createSignal(false);
	const [viewed, setViewed] = createSignal<{ id: string; text: string } | null>(null);
	const [viewError, setViewError] = createSignal("");

	// Auto-lock: any input re-reveals and restarts the idle timer; 30s idle blurs.
	const [locked, setLocked] = createSignal(false);
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	function armTimer() {
		clearTimeout(idleTimer);
		idleTimer = setTimeout(() => setLocked(true), IDLE_LOCK_MS);
	}
	function wake() {
		setLocked(false);
		armTimer();
	}
	onSettled(() => {
		if (typeof window === "undefined") return; // onSettled runs on the server too
		armTimer();
		for (const ev of ["pointermove", "pointerdown", "keydown"]) document.addEventListener(ev, wake);
	});
	onCleanup(() => {
		clearTimeout(idleTimer);
		for (const ev of ["pointermove", "pointerdown", "keydown"]) document.removeEventListener(ev, wake);
	});

	async function viewText(item: { id: string; kind: string }) {
		setViewError("");
		const r = await fetch(`/api/secure-items/${item.id}?format=text`);
		const body = (await r.json()) as { text?: string; error?: string };
		if (!r.ok || body.text === undefined) {
			setViewError(body.error ?? "Decrypt failed");
			return;
		}
		setViewed({ id: item.id, text: body.text });
	}

	async function toggleStatus(status: "open" | "closed") {
		await fetch(`/api/secure-shares/${params.id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ status }),
		});
		void revalidate();
	}

	async function remove() {
		const r = await fetch(`/api/secure-shares/${params.id}`, { method: "DELETE" });
		if (!r.ok) return { error: ((await r.json()) as { error?: string }).error ?? "Delete failed" };
		navigate("/admin/secure-shares");
	}

	const statusLabel = () => {
		const s = detail()?.share;
		if (!s) return "";
		return s.expiresAt && new Date(s.expiresAt).getTime() < Date.now() ? "expired" : s.status;
	};

	return (
		<Layout>
			<Title>{detail()?.share?.title ?? "Secure share"} — Basalt</Title>
			<Show when={detail()} fallback={<p class="muted">Loading…</p>}>
				{(d) => (
					<>
						<h1 class="page-title" style={{ display: "flex", "justify-content": "space-between", "align-items": "center", gap: "16px", "margin-bottom": "4px" }}>
							{d().share.title}
							<span style={{ display: "inline-flex", gap: "8px" }}>
								<Button variant="outline" size="sm" type="button" onClick={() => void toggleStatus(d().share.status === "open" ? "closed" : "open")}>
									{d().share.status === "open" ? "Close link" : "Reopen link"}
								</Button>
								<ConfirmButton label="Delete" danger onConfirm={remove} />
							</span>
						</h1>
						<p class="page-subtitle">
							{statusLabel()}
							<Show when={d().share.projectName}> · {d().share.projectName}</Show>
							<Show when={d().share.expiresAt}> · expires {new Date(d().share.expiresAt!).toLocaleDateString()}</Show>
							<Show when={d().share.note}> · note: {d().share.note}</Show>
						</p>

						<div style={{ margin: "16px 0", padding: "12px", border: "1px solid #ddd" }}>
							<div style={{ "font-size": "12px", color: "#666", "margin-bottom": "6px" }}>Guest upload link</div>
							<code style={{ "font-size": "13px", "word-break": "break-all" }}>{location.origin}/drop/{d().share.token}</code>
							<Button
								variant="outline"
								size="sm"
								type="button"
								style={{ "margin-left": "12px" }}
								onClick={() => {
									void navigator.clipboard.writeText(`${location.origin}/drop/${d().share.token}`);
									setCopied(true);
									setTimeout(() => setCopied(false), 1200);
								}}
							>
								{copied() ? "Copied" : "Copy"}
							</Button>
						</div>

						<h2 style={{ "font-size": "16px", "margin": "24px 0 8px" }}>Uploaded items ({d().items.length})</h2>
						<Show when={d().items.length > 0} fallback={<p class="muted">Nothing uploaded yet.</p>}>
							<table style={{ width: "100%", "border-collapse": "collapse", "font-size": "14px" }}>
								<tbody>
									<For each={d().items}>
										{(item) => (
											<tr style={{ "border-bottom": "1px solid #eee" }}>
												<td style={{ padding: "8px" }}>{item.label}</td>
												<td style={{ padding: "8px", color: "#666" }}>{item.kind}</td>
												<td style={{ padding: "8px", "font-variant-numeric": "tabular-nums" }}>{fmtBytes(item.sizeBytes)}</td>
												<td style={{ padding: "8px", color: "#666" }}>{item.uploaderLabel ?? "—"}</td>
												<td style={{ padding: "8px", color: "#666" }}>{new Date(item.createdAt).toLocaleString()}</td>
												<td style={{ padding: "8px", "text-align": "right" }}>
													<Show
														when={item.kind === "file"}
														fallback={
															<Button variant="outline" size="sm" type="button" onClick={() => void viewText(item)}>
																View
															</Button>
														}
													>
														<Button variant="outline" size="sm" type="button" onClick={() => location.assign(`/api/secure-items/${item.id}`)}>
															Download
														</Button>
													</Show>
												</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</Show>

						<Show when={viewError()}>
							<p style={{ color: "#a02020", "margin-top": "12px" }}>{viewError()}</p>
						</Show>
						<Show when={viewed()}>
							{(v) => (
								<div style={{ position: "relative", "margin-top": "20px" }}>
									<div style={{ "font-size": "12px", color: "#666", "margin-bottom": "6px" }}>
										Decrypted contents — blurs after 30s idle
									</div>
									<pre
										style={{
											position: "relative",
											margin: "0",
											padding: "14px",
											background: "#f6f6f6",
											border: "1px solid #ddd",
											"white-space": "pre-wrap",
											"word-break": "break-all",
											"max-height": "480px",
											overflow: "auto",
											filter: locked() ? "blur(10px)" : "none",
											"pointer-events": locked() ? "none" : "auto",
											transition: "filter 0.15s",
										}}
									>
										{v().text}
									</pre>
									<Show when={locked()}>
										<button
											type="button"
											onClick={wake}
											style={{
												position: "absolute",
												inset: "0",
												width: "100%",
												display: "flex",
												"align-items": "center",
												"justify-content": "center",
												background: "transparent",
												border: "none",
												cursor: "pointer",
												"font-size": "15px",
												color: "#0a0a0a",
											}}
										>
											Locked — click to reveal
										</button>
									</Show>
								</div>
							)}
						</Show>
					</>
				)}
			</Show>
		</Layout>
	);
}
