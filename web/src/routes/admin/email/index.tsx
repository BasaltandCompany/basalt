import { Title } from "@solidjs/meta";
import { createAsync, revalidate, useAction, useSearchParams } from "@solidjs/router";
import { For, Show, createSignal, createEffect, createMemo, onMount, onCleanup } from "solid-js";
import Layout from "~/components/Layout";
import { VoiceLintPanel } from "~/components/VoiceLintPanel";
import { LintedTextarea } from "~/components/LintedTextarea";
import type { LintResult } from "~/lib/voice-lint";
import {
	getInboxQuery,
	syncEmailAction,
	getEmailStatusQuery,
} from "~/lib/email-queries";
import type { EmailThread, EmailMessage, EmailOutbox } from "~/db/schema";
import { SIGNATURES } from "~/lib/email-signature";
import { Button } from "@basaltac/ui";

type DraftVersionRow = { id: string; version: number; author: string; createdAt: string; updatedAt: string };
type DraftDiffPart = { added?: boolean; removed?: boolean; value: string };

// Hotkeys mirror macro: j/k move + open, h/l list↔pane, e archive, shift+e
// unarchive, u unread, r reply, f forward, c compose, / search, Esc close.
// t theater mode (n/p walk messages, space pages, j/k switches threads).
// V = visual multi-select: j/k extend the range, then e/u/!/# act on all of it.

type ThreadFull = { thread: EmailThread; messages: EmailMessage[] };

// newest-first thread body, shared by the reading pane and theater mode:
// index 0 (the latest message) renders expanded, every earlier message
// collapses to a one-liner underneath — click to expand
const ThreadMessages = (props: { messages: EmailMessage[]; openMsg: number; onOpen: (i: number) => void }) => (
	<For each={props.messages}>
		{(m, i) =>
			i() === 0 || props.openMsg === i() ? (
				<div data-msg-idx={i()} style={{ "margin-bottom": "16px", "padding-bottom": "16px", "border-bottom": "1px solid rgba(0,0,0,0.08)" }}>
					<div class="muted" style={{ "font-size": "12px", "margin-bottom": "6px" }}>
						{m.fromName ?? m.fromEmail} · {new Date(m.date).toLocaleString()}
					</div>
					<Show
						when={m.bodyHtml}
						fallback={<pre style={{ "white-space": "pre-wrap", "font-family": "inherit", "font-size": "14px", margin: 0 }}>{m.bodyText}</pre>}
					>
						{(html) => (
							// untrusted email HTML: sandbox without allow-scripts = no JS can run;
							// allow-same-origin lets us auto-size; email CSS stays inside the frame
							<iframe
								sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
								srcdoc={html()}
								// dark reading: invert the email document (white→dark, black text→white);
								// imgs get un-inverted on load so photos/logos keep true colors
								style={{ width: "100%", border: "0", display: "block", "min-height": "160px", background: "#fff", filter: "invert(1) hue-rotate(180deg)" }}
								onLoad={(e) => {
									const doc = e.currentTarget.contentDocument;
									doc?.querySelectorAll("img").forEach((img) => (img.style.filter = "invert(1) hue-rotate(180deg)"));
									if (doc?.body) e.currentTarget.style.height = `${doc.body.scrollHeight}px`;
								}}
							/>
						)}
					</Show>
				</div>
			) : (
				<div
					data-msg-idx={i()}
					class="muted"
					style={{ "font-size": "13px", cursor: "pointer", "margin-bottom": "8px", "padding-bottom": "8px", "border-bottom": "1px solid rgba(0,0,0,0.08)" }}
					onClick={() => props.onOpen(i())}
				>
					{m.fromName ?? m.fromEmail} · {new Date(m.date).toLocaleString()} — {m.bodyText?.slice(0, 80)}…
				</div>
			)
		}
	</For>
);

export default function AdminEmail() {
	const status = createAsync(() => getEmailStatusQuery(), { deferStream: true });
	const [searchParams, setSearchParams] = useSearchParams();
	// folder lives in the URL so a search keeps the tab it was typed in
	const folder = (): "inbox" | "drafts" | "outbox" | "sent" =>
		searchParams.folder === "drafts" || searchParams.folder === "outbox" || searchParams.folder === "sent" ? searchParams.folder : "inbox";
	const setFolder = (f: "inbox" | "drafts" | "outbox" | "sent") => setSearchParams({ folder: f === "inbox" ? undefined : f });
	const activeQ = () => (typeof searchParams.q === "string" && searchParams.q ? searchParams.q : undefined);
	const inbox = createAsync(() => getInboxQuery({ q: activeQ() }), { deferStream: true });
	const sync = useAction(syncEmailAction);

	const [q, setQ] = createSignal(String(searchParams.q ?? ""));
	const [selected, setSelected] = createSignal<ThreadFull | null>(null);
	// newest-first display: the current message is index 0 and expanded; this is
	// the index of a manually expanded one, reset on every thread paint
	const [openMsg, setOpenMsg] = createSignal(-1);
	// theater mode — fullscreen focused read of the selected thread
	const [theater, setTheater] = createSignal(false);
	const [selIdx, setSelIdx] = createSignal(0);
	// optimistic triage state — ops mutate these instead of refetching the
	// whole list; the next sync (≤10min or the Sync button) reconciles
	const [hiddenIds, setHiddenIds] = createSignal<Set<string>>(new Set());
	const [readOverride, setReadOverride] = createSignal<Record<string, boolean>>({});
	const visibleThreads = () => (inbox()?.threads ?? []).filter((t) => !hiddenIds().has(t.id));
	const isUnread = (t: EmailThread) => readOverride()[t.id] ?? t.unread;
	// display order = newest first — the current message on top, the rest of
	// the thread underneath (data order untouched: r/f still read .at(-1))
	const shownMessages = () => [...(selected()?.messages ?? [])].reverse();
	// confirmation modal for destructive macros (spam / delete / unsubscribe)
	const [pending, setPending] = createSignal<{ title: string; body: string; confirm: string; danger: boolean; run: () => Promise<unknown> } | null>(null);
	// visual multi-select (V): range = anchor..cursor, ops apply to the range
	const [visMode, setVisMode] = createSignal(false);
	const [visAnchor, setVisAnchor] = createSignal(0);
	const visRangeIdx = () => [Math.min(visAnchor(), selIdx()), Math.max(visAnchor(), selIdx())] as const;
	const visRangeIds = (): string[] => {
		if (!visMode()) return [];
		const [a, b] = visRangeIdx();
		// visual mode indexes whatever list is up — inbox threads or draft rows
		const ids = folder() === "drafts" ? (inbox()?.drafts ?? []).map((d) => d.id) : visibleThreads().map((t) => t.id);
		return ids.slice(a, b + 1);
	};
	// draftId tracks the outbox row created by a Send click, so a lint-blocked
	// retry (or Send anyway) updates that same draft instead of duplicating one
	const [compose, setCompose] = createSignal<{ to: string; cc?: string; bcc?: string; subject: string; body: string; threadId?: string; draftId?: string } | null>(null);
	// Cc/Bcc inputs stay hidden until toggled (or already filled) — Gmail pattern
	const [showCcBcc, setShowCcBcc] = createSignal(false);
	// attachments: compose-side files ride client-side until the draft row exists;
	// the draft editor uploads/removes immediately via the attachments API
	const [composeFiles, setComposeFiles] = createSignal<File[]>([]);
	const ATTACH_MAX_FILE = 20 * 1024 * 1024;
	const ATTACH_MAX_TOTAL = 24 * 1024 * 1024; // Gmail rejects sends over 25MB
	const uploadAttachment = async (draftId: string, file: File): Promise<string | null> => {
		const fd = new FormData();
		fd.set("file", file);
		const res = await fetch(`/api/email/drafts/${draftId}/attachments`, { method: "POST", body: fd });
		const j = (await res.json().catch(() => ({}))) as { error?: string };
		if (!res.ok) return j.error ?? "attach failed";
		void revalidate("email-inbox");
		return null;
	};
	const removeAttachment = async (draftId: string, path: string) => {
		await fetch(`/api/email/drafts/${draftId}/attachments?path=${encodeURIComponent(path)}`, { method: "DELETE" });
		void revalidate("email-inbox");
	};
	const addComposeFiles = (list: FileList) => {
		const next = [...composeFiles()];
		for (const f of list) {
			if (f.size > ATTACH_MAX_FILE) flash(`${f.name}: over the 20MB per-file cap`);
			else next.push(f);
		}
		if (next.reduce((s, f) => s + f.size, 0) > ATTACH_MAX_TOTAL) {
			flash("Attachments total over 24MB — Gmail rejects sends that big");
			return;
		}
		setComposeFiles(next);
	};
	// client-side windowing over the full local corpus — no server pagination
	const [visibleCount, setVisibleCount] = createSignal(50);
	const [editBody, setEditBody] = createSignal<Record<string, string>>({});
	// locally edited to/subject — shown until the next list revalidate
	const [editMeta, setEditMeta] = createSignal<Record<string, { to?: string; subject?: string; cc?: string; bcc?: string; signature?: string }>>({});
	const [sendStatus, setSendStatus] = createSignal("");
	const [connecting, setConnecting] = createSignal(false);
	// per-draft CRDT history (Drafts tab); clicking a draft row opens the
	// corner editor for that draft id
	const [openDraft, setOpenDraft] = createSignal<string | null>(null);
	// stable row identity for the editor overlay: a refetch rebuilds the drafts
	// array, and a fresh object identity would remount the <Show keyed> editor —
	// killing focus/caret mid-typing (the 5s /api/changes revalidate fires after
	// every autosave PUT). Returning prev while the id is unchanged keeps the
	// overlay mounted; a missing row (close/send/discard/schedule) drops it, so
	// Close/Esc actually closes — the old `?? prev` kept the overlay alive forever.
	const openDraftRow = createMemo<EmailOutbox | undefined>((prev) => {
		const row = inbox()?.drafts.find((x) => x.id === openDraft());
		return row && prev?.id === row.id ? prev : row;
	});
	createEffect(() => {
		if (openDraft() && !inbox()?.drafts.find((x) => x.id === openDraft())) setOpenDraft(null);
	});
	const [openDraftHistory, setOpenDraftHistory] = createSignal<string | null>(null);
	const [draftVersions, setDraftVersions] = createSignal<Record<string, DraftVersionRow[]>>({});
	const [draftDiff, setDraftDiff] = createSignal<{ id: string; parts: DraftDiffPart[] | null } | null>(null);
	const draftSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
	// docs-style autosave feedback + inline voice lint for the draft overlay
	const [draftSaveState, setDraftSaveState] = createSignal<Record<string, string>>({});
	const [draftLint, setDraftLint] = createSignal<Record<string, LintResult | null>>({});
	const [lintStale, setLintStale] = createSignal<Record<string, boolean>>({});
	const draftLintTimers: Record<string, ReturnType<typeof setTimeout>> = {};
	const lintDraft = (outboxId: string, body: string) => {
		setLintStale({ ...lintStale(), [outboxId]: true });
		clearTimeout(draftLintTimers[outboxId]);
		draftLintTimers[outboxId] = setTimeout(async () => {
			const res = await fetch("/api/lint", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text: body, surface: "email" }),
			});
			if (res.ok) {
				setDraftLint({ ...draftLint(), [outboxId]: await res.json() });
				setLintStale({ ...lintStale(), [outboxId]: false });
			}
		}, 700);
	};
	// opening a draft lints its current body once (edits re-lint via editDraft)
	createEffect(() => {
		const id = openDraft();
		if (!id || draftLint()[id] !== undefined) return;
		lintDraft(id, editBody()[id] ?? inbox()?.drafts.find((d) => d.id === id)?.body ?? "");
	});

	// Linear/Superhuman trick: the pane paints from an in-memory thread cache
	// and neighbors are prefetched after each move — j/k almost always hits
	// memory. Session-scoped; ponytail: cached threads never refresh in the
	// background — a reply landing mid-session appears on next reload/sync.
	const threadCache = new Map<string, ThreadFull>();
	const cacheThread = (d: ThreadFull) => {
		if (threadCache.size > 100) threadCache.clear();
		threadCache.set(d.thread.id, d);
	};
	const prefetch = (t?: EmailThread) => {
		if (!t || threadCache.has(t.id)) return;
		void fetch(`/api/email/threads/${t.id}`)
			.then((r) => (r.ok ? (r.json() as Promise<ThreadFull>) : null))
			.then((d) => d && cacheThread(d))
			.catch(() => {});
	};
	// folder-aware nav list: j/k walks whatever tab is up — inbox rows, the
	// Sent tab's threads, or the Drafts/Outbox rows (activation differs).
	const listThreads = () =>
		folder() === "sent" ? (inbox()?.sent ?? []).map((s) => s.thread) : visibleThreads();
	// drafts/outbox have no threads — j/k moves a row cursor + activates
	const [selOutbox, setSelOutbox] = createSignal<string | null>(null);
	const activateNav = async (i: number) => {
		if (folder() === "drafts") {
			const d = inbox()?.drafts?.[i];
			setSelIdx(i);
			if (d) setOpenDraft(d.id);
			document.querySelectorAll("[data-thread-row]")[i]?.scrollIntoView({ block: "nearest" });
		} else if (folder() === "outbox") {
			const o = inbox()?.outbox?.[i];
			setSelIdx(i);
			setSelOutbox(o?.id ?? null);
			document.querySelectorAll("[data-thread-row]")[i]?.scrollIntoView({ block: "nearest" });
		}
	};

	// fast j/j/j fires overlapping fetches — abort the stale one so a slow
	// earlier response can't overwrite the newer selection (out-of-order race)
	let threadAbort: AbortController | null = null;
	const loadThread = async (t: EmailThread, i?: number) => {
		if (i !== undefined) setSelIdx(i);
		const idx = i ?? selIdx();
		const list = listThreads();
		prefetch(list[idx - 1]);
		prefetch(list[idx + 1]);
		const paint = (data: ThreadFull) => {
			setSelected(data);
			setOpenMsg(-1);
			const row = document.querySelectorAll("[data-thread-row]")[idx];
			row?.scrollIntoView({ block: "nearest" });
		};
		const markRead = (ac?: AbortController) => {
			if (!isUnread(t)) return;
			setReadOverride({ ...readOverride(), [t.id]: false }); // dim the dot now
			void fetch(`/api/email/threads/${t.id}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ op: "read" }),
				signal: ac?.signal,
			});
		};
		const hit = threadCache.get(t.id);
		if (hit) {
			paint(hit);
			markRead();
			return;
		}
		threadAbort?.abort();
		const ac = new AbortController();
		threadAbort = ac;
		try {
			const res = await fetch(`/api/email/threads/${t.id}`, { signal: ac.signal });
			if (!res.ok) return;
			const data = (await res.json()) as ThreadFull;
			if (ac.signal.aborted) return;
			cacheThread(data);
			paint(data);
			markRead(ac);
		} catch (e) {
			if ((e as Error).name !== "AbortError") throw e;
		}
	};

	const flash = (msg: string, ms = 6000) => {
		setSendStatus(msg);
		setTimeout(() => setSendStatus(""), ms);
	};

	const threadOp = async (id: string, op: string): Promise<boolean> => {
		const res = await fetch(`/api/email/threads/${id}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ op }),
		});
		if (!res.ok) {
			// surface server errors — silent no-ops looked like "delete is broken"
			const r = (await res.json().catch(() => ({}))) as { error?: string };
			flash(`failed: ${r.error ?? `HTTP ${res.status}`}`);
			return false;
		}
		const removing = op === "archive" || op === "spam" || op === "delete";
		if (removing) {
			setHiddenIds(new Set([...hiddenIds(), id]));
			// triage flow: keep the reading pane open on the next thread down —
			// the row that just slid into the removed row's slot
			const rest = visibleThreads().filter((t) => t.id !== id);
			const nextIdx = Math.min(selIdx(), rest.length - 1);
			const next = folder() === "inbox" ? rest[nextIdx] : undefined;
			if (next) {
				await loadThread(next, nextIdx);
				return true;
			}
		} else if (op === "unread") {
			setReadOverride({ ...readOverride(), [id]: true });
		} else if (op === "unarchive") {
			const next = new Set(hiddenIds());
			next.delete(id); // brings the row back into the inbox list
			setHiddenIds(next);
		}
		setSelected(null);
		return true;
	};

	// bulk apply over the visual selection: one fetch per thread, one revalidate
	// at the end (per-op revalidates would reload the cursor N times)
	const bulkOp = async (ids: string[], op: string) => {
		if (!ids.length) return;
		let ok = 0;
		let lastErr = "";
		for (const id of ids) {
			const res = await fetch(`/api/email/threads/${id}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ op }),
			});
			if (res.ok) ok++;
			else lastErr = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`;
		}
		if (op === "archive" || op === "spam" || op === "delete") {
			setHiddenIds(new Set([...hiddenIds(), ...ids]));
		} else if (op === "unread") {
			const overrides = { ...readOverride() };
			for (const id of ids) overrides[id] = true;
			setReadOverride(overrides);
		}
		setVisMode(false);
		setSelected(null);
		flash(lastErr ? `${op}: ${ok}/${ids.length} ok — last error: ${lastErr}` : `${op}: ${ok} threads`, 8000);
	};

	// draft id currently blocked by the voice send gate — its Send button
	// becomes "Send anyway", and overriding feeds the pattern-adaptation signal
	const [lintBlockedDraft, setLintBlockedDraft] = createSignal<string | null>(null);
	// per-draft schedule-send state — mirrors sendDraft's lint-gate UX
	const [schedInput, setSchedInput] = createSignal<Record<string, string>>({});
	const [lintBlockedSched, setLintBlockedSched] = createSignal<string | null>(null);
	const sendDraft = async (outboxId: string, overrideLint = false) => {
		setSendStatus("sending…");
		const res = await fetch(`/api/email/drafts/${outboxId}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ op: "send", body: editBody()[outboxId], overrideLint }),
		});
		const r = await res.json();
		if (r.ok) {
			setLintBlockedDraft(null);
			setSendStatus("sent");
			setTimeout(() => setSendStatus(""), 5000);
			void revalidate("email-inbox"); // move the row from drafts to Sent immediately
		} else if (r.blocked === "voice_lint") {
			const first = r.violations?.[0]?.rule ?? "voice issues";
			const more = (r.violations?.length ?? 1) - 1;
			setLintBlockedDraft(outboxId);
			setSendStatus(`voice lint: ${first}${more > 0 ? ` (+${more} more)` : ""} — fix the draft or send anyway`);
		} else {
			setLintBlockedDraft(null);
			setSendStatus(`failed: ${r.error}`);
		}
	};

	const discardDraft = async (outboxId: string) => {
		await fetch(`/api/email/drafts/${outboxId}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ op: "discard" }),
		});
		void revalidate("email-inbox");
	};

	const scheduleDraft = async (outboxId: string, overrideLint = false) => {
		const raw = schedInput()[outboxId];
		const when = raw ? new Date(raw) : null;
		if (!when || Number.isNaN(when.getTime())) {
			setSendStatus("pick a date/time first");
			return;
		}
		const res = await fetch(`/api/email/drafts/${outboxId}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ op: "schedule", sendAt: when.toISOString(), body: editBody()[outboxId], overrideLint }),
		});
		const r = await res.json();
		if (r.ok) {
			setLintBlockedSched(null);
			setSendStatus(`scheduled for ${when.toLocaleString()}`);
			setTimeout(() => setSendStatus(""), 5000);
			void revalidate("email-inbox");
		} else if (r.blocked === "voice_lint") {
			const first = r.violations?.[0]?.rule ?? "voice issues";
			setLintBlockedSched(outboxId);
			setSendStatus(`voice lint: ${first} — fix the draft or schedule anyway`);
		} else {
			setSendStatus(`failed: ${r.error}`);
		}
	};

	const unscheduleDraft = async (outboxId: string) => {
		await fetch(`/api/email/drafts/${outboxId}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ op: "unschedule" }),
		});
		void revalidate("email-inbox");
	};

	// draft autosave — debounced PUT for body/to/subject; body is CRDT-tracked
	// server-side (hunks into the Loro snapshot, coalesced version rows)
	const editDraft = (outboxId: string, patch: { body?: string; to?: string; subject?: string; cc?: string; bcc?: string; signature?: string }) => {
		if (patch.body !== undefined) {
			setEditBody({ ...editBody(), [outboxId]: patch.body });
			lintDraft(outboxId, patch.body);
		}
	if (patch.to !== undefined || patch.subject !== undefined || patch.cc !== undefined || patch.bcc !== undefined || patch.signature !== undefined) {
			setEditMeta({ ...editMeta(), [outboxId]: { ...editMeta()[outboxId], ...patch } });
		}
		clearTimeout(draftSaveTimers[outboxId]);
		setDraftSaveState({ ...draftSaveState(), [outboxId]: "saving…" });
		draftSaveTimers[outboxId] = setTimeout(async () => {
			const payload: Record<string, string> = {};
			if (editBody()[outboxId] !== undefined) payload.body = editBody()[outboxId];
			const m = editMeta()[outboxId];
			if (m?.to !== undefined) payload.to = m.to;
			if (m?.subject !== undefined) payload.subject = m.subject;
			if (m?.cc !== undefined) payload.cc = m.cc;
			if (m?.bcc !== undefined) payload.bcc = m.bcc;
			if (m?.signature !== undefined) payload.signature = m.signature;
			const res = await fetch(`/api/email/drafts/${outboxId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (res.ok) {
				setDraftSaveState({ ...draftSaveState(), [outboxId]: `saved ${new Date().toLocaleTimeString()}` });
				if (openDraftHistory() === outboxId) {
					const r = await fetch(`/api/email/drafts/${outboxId}?versions=1`);
					if (r.ok) setDraftVersions({ ...draftVersions(), [outboxId]: ((await r.json()) as { versions: DraftVersionRow[] }).versions });
				}
			} else {
				setDraftSaveState({ ...draftSaveState(), [outboxId]: "save failed" });
			}
		}, 1000);
	};

	const toggleDraftHistory = async (outboxId: string) => {
		if (openDraftHistory() === outboxId) {
			setOpenDraftHistory(null);
			return;
		}
		setOpenDraftHistory(outboxId);
		setDraftDiff(null);
		const r = await fetch(`/api/email/drafts/${outboxId}?versions=1`);
		if (r.ok) setDraftVersions({ ...draftVersions(), [outboxId]: ((await r.json()) as { versions: DraftVersionRow[] }).versions });
	};

	const showDraftDiff = async (outboxId: string, version: number) => {
		setDraftDiff({ id: outboxId, parts: null });
		const r = await fetch(`/api/email/drafts/${outboxId}?diff=${version}`);
		if (r.ok) setDraftDiff({ id: outboxId, parts: ((await r.json()) as { parts: DraftDiffPart[] }).parts });
	};

	const confirmPending = async () => {
		const p = pending();
		setPending(null);
		if (p) await p.run();
	};

	const askSpam = () => {
		const s = selected();
		if (!s) return;
		setPending({
			title: "Report spam?",
			body: `Mark "${s.thread.subject}" from ${s.thread.fromEmail} as spam and drop it from your inbox.`,
			confirm: "Report spam",
			danger: true,
			run: () => threadOp(s.thread.id, "spam"),
		});
	};

	// drafts-tab discard (single cursor draft or the visual range) — one
	// confirm for a batch; discard is a hard delete, no Gmail trash
	const askDraftDiscard = (ids: string[]) => {
		const n = ids.length;
		if (!n) return;
		setPending({
			title: `Discard ${n === 1 ? "draft" : `${n} drafts`}?`,
			body: n === 1 ? "Deleted for good — drafts don't go to Gmail trash." : `${n} drafts deleted for good — drafts don't go to Gmail trash.`,
			confirm: "Discard",
			danger: true,
			run: async () => {
				for (const id of ids) await discardDraft(id);
				if (openDraft() && ids.includes(openDraft()!)) setOpenDraft(null);
				setVisMode(false);
				flash(`discarded ${n} draft${n === 1 ? "" : "s"}`);
			},
		});
	};

	const askDelete = () => {
		const s = selected();
		if (!s) return;
		setPending({
			title: "Delete thread?",
			body: `Move "${s.thread.subject}" from ${s.thread.fromEmail} to trash (recoverable in Gmail).`,
			confirm: "Delete",
			danger: true,
			run: () => threadOp(s.thread.id, "delete"),
		});
	};

	// bulk destructive ops over the visual selection — one confirm for the batch
	const askBulk = (op: "spam" | "delete", ids: string[]) => {
		const n = ids.length;
		if (!n) return;
		const del = op === "delete";
		setPending({
			title: del ? `Delete ${n} threads?` : `Report spam on ${n} threads?`,
			body: del
				? `Move ${n} selected threads to trash (recoverable in Gmail).`
				: `Mark ${n} selected threads as spam and drop them from your inbox.`,
			confirm: del ? "Delete" : "Report spam",
			danger: true,
			run: () => bulkOp(ids, op),
		});
	};

	const askUnsub = async () => {
		const s = selected();
		if (!s) return;
		setSendStatus("looking for unsubscribe info…");
		const res = await fetch(`/api/email/threads/${s.thread.id}/unsubscribe`);
		const info = (await res.json()) as { target: string; type: "http" | "mailto"; oneClick: boolean; subject?: string } | null;
		if (!info) {
			setSendStatus("No unsubscribe info found in this thread.");
			setTimeout(() => setSendStatus(""), 5000);
			return;
		}
		const what = info.type === "http"
			? `One-click unsubscribe from ${new URL(info.target).host}${info.oneClick ? "" : " (plain POST)"} — the thread gets archived.`
			: `This sends an unsubscribe email to ${info.target} — the thread gets archived.`;
		setPending({
			title: "Unsubscribe?",
			body: what,
			confirm: "Unsubscribe",
			danger: false,
			run: async () => {
				const r = await fetch(`/api/email/threads/${s.thread.id}/unsubscribe`, { method: "POST" });
				const j = (await r.json()) as { ok?: boolean; via?: string; error?: string };
				setSendStatus(j.ok ? (j.via === "one-click" ? "Unsubscribed (one-click). Thread archived." : "Unsubscribe email sent. Thread archived.") : `unsubscribe failed: ${j.error}`);
				setTimeout(() => setSendStatus(""), 6000);
			},
		});
	};

	const manualCompose = async () => {
		const c = compose();
		if (!c?.to || !c.body) return;
		const res = await fetch("/api/email/drafts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(c),
		});
		const row = (await res.json()) as { id?: string };
		// attachments upload onto the now-existing draft row (id required)
		for (const f of composeFiles()) {
			const err = await uploadAttachment(row.id ?? "", f);
			if (err) flash(err);
		}
		setCompose(null);
		setComposeFiles([]);
		// drafts are drafts: they land in the Drafts tab for review + the real
		// send (voice-lint gate included), they don't fire straight out
		void revalidate("email-inbox");
		flash("Draft saved — find it in the Drafts tab");
	};

	// Send from the compose/reply overlay: create the outbox draft, then run the
	// same lint-gated send as the Drafts tab. A voice-lint block keeps the
	// overlay open and flips Send → Send anyway; retry targets the same draft.
	const sendCompose = async (overrideLint = false) => {
		const c = compose();
		if (!c?.to || !c.body) return;
		let draftId = c.draftId;
		if (!draftId) {
			setSendStatus("sending…");
			const res = await fetch("/api/email/drafts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(c),
			});
			const row = (await res.json()) as { id?: string; error?: string };
			if (!row?.id) {
				setSendStatus(`failed: ${row?.error ?? "could not save draft"}`);
				return;
			}
			draftId = row.id;
			setCompose({ ...c, draftId });
			// files were held client-side until the row existed — upload them onto it
			for (const f of composeFiles()) {
				const err = await uploadAttachment(draftId, f);
				if (err) {
					setSendStatus(`failed: ${err}`);
					return;
				}
			}
			setComposeFiles([]);
		}
		// sendDraft reads the (possibly edited) body from editBody
		setEditBody({ ...editBody(), [draftId]: c.body });
		await sendDraft(draftId, overrideLint);
		if (lintBlockedDraft() === draftId) return; // gate hit: overlay stays up, Send became Send anyway
		setCompose(null);
		flash("Sent");
	};

	// ── hotkeys ──
	let searchEl: HTMLInputElement | undefined;
	onMount(() => {
		const handler = async (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const typing = ["INPUT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable;
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") return; // palette handles
			if (typing) return;
			// confirm modal is up: it owns the keyboard — Enter runs, Escape
			// cancels (keeping the selection), everything else is swallowed.
			// Must sit above the global "/" and Escape branches.
			if (pending()) {
				if (e.key === "Enter") {
					e.preventDefault();
					void confirmPending();
				} else if (e.key === "Escape") {
					e.preventDefault();
					setPending(null);
				}
				return;
			}
			// theater mode owns these keys; j/k and the triage ops fall through —
			// they already act on selected() and repaint the overlay in place
			if (theater() && selected() && !compose()) {
				const scroller = document.querySelector<HTMLElement>("[data-theater-scroll]");
				if (e.key === "Escape" || e.key === "t") {
					e.preventDefault();
					setTheater(false);
					return;
				}
				if (e.key === "n" || e.key === "p") {
					e.preventDefault();
					const count = selected()!.messages.length;
					const cur = openMsg() >= 0 ? openMsg() : 0;
					const next = Math.min(Math.max(cur + (e.key === "n" ? 1 : -1), 0), count - 1);
					setOpenMsg(next);
					scroller?.querySelector<HTMLElement>(`[data-msg-idx="${next}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
					return;
				}
				if (e.key === " ") {
					e.preventDefault();
					scroller?.scrollBy({ top: (e.shiftKey ? -1 : 1) * scroller.clientHeight * 0.85, behavior: "smooth" });
					return;
				}
			}
			const threads = listThreads();
			if (e.key === "/") {
				e.preventDefault();
				searchEl?.focus();
				return;
			}
			if (e.key === "Escape") {
				if (visMode()) {
					setVisMode(false);
					return;
				}
				setSelected(null);
				setCompose(null);
				setOpenDraft(null);
				setSelOutbox(null);
				return;
			}
			// j/k navigate EVERY tab — above the editor guard so j/k switches
			// drafts while the draft editor is open (typing already returned)
			{
				const cur = selected() || openDraft() || selOutbox() ? selIdx() : -1;
				const navLen =
					folder() === "drafts" || folder() === "outbox"
						? (folder() === "drafts" ? inbox()?.drafts?.length : inbox()?.outbox?.length) ?? 0
						: threads.length;
				const step = async (i: number) => {
					if (folder() === "drafts" || folder() === "outbox") {
						await activateNav(i);
					} else {
						if (i >= visibleCount()) setVisibleCount(i + 100);
						if (visMode()) {
							setSelIdx(i);
							document.querySelectorAll("[data-thread-row]")[i]?.scrollIntoView({ block: "nearest" });
							return;
						}
						const t = threads[i];
						if (t) await loadThread(t, i);
					}
				};
				if (e.key === "j" || e.key === "ArrowDown") {
					e.preventDefault();
				if (navLen) await step(Math.min(cur + 1, navLen - 1));
					return;
				} else if (e.key === "k" || e.key === "ArrowUp") {
					e.preventDefault();
				if (navLen) await step(Math.max(cur - 1, 0));
					return;
				}
			}
			if (compose() || openDraft()) return;
			if (e.key === "c") {
				setCompose({ to: "", subject: "", body: "" });
				return;
			}
			// t opens theater on the open thread (selected() gates it to inbox/sent)
			if (e.key === "t" && !visMode() && selected()) {
				e.preventDefault();
				setTheater(true);
				return;
			}
			// h/l cycle the folder tabs (wrap) — works on every tab
			if (e.key === "h" || e.key === "l") {
				e.preventDefault();
				const folders = ["inbox", "drafts", "outbox", "sent"] as const;
				const i = folders.indexOf(folder());
				setFolder(folders[(i + (e.key === "l" ? 1 : -1) + folders.length) % folders.length]);
				setSelected(null);
				setVisMode(false);
				return;
			}
			// V visual mode: inbox (bulk triage) + drafts (bulk discard)
			if (
				e.key === "V" &&
				(folder() === "inbox" ? threads.length : (inbox()?.drafts?.length ?? 0))
			) {
				e.preventDefault();
				setVisAnchor(Math.max(selIdx(), 0));
				setVisMode(!visMode());
				return;
			}
			// drafts tab: # discards the cursor draft (or the visual range)
			if (folder() === "drafts") {
				if (e.key === "#") {
					const ids = visMode() ? visRangeIds() : [inbox()?.drafts?.[selIdx()]?.id].filter(Boolean) as string[];
					askDraftDiscard(ids);
				}
				return;
			}
			// remaining triage ops are inbox-only
			if (folder() !== "inbox") return;
			if (e.key === "e") {
				if (visMode()) await bulkOp(visRangeIds(), "archive");
				else if (selected()) await threadOp(selected()!.thread.id, "archive");
			} else if (e.key === "E" && !visMode() && selected()) {
				await threadOp(selected()!.thread.id, "unarchive");
			} else if (e.key === "u") {
				if (visMode()) await bulkOp(visRangeIds(), "unread");
				else if (selected()) {
					await threadOp(selected()!.thread.id, "unread");
					setSelected(null);
				}
			} else if (e.key === "!") {
				if (visMode()) askBulk("spam", visRangeIds());
				else if (selected()) askSpam();
			} else if (e.key === "#") {
				if (visMode()) askBulk("delete", visRangeIds());
				else if (selected()) askDelete();
			} else if (e.key === "x" && !visMode() && selected()) {
				void askUnsub();
			} else if (e.key === "r" && !visMode() && selected()) {
				// reply targets the last inbound message; on a sent-only thread
				// (cold outreach, no answer yet) fall back to the last message —
				// the recipient is its To: header
				const last = selected()!.messages.filter((m) => !m.isSent).at(-1) ?? selected()!.messages.at(-1);
				setCompose({
					to: last ? (last.isSent ? (last.toEmails ?? "") : (last.fromEmail ?? "")) : "",
					subject: selected()!.thread.subject.startsWith("Re:") ? selected()!.thread.subject : `Re: ${selected()!.thread.subject}`,
					// the composer holds only the human's words — quoted history is
					// appended at send time (buildReplyQuote in email-outbox)
					body: "",
					threadId: selected()!.thread.id,
				});
			} else if (e.key === "f" && !visMode() && selected()) {
				const last = selected()!.messages.at(-1);
				setCompose({
					to: "",
					subject: selected()!.thread.subject.startsWith("Fwd:") ? selected()!.thread.subject : `Fwd: ${selected()!.thread.subject}`,
					body: `\n\n---\nForwarded message from ${last?.fromEmail ?? ""}:\n${(last?.bodyText ?? "").slice(0, 2000)}`,
				});
			}
		};
		window.addEventListener("keydown", handler);
		onCleanup(() => window.removeEventListener("keydown", handler));
	});

	createEffect(() => {
		// OAuth callback lands here with ?connected=1 — strip it so a later
		// manual ?connected doesn't retrigger
		if (searchParams.connected) window.location.replace("/admin/email");
	});

	// getInboxQuery syncs in the background (fire-and-forget) so this page must
	// poll until the rows land — otherwise a fresh connect renders an empty inbox
	// that stays empty until the next manual action. Also polls email-status:
	// the background sync writes lastSyncAt only when it finishes, so "never"
	// has to keep revalidating until the timestamp lands.
	onMount(() => {
		let ticks = 0;
		const timer = setInterval(() => {
			const snap = inbox();
			const st = status();
			const waitingFirstSync = snap?.connected && snap.threads.length === 0 && folder() === "inbox";
			const waitingStamp = st?.email && !st.lastSyncAt;
			// editing a draft or composing: skip poll ticks — a revalidate mid-edit
			// remounts overlays and eats focus
			if (!openDraft() && !compose() && (waitingFirstSync || waitingStamp) && ticks++ < 60) {
				void revalidate("email-inbox");
				void revalidate("email-status");
			} else {
				clearInterval(timer);
			}
		}, 2500);
		onCleanup(() => clearInterval(timer));
	});

	createEffect(() => {
		// j/k inside theater repaints the overlay in place — restart every
		// thread change at the top so the read always starts at the newest
		if (theater() && selected()) document.querySelector<HTMLElement>("[data-theater-scroll]")?.scrollTo({ top: 0 });
	});

	return (
		<Layout>
			<Title>Email — Basalt</Title>
			<div style={{ display: "flex", "align-items": "baseline", gap: "16px" }}>
				<h1 class="page-title">Email</h1>
				<span class="muted" style={{ "font-size": "13px" }}>
					<Show when={status()} fallback="not connected">
						{status()!.email} · last sync {status()!.lastSyncAt ? new Date(status()!.lastSyncAt!).toLocaleTimeString() : "never"}
					</Show>
				</span>
				<div style={{ flex: 1 }} />
				<Show when={sendStatus()}><span class="muted" style={{ "font-size": "13px" }}>{sendStatus()}</span></Show>
				<Show when={!status()} fallback={<Button variant="outline" size="sm" type="button"  onClick={() => sync()}>Sync</Button>}>
					<Button as="a" variant="outline" size="sm" aria-busy={connecting()} href="/api/email/oauth" onClick={() => setConnecting(true)}>
						{connecting() ? "Connecting…" : "Connect Gmail"}
					</Button>
				</Show>
			</div>
			<p class="page-subtitle">
		j/k move · h/l tabs · V select · e done · u unread · r reply · f forward · ! spam · # delete · x unsub · c compose · / search · t theater · n/p msg
			</p>

			<Show when={searchParams.connect}>
				<div
					class="card"
					style={{ padding: "10px 16px", "margin-bottom": "12px", border: "1px solid rgba(180,60,50,0.5)", background: "rgba(180,60,50,0.06)", "font-size": "14px" }}
				>
					Gmail connect failed: {String(searchParams.connect).replace(/^failed:/, "")}
				</div>
			</Show>

			{/* folder tabs */}
			<div style={{ display: "flex", gap: "12px", "align-items": "center" }}>
				<div class="folder-tabs" style={{ "margin-bottom": 0 }}>
					<button type="button" classList={{ active: folder() === "inbox" }} onClick={() => setFolder("inbox")}>
						Inbox<Show when={visibleThreads().length}> · {visibleThreads().length}</Show>
					</button>
					<button type="button" classList={{ active: folder() === "drafts" }} onClick={() => setFolder("drafts")}>
						Drafts<Show when={inbox()?.drafts?.length}> · {inbox()!.drafts.length}</Show>
					</button>
					<button type="button" classList={{ active: folder() === "outbox" }} onClick={() => setFolder("outbox")}>
						Outbox<Show when={inbox()?.outbox?.length}> · {inbox()!.outbox.length}</Show>
					</button>
					<button type="button" classList={{ active: folder() === "sent" }} onClick={() => setFolder("sent")}>
						Sent
					</button>
				</div>
				<Button variant="outline" size="sm" type="button"  onClick={() => setCompose({ to: "", subject: "", body: "" })}>
					Compose (c)
				</Button>
			</div>

			{/* Drafts tab — agent + composed drafts, edit → send; every edit
			    lands as a CRDT-tracked version (History shows what changed) */}
			<Show when={folder() === "drafts"}>
				<Show when={inbox()?.drafts?.length} fallback={<div class="muted">No open drafts. Agents push drafts via create_email_draft; compose with c in the Inbox.</div>}>
					<For each={inbox()!.drafts}>
						{(d, i) => (
							<div
								data-thread-row=""
								class="card"
								style={{
									padding: "12px 16px",
									"margin-bottom": "8px",
									cursor: "pointer",
									background:
										visMode() && i() >= visRangeIdx()[0] && i() <= visRangeIdx()[1]
											? "rgba(188, 156, 92, 0.22)"
											: openDraft() === d.id
												? "rgba(188, 156, 92, 0.12)"
												: undefined,
									transition: "background 120ms",
								}}
								onClick={() => {
									setSelIdx(i());
									setOpenDraft(d.id);
								}}
							>
								<div style={{ display: "flex", gap: "10px", "align-items": "baseline" }}>
									<strong style={{ "font-size": "14px", flex: 1 }}>{editMeta()[d.id]?.subject ?? d.subject}</strong>
									<span class="muted" style={{ "font-size": "12px" }}>to {editMeta()[d.id]?.to ?? d.toEmail} · v{d.version}</span>
								</div>
								<div class="muted" style={{ "font-size": "13px", "margin-top": "4px" }}>
									<Show when={d.status === "failed"}><span style={{ color: "#a33" }}>send failed: {d.error} · </span></Show>
									<Show when={d.sendAt}>fires {new Date(d.sendAt!).toLocaleString()} · </Show>
									{(editBody()[d.id] ?? d.body)?.slice(0, 90)}
								</div>
							</div>
						)}
					</For>
				</Show>
			</Show>

			<Show when={folder() === "outbox"}>
				{/* Outbox — scheduled sends; the scheduler ticker fires these at send_at.
				    Failed sends stay here with their error until retried or discarded */}
				<Show when={inbox()?.outbox?.length} fallback={<div class="muted">Nothing queued. Schedule a draft from the Drafts tab.</div>}>
					<For each={inbox()!.outbox}>
						{(d) => (
							<div
								data-thread-row=""
								class="card"
								style={{
									padding: "14px 18px",
									"margin-bottom": "10px",
									background: selOutbox() === d.id ? "rgba(188, 156, 92, 0.12)" : undefined,
								}}
								onClick={() => {
									const i = (inbox()?.outbox ?? []).findIndex((o) => o.id === d.id);
									setSelIdx(i);
									setSelOutbox(d.id);
								}}
							>
								<div style={{ display: "flex", gap: "12px", "align-items": "baseline" }}>
									<strong style={{ "font-size": "14px" }}>{d.subject}</strong>
									<span class="muted" style={{ "font-size": "13px" }}>to {d.toEmail}</span>
									<Show when={d.status === "failed"}>
										<span style={{ "font-size": "12px", color: "#a33" }}>failed: {d.error}</span>
									</Show>
									<Show when={d.status === "sending"}>
										<span class="muted" style={{ "font-size": "12px" }}>sending…</span>
									</Show>
									<div style={{ flex: 1 }} />
									<Button variant="outline" size="sm" type="button"  onClick={() => sendDraft(d.id)}>Send now</Button>
									<Button variant="outline" size="sm" type="button"  onClick={() => void unscheduleDraft(d.id)}>Unschedule</Button>
									<Button variant="outline" size="sm" type="button"  onClick={() => discardDraft(d.id)}>Discard</Button>
								</div>
								<div class="muted" style={{ "font-size": "13px", "margin-top": "4px" }}>
									<Show when={d.status === "failed"} fallback={<>fires {new Date(d.sendAt!).toLocaleString()}</>}>
										was scheduled for {new Date(d.sendAt!).toLocaleString()}
									</Show>
								</div>
							</div>
						)}
					</For>
				</Show>
			</Show>

			<Show when={folder() !== "drafts"}>
			{/* search */}
			<div style={{ margin: "12px 0", display: "flex", gap: "8px" }}>
				<input
					ref={searchEl}
					type="text"
					placeholder={`Search ${folder()} (/)…`}
					value={q()}
					onInput={(e) => setQ(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") setSearchParams({ q: q() || undefined });
						if (e.key === "Escape") {
							setQ("");
							setSearchParams({ q: undefined });
						}
					}}
					style={{ flex: 1, padding: "10px 14px", background: "var(--card)", border: "1px solid rgba(0,0,0,0.12)", "font-size": "14px" }}
				/>
				<Show when={q() || activeQ()}>
					<Button variant="outline" size="sm" type="button"
						
						onClick={() => {
							setQ("");
							setSearchParams({ q: undefined });
						}}
					>
						Clear
					</Button>
				</Show>
			</div>

			<div style={{ display: "grid", "grid-template-columns": selected() ? "1fr 1.4fr" : "1fr", gap: "16px" }}>
				{/* list */}
				<div>
					<Show when={folder() === "inbox"}>
					<Show when={visMode()}>
						<div class="muted" style={{ "font-size": "13px", "margin-bottom": "8px", color: "var(--foreground)" }}>
							visual — {visRangeIds().length} selected · j/k extend · e done · u unread · ! spam · # delete · esc cancel
						</div>
					</Show>
					<Show when={visibleThreads().length} fallback={<div class="muted">{inbox()?.connected ? (searchParams.q ? "No matches." : "Inbox zero.") : "Connect Gmail to load your inbox."}</div>}>
						<For each={visibleThreads().slice(0, visibleCount())}>
							{(t, i) => (
								<div
									data-thread-row=""
									class="card"
									style={{
										padding: "12px 16px",
										"margin-bottom": "8px",
										cursor: "pointer",
										opacity: isUnread(t) ? 1 : 0.75,
										// selected-row tint matches the palette's selection color;
										// rows inside the visual range get a stronger wash
										background:
											visMode() && i() >= visRangeIdx()[0] && i() <= visRangeIdx()[1]
												? "rgba(188, 156, 92, 0.22)"
												: selected()?.thread.id === t.id
													? "rgba(188, 156, 92, 0.12)"
													: undefined,
										transition: "background 120ms",
									}}
									onClick={() => loadThread(t, i())}
									onpointerover={() => prefetch(t)}
								>
									<div style={{ display: "flex", gap: "10px", "align-items": "baseline" }}>
										<Show when={isUnread(t)}><span style={{ color: "var(--foreground)" }}>●</span></Show>
										<strong style={{ "font-size": "14px", flex: 1 }}>{t.subject}</strong>
										<span class="muted" style={{ "font-size": "12px" }}>{new Date(t.lastMessageAt).toLocaleDateString()}</span>
									</div>
									<div class="muted" style={{ "font-size": "13px", "margin-top": "4px" }}>
										{t.fromName} — {t.snippet?.slice(0, 90)}
									</div>
								</div>
							)}
						</For>
						<Show when={visibleThreads().length > visibleCount()}>
							<Button variant="outline" size="sm" type="button"  style={{ "margin-top": "8px" }} onClick={() => setVisibleCount((c) => c + 100)}>
								Load older mail ({visibleThreads().length - visibleCount()} more)…
							</Button>
						</Show>
					</Show>
					</Show>
					<Show when={folder() === "sent"}>
					{/* Sent — every thread with mail I sent (dashboard sends land here
					    via the local insert + SENT sync; Gmail-UI sends on next sync) */}
					<Show when={inbox()?.sent?.length} fallback={<div class="muted">Nothing sent yet.</div>}>
						<For each={inbox()!.sent.slice(0, visibleCount())}>
							{(s, i) => (
								<div
									data-thread-row=""
									class="card"
									style={{
										padding: "12px 16px",
										"margin-bottom": "8px",
										cursor: "pointer",
										opacity: 0.85,
										background: selected()?.thread.id === s.thread.id ? "rgba(188, 156, 92, 0.12)" : undefined,
									}}
									onClick={() => loadThread(s.thread, i())}
								>
									<div style={{ display: "flex", gap: "10px", "align-items": "baseline" }}>
										<strong style={{ "font-size": "14px", flex: 1 }}>{s.thread.subject}</strong>
										<span class="muted" style={{ "font-size": "12px" }}>{new Date(s.sentAt).toLocaleDateString()}</span>
									</div>
									<div class="muted" style={{ "font-size": "13px", "margin-top": "4px" }}>
										to {s.to ?? "(unknown)"} — {s.thread.snippet?.slice(0, 90)}
									</div>
								</div>
							)}
						</For>
						<Show when={inbox()!.sent.length > visibleCount()}>
							<Button variant="outline" size="sm" type="button"  style={{ "margin-top": "4px" }} onClick={() => setVisibleCount((c) => c + 100)}>
								Load older sent mail ({inbox()!.sent.length - visibleCount()} more)…
							</Button>
						</Show>
					</Show>
					</Show>
				</div>

				{/* reading pane */}
				<Show when={selected()}>
					<div class="card" style={{ padding: "20px 24px" }}>
					<div style={{ display: "flex", gap: "12px", "align-items": "baseline" }}>
						<h2 style={{ "font-size": "18px", margin: 0, flex: 1 }}>{selected()!.thread.subject}</h2>
						<Button variant="outline" size="sm" type="button"  onClick={() => setTheater(true)}>Theater (t)</Button>
					</div>
					<div class="muted" style={{ "font-size": "13px", "margin-bottom": "12px" }}>{selected()!.thread.fromEmail}</div>
					{/* newest on top, the rest of the thread underneath (t = fullscreen theater) */}
					<ThreadMessages messages={shownMessages()} openMsg={openMsg()} onOpen={setOpenMsg} />
						<div style={{ display: "flex", gap: "8px", "margin-top": "8px" }}>
							<Button variant="outline" size="sm" type="button"  onClick={() => threadOp(selected()!.thread.id, "archive")}>Done (e)</Button>
							<Button variant="outline" size="sm" type="button"  onClick={() => threadOp(selected()!.thread.id, "unread")}>Unread (u)</Button>
							<Button variant="outline" size="sm" type="button"  onClick={askUnsub}>Unsub (x)</Button>
							<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={askSpam}>Spam (!)</Button>
							<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={askDelete}>Delete (#)</Button>
						</div>
					</div>
				</Show>
			</div>
			</Show>

			{/* theater mode — fullscreen focused read: the current message takes
			    the screen, the rest of the thread underneath. n/p walk messages,
			    space pages, j/k switches threads and keeps the overlay open.
			    z 45 sits under the compose/draft overlays (50) and confirm modal (60),
			    so r/f/! opened from here float on top instead of hiding behind it. */}
			<Show when={theater() && selected()}>
				<div
					data-theater-scroll=""
					style={{ position: "fixed", inset: "0", background: "var(--background)", "z-index": 45, "overflow-y": "auto" }}
					onClick={() => setTheater(false)}
				>
					<div style={{ "max-width": "860px", margin: "0 auto", padding: "32px 24px 64px" }} onClick={(e) => e.stopPropagation()}>
						<div style={{ display: "flex", gap: "12px", "align-items": "baseline" }}>
							<h2 style={{ "font-size": "22px", margin: 0, flex: 1 }}>{selected()!.thread.subject}</h2>
							<Button variant="outline" size="sm" type="button"  onClick={() => setTheater(false)}>Exit (esc)</Button>
						</div>
						<div class="muted" style={{ "font-size": "13px", "margin-top": "6px" }}>{selected()!.thread.fromEmail}</div>
						<div class="muted" style={{ "font-size": "12px", "margin-top": "12px", "padding-top": "10px", "border-top": "1px solid rgba(0,0,0,0.08)" }}>
							n/p next/prev message · space page · j/k next thread · esc exit
						</div>
						<div style={{ "margin-top": "16px" }}>
							<ThreadMessages messages={shownMessages()} openMsg={openMsg()} onOpen={setOpenMsg} />
						</div>
						<div style={{ display: "flex", gap: "8px", "margin-top": "8px" }}>
							<Button variant="outline" size="sm" type="button"  onClick={() => threadOp(selected()!.thread.id, "archive")}>Done (e)</Button>
							<Button variant="outline" size="sm" type="button"  onClick={() => threadOp(selected()!.thread.id, "unread")}>Unread (u)</Button>
							<Button variant="outline" size="sm" type="button"  onClick={askUnsub}>Unsub (x)</Button>
							<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={askSpam}>Spam (!)</Button>
							<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={askDelete}>Delete (#)</Button>
						</div>
					</div>
				</div>
			</Show>
			{/* destructive-action confirm modal (spam / delete / unsubscribe) */}
			<Show when={pending()}>
				<div
					style={{ position: "fixed", inset: "0", background: "rgba(0, 0, 0, 0.35)", "z-index": 60, display: "grid", "place-items": "center" }}
					onClick={() => setPending(null)}
				>
					<div class="card" style={{ width: "460px", "max-width": "90vw", padding: "24px", background: "var(--card)", "border-top-color": pending()!.danger ? "#a33" : "var(--foreground)" }} onClick={(e) => e.stopPropagation()}>
						<h2 style={{ "font-size": "17px", margin: "0 0 8px" }}>{pending()!.title}</h2>
						<p class="muted" style={{ "font-size": "14px", "line-height": "1.5", margin: 0, "overflow-wrap": "anywhere" }}>{pending()!.body}</p>
						<div style={{ display: "flex", gap: "8px", "justify-content": "flex-end", "margin-top": "16px" }}>
							<Button variant="outline" size="sm" type="button"  onClick={() => setPending(null)}>Cancel (esc)</Button>
							<Button variant="outline" size="sm" type="button"
								
								style={pending()!.danger ? { "border-color": "#a33", color: "#a33" } : { "border-color": "var(--foreground)", color: "var(--foreground)" }}
								onClick={() => void confirmPending()}
							>
								{pending()!.confirm} (⏎)
							</Button>
						</div>
					</div>
				</div>
			</Show>

			{/* draft editor overlay — click a Drafts row; every field autosaves
			    (body CRDT-tracked → History shows what changed), send/schedule
			    stay lint-gated */}
			<Show when={openDraftRow()} keyed>
				{(d) => (
					<div
						class="card"
						style={{ position: "fixed", bottom: "24px", right: "24px", width: "560px", "max-width": "90vw", "max-height": "80vh", "overflow-y": "auto", "z-index": 50 }}
					>
						<div style={{ padding: "16px 20px" }}>
							<div style={{ display: "flex", gap: "8px", "align-items": "center", "margin-bottom": "8px" }}>
								<input
									placeholder="To"
									value={editMeta()[d.id]?.to ?? d.toEmail}
									onInput={(e) => editDraft(d.id, { to: e.currentTarget.value })}
									style={{ flex: 1, padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
								/>
								<Button variant="outline" size="sm" type="button"  classList={{ active: showCcBcc() }} onClick={() => setShowCcBcc(!showCcBcc())}>Cc Bcc</Button>
							</div>
							<Show when={showCcBcc() || editMeta()[d.id]?.cc || editMeta()[d.id]?.bcc || d.ccEmail || d.bccEmail}>
								<input
									placeholder="Cc"
									value={editMeta()[d.id]?.cc ?? d.ccEmail ?? ""}
									onInput={(e) => editDraft(d.id, { cc: e.currentTarget.value })}
									style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
								/>
								<input
									placeholder="Bcc"
									value={editMeta()[d.id]?.bcc ?? d.bccEmail ?? ""}
									onInput={(e) => editDraft(d.id, { bcc: e.currentTarget.value })}
									style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
								/>
							</Show>
							<input
								placeholder="Subject"
								value={editMeta()[d.id]?.subject ?? d.subject}
								onInput={(e) => editDraft(d.id, { subject: e.currentTarget.value })}
								style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
							/>
							<label style={{ display: "flex", "align-items": "center", gap: "6px", "margin-bottom": "8px", "font-size": "12px", color: "#6b6455" }}>
								Footer
								<select
									value={editMeta()[d.id]?.signature ?? d.signature ?? ""}
									onChange={(e) => editDraft(d.id, { signature: e.currentTarget.value })}
									style={{ padding: "4px", border: "1px solid rgba(0,0,0,0.12)" }}
								>
									<option value="">Auto ({d.campaignCompanyId ? "plain" : "full"})</option>
									<option value="full">Full signature</option>
									<option value="plain">Plain (Collin)</option>
									<option value="none">None</option>
								</select>
							</label>
							<LintedTextarea
								ariaLabel="Draft body"
								value={editBody()[d.id] ?? d.body}
								violations={draftLint()[d.id]?.violations ?? []}
								onInput={(v) => editDraft(d.id, { body: v })}
								rows={12}
							/>
							<VoiceLintPanel result={draftLint()[d.id] ?? null} stale={lintStale()[d.id]} />
							{/* footer is appended at send time — preview the variant that will land */}
							<Show when={(editMeta()[d.id]?.signature ?? d.signature ?? "") !== "none"}>
								<pre class="muted" style={{ "font-size": "11px", "white-space": "pre-wrap", margin: "0 0 8px", "font-family": "inherit", color: "#8a8375" }}>{`— Footer added on send —\n${SIGNATURES[(editMeta()[d.id]?.signature || (d.campaignCompanyId ? "plain" : "full")) as "full" | "plain"].plain}`}</pre>
							</Show>
							<div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap", "align-items": "center", margin: "8px 0" }}>
								{/* attachments ride the live row — frozen d would hide uploads that land via revalidate */}
								<For each={inbox()?.drafts.find((x) => x.id === d.id)?.attachments ?? []}>
									{(a) => (
										<span style={{ "font-size": "12px", padding: "2px 8px", border: "1px solid rgba(0,0,0,0.12)", "border-radius": "12px", display: "inline-flex", gap: "6px", "align-items": "center" }}>
											{a.filename} ({(a.size / 1048576).toFixed(1)}MB)
											<button type="button" style={{ border: "0", background: "none", cursor: "pointer", padding: "0", "font-size": "14px", "line-height": "1" }} onClick={() => void removeAttachment(d.id, a.path)}>×</button>
										</span>
									)}
								</For>
								<label style={{ "font-size": "12px", color: "#6b6455", cursor: "pointer" }}>
									Attach
									<input
										type="file"
										multiple
										style={{ display: "none" }}
										onChange={async (e) => {
											const files = [...e.currentTarget.files!];
											e.currentTarget.value = "";
											for (const f of files) {
												if (f.size > ATTACH_MAX_FILE) flash(`${f.name}: over the 20MB per-file cap`);
												else {
													const err = await uploadAttachment(d.id, f);
													if (err) flash(err);
												}
											}
										}}
									/>
								</label>
							</div>
							<div style={{ display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap" }}>
								<Button variant="outline" size="sm" type="button"  classList={{ active: openDraftHistory() === d.id }} onClick={() => void toggleDraftHistory(d.id)}>
									History
								</Button>
								<div style={{ flex: 1 }} />
								<Show when={draftSaveState()[d.id]}><span class="muted" style={{ "font-size": "12px" }}>{draftSaveState()[d.id]}</span></Show>
								<Show when={lintBlockedDraft() === d.id} fallback={<Button size="sm" type="button"  onClick={() => sendDraft(d.id)}>Send</Button>}>
									<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={() => sendDraft(d.id, true)}>Send anyway (ignores voice lint)</Button>
								</Show>
								<Show
									when={lintBlockedSched() === d.id}
									fallback={
										<Show
											when={!d.sendAt}
											fallback={
												<>
													<span class="muted" style={{ "font-size": "12px" }}>Scheduled {new Date(d.sendAt!).toLocaleString()}</span>
													<Button variant="outline" size="sm" type="button"  onClick={() => void unscheduleDraft(d.id)}>Unschedule</Button>
												</>
											}
										>
											<input
												type="datetime-local"
												class="doc-sched-input"
												aria-label="Send at"
												value={schedInput()[d.id] ?? ""}
												onChange={(e) => setSchedInput({ ...schedInput(), [d.id]: e.currentTarget.value })}
											/>
											<Button variant="outline" size="sm" type="button"  onClick={() => void scheduleDraft(d.id)}>Schedule</Button>
										</Show>
									}
								>
									<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={() => void scheduleDraft(d.id, true)}>Schedule anyway (ignores voice lint)</Button>
								</Show>
								<Button variant="outline" size="sm" type="button"  onClick={() => discardDraft(d.id)}>Discard</Button>
								<div style={{ flex: 1 }} />
								<Button variant="outline" size="sm" type="button"  onClick={() => setOpenDraft(null)}>Close (esc)</Button>
							</div>
							<Show when={openDraftHistory() === d.id}>
								<div class="doc-history" style={{ position: "static", width: "100%", "max-height": "160px", "margin-top": "12px" }}>
									<Show when={draftVersions()[d.id]?.length} fallback={<p class="muted">No tracked versions yet.</p>}>
										<For each={draftVersions()[d.id]}>
											{(v) => (
												<button type="button" class="doc-history-row" onClick={() => void showDraftDiff(d.id, v.version)}>
													<span class="doc-history-ver">v{v.version}</span>
													<span class="doc-history-author" classList={{ agent: v.author === "agent" }}>{v.author}</span>
													<span class="muted">{new Date(v.updatedAt).toLocaleString()}</span>
												</button>
											)}
										</For>
										<Show when={draftDiff()?.id === d.id}>
											<div class="doc-diff">
												<Show when={draftDiff()?.parts} fallback={<p class="muted">Loading…</p>}>
													{(parts) => (
														<For each={parts()}>
															{(p) =>
																p.added ? <ins>{p.value}</ins> : p.removed ? <del>{p.value}</del> : <span>{p.value}</span>
															}
														</For>
													)}
												</Show>
											</div>
										</Show>
									</Show>
								</div>
							</Show>
						</div>
					</div>
				)}
			</Show>

			{/* compose/reply overlay */}
			<Show when={compose()}>
				<div style={{ position: "fixed", bottom: "24px", right: "24px", width: "480px", "z-index": 50 }} class="card">
					<div style={{ padding: "16px 20px" }}>
						<div style={{ display: "flex", gap: "8px", "align-items": "center", "margin-bottom": "8px" }}>
							<input
								placeholder="To"
								value={compose()!.to}
								onInput={(e) => setCompose({ ...compose()!, to: e.currentTarget.value })}
								style={{ flex: 1, padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
							/>
							<Button variant="outline" size="sm" type="button"  classList={{ active: showCcBcc() }} onClick={() => setShowCcBcc(!showCcBcc())}>Cc Bcc</Button>
						</div>
						<Show when={showCcBcc() || compose()!.cc || compose()!.bcc}>
							<input
								placeholder="Cc"
								value={compose()!.cc ?? ""}
								onInput={(e) => setCompose({ ...compose()!, cc: e.currentTarget.value })}
								style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
							/>
							<input
								placeholder="Bcc"
								value={compose()!.bcc ?? ""}
								onInput={(e) => setCompose({ ...compose()!, bcc: e.currentTarget.value })}
								style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
							/>
						</Show>
						<input
							placeholder="Subject"
							value={compose()!.subject}
							onInput={(e) => setCompose({ ...compose()!, subject: e.currentTarget.value })}
							style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
						/>
						<textarea
							aria-label="Message body"
							placeholder="Your message…"
							value={compose()!.body}
							onInput={(e) => setCompose({ ...compose()!, body: e.currentTarget.value })}
							rows={8}
							ref={(el) => setTimeout(() => el.focus())}
							style={{ width: "100%", "margin-bottom": "8px", padding: "8px", border: "1px solid rgba(0,0,0,0.12)", "font-family": "inherit", "font-size": "14px", "line-height": "1.5", "box-sizing": "border-box", resize: "vertical", display: "block" }}
						/>
						{/* footer is appended at send time — preview it where it will land */}
						<pre class="muted" style={{ "font-size": "11px", "white-space": "pre-wrap", margin: "0 0 8px", "font-family": "inherit", color: "#8a8375" }}>{`— Footer added on send —\n${SIGNATURES.full.plain}`}</pre>
						<Show when={composeFiles().length}>
							<div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap", "margin-bottom": "8px" }}>
								<For each={composeFiles()}>
									{(f, i) => (
										<span style={{ "font-size": "12px", padding: "2px 8px", border: "1px solid rgba(0,0,0,0.12)", "border-radius": "12px", display: "inline-flex", gap: "6px", "align-items": "center" }}>
											{f.name} ({(f.size / 1048576).toFixed(1)}MB)
											<button type="button" style={{ border: "0", background: "none", cursor: "pointer", padding: "0", "font-size": "14px", "line-height": "1" }} onClick={() => setComposeFiles(composeFiles().filter((_, j) => j !== i()))}>×</button>
										</span>
									)}
								</For>
							</div>
						</Show>
						<label style={{ "font-size": "12px", color: "#6b6455", cursor: "pointer", "margin-bottom": "8px", display: "inline-block" }}>
							Attach
							<input
								type="file"
								multiple
								style={{ display: "none" }}
								onChange={(e) => {
									if (e.currentTarget.files?.length) addComposeFiles(e.currentTarget.files);
									e.currentTarget.value = "";
								}}
							/>
						</label>
						<div style={{ display: "flex", gap: "8px", "justify-content": "flex-end" }}>
							<Show when={lintBlockedDraft() && lintBlockedDraft() === compose()!.draftId} fallback={<Button size="sm" type="button"  onClick={() => sendCompose()}>Send</Button>}>
								<Button variant="outline" size="sm" type="button"  style={{ "border-color": "#a33", color: "#a33" }} onClick={() => sendCompose(true)}>Send anyway (ignores voice lint)</Button>
							</Show>
							<Button variant="outline" size="sm" type="button"  onClick={() => { setCompose(null); setComposeFiles([]); }}>Esc</Button>
							<Button variant="outline" size="sm" type="button"  onClick={manualCompose}>Save draft</Button>
						</div>
					</div>
				</div>
			</Show>
		</Layout>
	);
}
