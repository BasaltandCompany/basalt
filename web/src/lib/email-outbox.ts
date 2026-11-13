// Outbox server core — schedule/send/draft persistence. Split out of
// email-queries.ts: standalone exported fns there kept the module isomorphic,
// so its `import { db }` chain (postgres → Buffer.allocUnsafe at module eval)
// landed in the client bundle → "Buffer is not defined" on the email page.
// Every consumer here is server-side (API routes, scheduler, brain MCP);
// "use server" stays on the previously-marked fns as a tripwire — a future
// client import gets RPC stubs instead of a db-in-browser crash.
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "~/db";
import { emailMessages, emailOutbox, emailThreads } from "~/db/schema";
import { getPrimaryAccount, threadWithMessages, sendGmail } from "~/lib/gmail";
import { trackText } from "~/lib/crdt-text-db";
import { lintVoiceText, recordLintOverrides } from "~/lib/voice-lint-db";
import { SIGNATURES } from "~/lib/email-signature";
import { supabaseService } from "~/lib/supabase";
import { toBase64 } from "~/lib/crypto";
import type { OutboxAttachment } from "~/db/schema";
import type { MimeAttachment } from "~/lib/gmail";
import type { LintViolation } from "~/lib/voice-lint";

const ATT_BUCKET = "portal-docs";
const ATT_PREFIX = "email-attachments";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
// Gmail hard-rejects messages over 25MB — refuse before sending, not after
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

/**
 * Core: append file bytes to a draft's attachments (storage upload + metadata).
 * Callers: human HTTP upload (Blob) and agent MCP (local path).
 */
export async function attachBytes(
	outboxId: string,
	files: { bytes: ArrayBuffer; filename: string; mimeType: string }[],
): Promise<{ ok: true; attachments: OutboxAttachment[] } | { ok: false; error: string }> {
	const [row] = await db
		.select({ attachments: emailOutbox.attachments })
		.from(emailOutbox)
		.where(eq(emailOutbox.id, outboxId));
	if (!row) return { ok: false, error: "draft not found" };
	const svc = supabaseService();
	const added: OutboxAttachment[] = [];
	for (const f of files) {
		if (f.bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: `${f.filename}: ${(f.bytes.byteLength / 1048576).toFixed(1)}MB exceeds the 20MB per-file cap` };
		const meta: OutboxAttachment = {
			// uuid prefix so duplicate filenames never collide in storage
			path: `${ATT_PREFIX}/${outboxId}/${crypto.randomUUID()}-${f.filename}`,
			filename: f.filename,
			mimeType: f.mimeType || "application/octet-stream",
			size: f.bytes.byteLength,
		};
		const { error } = await svc.storage.from(ATT_BUCKET).upload(meta.path, f.bytes, { contentType: meta.mimeType });
		if (error) return { ok: false, error: `${f.filename}: ${error.message}` };
		added.push(meta);
	}
	const attachments = [...(row.attachments ?? []), ...added];
	await db.update(emailOutbox).set({ attachments }).where(eq(emailOutbox.id, outboxId));
	return { ok: true, attachments };
}

/** Agent path: absolute local file paths (agent + server share the host). */
export async function attachLocalFiles(
	outboxId: string,
	paths: string[],
): Promise<{ ok: true; attachments: OutboxAttachment[] } | { ok: false; error: string }> {
	const files: { bytes: ArrayBuffer; filename: string; mimeType: string }[] = [];
	for (const p of paths) {
		const f = Bun.file(p);
		if (!(await f.exists())) return { ok: false, error: `cannot read ${p} (missing or unreadable)` };
		files.push({ bytes: await f.arrayBuffer(), filename: p.split("/").pop() || "attachment", mimeType: f.type });
	}
	return attachBytes(outboxId, files);
}

/** Remove one attachment: storage object + metadata entry. */
export async function removeOutboxAttachment(outboxId: string, path: string): Promise<boolean> {
	const [row] = await db.select({ attachments: emailOutbox.attachments }).from(emailOutbox).where(eq(emailOutbox.id, outboxId));
	if (!row) return false;
	const next = (row.attachments ?? []).filter((a) => a.path !== path);
	if (next.length === row.attachments.length) return false;
	if (path.startsWith(`${ATT_PREFIX}/`)) await supabaseService().storage.from(ATT_BUCKET).remove([path]);
	await db.update(emailOutbox).set({ attachments: next }).where(eq(emailOutbox.id, outboxId));
	return true;
}

/** Fetch attachment bytes from storage → MIME parts. Fails on the first missing file. */
async function loadAttachments(list: OutboxAttachment[]): Promise<MimeAttachment[]> {
	if (!list.length) return [];
	const svc = supabaseService();
	return Promise.all(
		list.map(async (a): Promise<MimeAttachment> => {
			const { data, error } = await svc.storage.from(ATT_BUCKET).download(a.path);
			if (error || !data) throw new Error(`attachment unavailable: ${a.filename} (${error?.message ?? "not found"})`);
			return { filename: a.filename, mimeType: a.mimeType, base64: toBase64(new Uint8Array(await data.arrayBuffer())) };
		}),
	);
}

export type SendResult =
	| { ok: true; gmailMessageId: string }
	| { ok: false; error: string }
	| { ok: false; blocked: "voice_lint"; violations: LintViolation[] };

/**
 * Schedule an outbox draft for later sending. Same voice-lint gate as Send —
 * scheduling is the human's final intent, so violations block here (with an
 * explicit override); the ticker then sends unguarded at fire time.
 */
export async function scheduleOutboxDraft(
	outboxId: string,
	when: Date,
	opts: { body?: string; overrideLint?: boolean } = {},
): Promise<{ ok: true; sendAt: string } | { ok: false; error: string } | { ok: false; blocked: "voice_lint"; violations: LintViolation[] }> {
	"use server";
	const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId));
	if (!row) return { ok: false, error: "draft not found" };
	if (row.status === "sent") return { ok: false, error: "already sent" };
	if (Number.isNaN(when.getTime())) return { ok: false, error: "invalid sendAt" };

	const body = opts.body ?? row.body;
	if (opts.body !== undefined) await saveDraftBody(outboxId, body);

	const lint = await lintVoiceText(body, { surface: "email" });
	if (lint.avoidCount > 0 && !opts.overrideLint) {
		return { ok: false, blocked: "voice_lint", violations: lint.violations };
	}
	if (lint.avoidCount > 0 && opts.overrideLint) {
		await recordLintOverrides(lint.violations.map((v) => v.patternId), outboxId);
	}

	await db
		.update(emailOutbox)
		.set({ sendAt: when, status: "draft", error: null, body })
		.where(eq(emailOutbox.id, outboxId));
	return { ok: true, sendAt: when.toISOString() };
}

export async function unscheduleOutboxDraft(outboxId: string): Promise<boolean> {
	"use server";
	const rows = await db
		.update(emailOutbox)
		.set({ sendAt: null })
		.where(eq(emailOutbox.id, outboxId))
		.returning({ id: emailOutbox.id });
	return rows.length > 0;
}

/**
 * Send an outbox draft: the body is LINTED against voice patterns first —
 * avoid-violations BLOCK the send (the gate). If the draft came from an agent
 * Agent drafts land here via createEmailDraft; the human edits (or not).
 */
export async function sendOutboxDraft(
	outboxId: string,
	bodyOverride?: string,
	opts: { overrideLint?: boolean } = {},
): Promise<SendResult | { ok: false; blocked: "voice_lint"; violations: Awaited<ReturnType<typeof lintVoiceText>>["violations"] }> {
	"use server";
	return sendOutboxInner(outboxId, bodyOverride, opts);
}

/** Plain (non-RPC) core — callable from the scheduler ticker, which has no
 *  request context, unlike "use server" wrappers. */
export async function sendOutboxInner(
	outboxId: string,
	bodyOverride?: string,
	opts: { overrideLint?: boolean } = {},
): Promise<SendResult | { ok: false; blocked: "voice_lint"; violations: Awaited<ReturnType<typeof lintVoiceText>>["violations"] }> {
	const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId));
	if (!row) return { ok: false, error: "draft not found" };
	if (row.status === "sent") return { ok: false, error: "already sent" };
	// attachment budget: refusing here keeps a too-big send out of Gmail's reject path
	if (row.attachments.reduce((s, a) => s + a.size, 0) > MAX_TOTAL_BYTES) {
		return { ok: false, error: `attachments total ${(row.attachments.reduce((s, a) => s + a.size, 0) / 1048576).toFixed(1)}MB — Gmail rejects sends over 25MB` };
	}


	const body = bodyOverride ?? row.body;

	const account = await getPrimaryAccount();
	if (!account) return { ok: false, error: "NO_ACCOUNT: connect Gmail first" };

	// voice send gate: un-fixed avoid-violations block the send. The human can
	// override — that override is recorded as signal for adapting the rules.
	const lint = await lintVoiceText(body, { surface: "email" });
	if (lint.avoidCount > 0 && !opts.overrideLint) {
		return { ok: false, blocked: "voice_lint", violations: lint.violations };
	}
	if (lint.avoidCount > 0 && opts.overrideLint) {
		await recordLintOverrides(lint.violations.map((v) => v.patternId), outboxId);
	}

	// reply threading: find the last message in the thread
	let inReplyToGmailId: string | undefined;
	if (row.threadId) {
		const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, row.threadId));
		if (thread) {
			const full = await threadWithMessages(account, thread.id);
			// last inbound so the reply threads onto their message; a sent-only
			// thread (follow-up to unanswered cold email) threads onto my own send
			inReplyToGmailId = full?.messages.filter((m) => !m.isSent).at(-1)?.gmailId ?? full?.messages.at(-1)?.gmailId;
		}
	}

	// signature: explicit per-draft choice wins; NULL = auto (campaign → plain,
	// otherwise full). 'none' = bare send.
	const sig = row.signature === "none" ? undefined : (row.signature ?? (row.campaignCompanyId ? "plain" : "full")) as "full" | "plain" | undefined;
	const deliveredBody = sig ? `${body}\n\n${SIGNATURES[sig].plain}` : body;

	try {
		// a missing/corrupt attachment file fails the send — never deliver the
		// email without what it promises (the row lands as failed, retryable)
		const mimeAttachments = await loadAttachments(row.attachments);
		const { id: gmailMessageId, threadId: gmailThreadId } = await sendGmail(account, {
			to: row.toEmail,
			cc: row.ccEmail,
			bcc: row.bccEmail,
			subject: row.subject,
			body,
			signature: sig,
			inReplyToGmailId,
			attachments: mimeAttachments.length ? mimeAttachments : undefined,
		});
		// the sent body lands as its own tracked version (human author).
		// Best-effort: Gmail already accepted the send, so a version-history
		// failure must NOT fail the send — a "failed" mark invites a retry that
		// would duplicate the email.
		let tracked: Awaited<ReturnType<typeof trackText>> = null;
		try {
			tracked = await trackText("email_draft", row.id, row.loroSnapshot, "human", body);
		} catch (err) {
			console.error(`[email-outbox] sent but version-tracking failed for ${outboxId}:`, err);
		}
		await db
			.update(emailOutbox)
			.set({
				status: "sent",
				body,
				gmailMessageId,
				...(tracked ? { loroSnapshot: tracked.loroSnapshot, version: tracked.version } : {}),
			})
			.where(eq(emailOutbox.id, outboxId));
		// record the sent message locally — replies keep their thread current
		// without waiting for a sync; a NEW compose also gets its thread created
		// so the Sent tab updates on the immediate revalidate instead of on the
		// next Gmail sync
		let threadRowId = row.threadId;
		if (!threadRowId) {
			const [threadRow] = await db
				.insert(emailThreads)
				.values({
					accountId: account.id,
					gmailThreadId,
					subject: row.subject,
					snippet: "",
					fromName: account.email,
					fromEmail: account.email,
					unread: false,
					archived: true,
					lastMessageAt: new Date(),
				})
				.onConflictDoUpdate({
					target: emailThreads.gmailThreadId,
					set: { lastMessageAt: new Date(), subject: row.subject },
				})
				.returning();
			threadRowId = threadRow.id;
		}
		await db
			.insert(emailMessages)
			.values({
				threadId: threadRowId,
				gmailId: gmailMessageId,
				toEmails: row.toEmail,
				bodyText: deliveredBody,
				// local record already has the delivered text: '' marks the row
				// "checked" so open-backfill never refetches
				bodyHtml: "",
				date: new Date(),
				isSent: true,
			})
			.onConflictDoNothing({ target: emailMessages.gmailId });
		await db
			.update(emailThreads)
			.set({ lastMessageAt: new Date() })
			.where(eq(emailThreads.id, threadRowId));
		return { ok: true, gmailMessageId };
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		await db.update(emailOutbox).set({ status: "failed", error }).where(eq(emailOutbox.id, outboxId));
		return { ok: false, error };
	}
}

/**
 * Agent ingest (brain MCP create_email_draft): store an outbox row; the human
 * reviews/edits/sends in the UI. v1 of the draft's tracked history = the
 * agent's original body. The MCP layer lints BEFORE calling this (hard gate,
 * same as docs) — so everything landing here is already clean.
 */
export async function createEmailDraft(input: {
	to: string;
	subject: string;
	body: string;
	chatUuid: string;
	threadId?: string;
	cc?: string;
	bcc?: string;
	context?: string;
	campaignCompanyId?: string;
	campaignStep?: number;
	signature?: "full" | "plain" | "none";
	// absolute local file paths — the agent and server share the host
	attachments?: string[];
}): Promise<{ outboxId: string; attachmentError?: string }> {
	"use server";
	const [outbox] = await db
		.insert(emailOutbox)
		.values({
			threadId: input.threadId ?? null,
			toEmail: input.to,
			ccEmail: input.cc,
			bccEmail: input.bcc,
			subject: input.subject,
			body: input.body,
			chatUuid: input.chatUuid,
			campaignCompanyId: input.campaignCompanyId,
			campaignStep: input.campaignStep,
			...(input.signature ? { signature: input.signature } : {}),
		})
		.returning();
	// v1 of the draft's tracked history = the agent's original body
	const tracked = await trackText("email_draft", outbox.id, "", "agent", input.body);
	if (tracked) {
		await db
			.update(emailOutbox)
			.set({ loroSnapshot: tracked.loroSnapshot, version: tracked.version })
			.where(eq(emailOutbox.id, outbox.id));
	}
	if (input.attachments?.length) {
		const att = await attachLocalFiles(outbox.id, input.attachments);
		// the draft exists — a failed upload must NOT nuke it into a retry that
		// creates a duplicate row; the agent revises via draft_id instead
		if (!att.ok) return { outboxId: outbox.id, attachmentError: att.error };
	}
	return { outboxId: outbox.id };
}

/**
 * Agent revision of an existing draft (brain MCP create_email_draft with
 * draft_id): updates fields + body in place, body lands as an agent version —
 * no second outbox row.
 */
export async function updateEmailDraft(input: {
	outboxId: string;
	to: string;
	subject: string;
	body: string;
	cc?: string;
	bcc?: string;
	campaignCompanyId?: string;
	campaignStep?: number;
	signature?: "full" | "plain" | "none";
	attachments?: string[];
}): Promise<{ outboxId: string; updated: true; version: number | null; attachmentError?: string } | { error: string }> {
	"use server";
	const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, input.outboxId));
	if (!row) return { error: "draft not found — call create_email_draft without draft_id to make a new one" };
	if (row.status === "sent") return { error: "draft already sent" };
	await db
		.update(emailOutbox)
		.set({
			toEmail: input.to,
			subject: input.subject,
			...(input.cc !== undefined ? { ccEmail: input.cc } : {}),
			...(input.bcc !== undefined ? { bccEmail: input.bcc } : {}),
			...(input.campaignCompanyId !== undefined ? { campaignCompanyId: input.campaignCompanyId, campaignStep: input.campaignStep } : {}),
			...(input.signature ? { signature: input.signature } : {}),
		})
		.where(eq(emailOutbox.id, input.outboxId));
	const version = await saveDraftBody(input.outboxId, input.body, "agent");
	if (input.attachments?.length) {
		const att = await attachLocalFiles(input.outboxId, input.attachments);
		if (!att.ok) return { outboxId: input.outboxId, updated: true, version, attachmentError: att.error };
	}
	return { outboxId: input.outboxId, updated: true, version };
}

/**
 * Persist a human edit to a draft body (Drafts tab autosave / PUT endpoint).
 * CRDT-tracked like docs: hunk-diffed into the Loro snapshot + version row.
 * Returns the new version number (unchanged if body identical).
 */
export async function saveDraftBody(
	outboxId: string,
	body: string,
	author: "human" | "agent" = "human",
): Promise<number | null> {
	"use server"; // same client-bundle leak as createEmailDraft
	const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, outboxId));
	if (!row) return null;
	const tracked = await trackText("email_draft", outboxId, row.loroSnapshot, author, body);
	if (!tracked) return row.version;
	await db
		.update(emailOutbox)
		.set({ body, loroSnapshot: tracked.loroSnapshot, version: tracked.version })
		.where(eq(emailOutbox.id, outboxId));
	return tracked.version;
}
