import { query, formAction, revalidate } from "@solidjs/router";
import { redirect } from "@solidjs/web";
import { eq, and, desc, asc, inArray, isNull, isNotNull, ilike, gt, gte, lte, notInArray, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { dateOrNull } from "./queries";
import { getAuthedClient, getCurrentUser } from "./session";
import { exchangeGithubCode, verifyGithubAuthState } from "./github-prs";
import { supabaseService } from "./supabase";
import { db } from "~/db";
import {
	companies,
	clientMembers,
	clientCompanyMembers,
	clientMemberEmails,
	projects,
	documents,
	invoices,
	deliverables,
	deliverableUpdates,
	timeEntries,
	tools,
	apiKeys,
	outreachProspects,
	videos,
	campaigns,
	campaignCompanies,
	emailMessages,
	brainRequests,
	docs,
	OUTREACH_STAGES,
	quotes,
	quoteItems,
	quoteVersions,
	quoteSignatures,
	entityLinks,
	pullRequests,
	githubUsers,
	githubInstallations,
	reviewerInstallations,
	reviewerReviews,
} from "~/db/schema";
import type {
	DocumentType,
	InvoiceStatus,
	DeliverableStatus,
	OutreachStage,
	OutreachProspect,
	CampaignTouch,
} from "~/db/schema";
import { getPersonDossier } from "~/lib/people";
import { grossSavedForCompany, billedAmount } from "~/lib/value";
import { generateApiKey, hashKey, keyPrefix } from "~/lib/crypto";
import { normalizeBrainTools } from "~/lib/brain-activity";
import { contactSuggestionsFor, latestThreadFor } from "~/lib/outreach-email";
import { triggerSyncIfStale } from "~/lib/email-queries";
import { campaignStats } from "~/lib/campaign-stats";
import { setProspectVideo } from "~/lib/videos";
import { createDoc } from "~/lib/docs";
import { computeQuoteTotals } from "~/lib/quotes";
import { getProjectQuery, getProjectsQuery } from "~/lib/queries";
import { getProjectActuals } from "~/lib/quote-actuals";
import type { Video } from "~/db/schema";
import type { QuoteStatus } from "~/db/schema";

// ── Auth guard ────────────────────────────────────────────────────

export async function requireAdmin() {
	const supabase = await getAuthedClient();
	if (!supabase) throw redirect("/admin/login");
}

// ── Companies ─────────────────────────────────────────────────────

export const getCompaniesQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db.select().from(companies).orderBy(desc(companies.createdAt));
}, "admin-companies");

export const createCompanyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.insert(companies).values({
		name: String(formData.get("name")),
	});
	throw redirect("/admin/companies");
}, "createCompany");

/** Pseudonyms the meeting publisher matches against Anarlog titles.
 *  Input: comma-separated; stored as a JSON array of strings. */
export const updateCompanyAliasesAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const aliases = String(formData.get("aliases") || "")
		.split(",")
		.map((a) => a.trim())
		.filter(Boolean);
	await db
		.update(companies)
		.set({ aliases: aliases.length ? JSON.stringify(aliases) : null })
		.where(eq(companies.id, id));
	return { success: "Aliases saved." };
}, "updateCompanyAliases");

// ── Members ───────────────────────────────────────────────────────

export const getMembersQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db.select().from(clientMembers).orderBy(desc(clientMembers.createdAt));
}, "admin-members");

export const getCompanyMembersQuery = query(async (companyId: string) => {
	"use server";
	await requireAdmin();
	return db
		.select({
			...getTableColumns(clientMembers),
		})
		.from(clientCompanyMembers)
		.innerJoin(
			clientMembers,
			eq(clientMembers.id, clientCompanyMembers.memberId),
		)
		.where(eq(clientCompanyMembers.companyId, companyId));
}, "admin-company-members");

export const createMemberAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const companyId = String(formData.get("company_id"));
	const email = String(formData.get("email")).toLowerCase();
	const name = String(formData.get("name"));

	const [member] = await db.insert(clientMembers).values({ name, email }).returning();

	// Link member to the company first so the row is fully usable regardless of
	// whether the invite email sends on the first try.
	await db
		.insert(clientCompanyMembers)
		.values({ memberId: member.id, companyId })
		.onConflictDoNothing();

	// Supabase sends the invite email; the client sets their own password.
	const redirectTo = inviteRedirect();
	const { error } = await supabaseService().auth.admin.inviteUserByEmail(email, {
		data: { name },
		...(redirectTo ? { redirectTo } : {}),
	});
	if (error)
		return { error: `Member created, but the invite email failed: ${error.message}` };

	return { success: `Member created. Invite sent to ${email}.` };
}, "createMember");

export const linkMemberAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const memberId = String(formData.get("member_id"));
	const companyId = String(formData.get("company_id"));
	await db
		.insert(clientCompanyMembers)
		.values({ memberId, companyId })
		.onConflictDoNothing();
	throw redirect(`/admin/companies/${companyId}`);
}, "linkMember");

// Full removal: deletes the auth user, the member row, and (via FK cascade)
// every company link + API key. Deliberately NOT an "unlink from one company" —
// if a member belongs to multiple companies, removing them here removes them
// everywhere. Re-create via "Add Member" if that's ever wrong.
export const removeMemberAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const memberId = String(formData.get("member_id"));
	const [member] = await db
		.select({ email: clientMembers.email })
		.from(clientMembers)
		.where(eq(clientMembers.id, memberId))
		.limit(1);
	if (!member) return { error: "Member not found" };

	// Find the auth user by email (admin API has no email filter; a handful of
	// users, one page covers it).
	const svc = supabaseService();
	const { data: users } = await svc.auth.admin.listUsers({ perPage: 1000 });
	const authUser = users?.users?.find((u) => u.email === member.email);
	if (authUser) {
		const { error: delError } = await svc.auth.admin.deleteUser(authUser.id);
		if (delError) return { error: `Could not delete login: ${delError.message}` };
	}

	await db.delete(clientMembers).where(eq(clientMembers.id, memberId));
	return { success: `${member.email} removed.` };
}, "removeMember");

/** Redirect URL for Supabase invite/reset links (must be allowlisted in Supabase Auth settings). */
function inviteRedirect(): string | null {
	const site = process.env.PUBLIC_SITE_URL;
	return site ? `${site.replace(/\/$/, "")}/portal/login` : null;
}

export const resendInviteAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const [member] = await db
		.select({ email: clientMembers.email })
		.from(clientMembers)
		.where(eq(clientMembers.id, id))
		.limit(1);
	if (!member) return { error: "Member not found" };

	const redirectTo = inviteRedirect();
	const { error } = await supabaseService().auth.admin.inviteUserByEmail(
		member.email,
		{ ...(redirectTo ? { redirectTo } : {}) },
	);
	if (error) return { error: error.message };
	return { success: "Invite re-sent." };
}, "resendInvite");

// Emails of auth users who have signed in at least once. A member whose email
// is NOT in this list has a pending invite (never accepted, expired, or the
// auth user was never created) — that's who the "Resend Invite" button is for.
export const getSignedInEmailsQuery = query(async () => {
	"use server";
	await requireAdmin();
	const { data } = await supabaseService().auth.admin.listUsers({
		perPage: 1000,
	});
	return (data?.users ?? [])
		.filter((u) => u.last_sign_in_at)
		.map((u) => u.email!);
}, "admin-signed-in-emails");

export const toggleMemberActiveAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const isActive = formData.get("is_active") === "true";
	await db
		.update(clientMembers)
		.set({ isActive: !isActive })
		.where(eq(clientMembers.id, id));
	throw redirect("/admin/companies");
}, "toggleMemberActive");

// ── Projects (for select dropdowns) ───────────────────────────────

export const getProjectsForSelectQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db
		.select({
			id: projects.id,
			name: projects.name,
			companyId: projects.companyId,
			companyName: companies.name,
		})
		.from(projects)
		.innerJoin(companies, eq(companies.id, projects.companyId))
		.orderBy(projects.name);
}, "admin-projects-select");

export const getCompaniesForSelectQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db.select().from(companies).orderBy(companies.name);
}, "admin-companies-select");

// ── Documents ─────────────────────────────────────────────────────

export const getDocumentsQuery = query(async (projectId: string) => {
	"use server";
	await requireAdmin();
	return db
		.select()
		.from(documents)
		.where(eq(documents.projectId, projectId))
		.orderBy(desc(documents.createdAt));
}, "admin-documents");

export const createDocumentLinkAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.insert(documents).values({
		projectId: String(formData.get("project_id")),
		type: String(formData.get("type") || "link") as DocumentType,
		title: String(formData.get("title")),
		url: String(formData.get("url")),
		description: String(formData.get("description") || ""),
		content: String(formData.get("content") || "") || null,
		visibility: "client",
	});
	const ref = formData.get("_referer");
	throw redirect(ref ? String(ref) : "/admin/companies");
}, "createDocumentLink");

export const deleteDocumentAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const storagePath = String(formData.get("storage_path") || "");
	const audioPath = String(formData.get("audio_path") || "");
	const paths = [storagePath, audioPath].filter(Boolean);
	try {
		if (paths.length) {
			const svc = supabaseService();
			await svc.storage.from("portal-docs").remove(paths);
		}
		await db.delete(documents).where(eq(documents.id, id));
		return { success: "Document deleted." };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Failed to delete document." };
	}
}, "deleteDocument");

// ── Invoices ──────────────────────────────────────────────────────

export const getInvoicesQuery = query(async (projectId: string) => {
	"use server";
	await requireAdmin();
	return db
		.select()
		.from(invoices)
		.where(eq(invoices.projectId, projectId))
		.orderBy(desc(invoices.createdAt));
}, "admin-invoices");

export const createInvoiceAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.insert(invoices).values({
		projectId: String(formData.get("project_id")),
		number: String(formData.get("number")),
		amount: Number(formData.get("amount")),
		status: String(formData.get("status") || "draft") as InvoiceStatus,
		issueDate: new Date(String(formData.get("issue_date"))),
		dueDate: formData.get("due_date")
			? new Date(String(formData.get("due_date")))
			: null,
		paymentUrl: formData.get("payment_url")
			? String(formData.get("payment_url"))
			: null,
		notes: String(formData.get("notes") || ""),
	});
	const ref = formData.get("_referer");
	throw redirect(ref ? String(ref) : "/admin/companies");
}, "createInvoice");

export const deleteInvoiceAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const storagePath = String(formData.get("storage_path") || "");
	try {
		if (storagePath) {
			const svc = supabaseService();
			await svc.storage.from("portal-docs").remove([storagePath]);
		}
		await db.delete(invoices).where(eq(invoices.id, id));
		return { success: "Invoice deleted." };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Failed to delete invoice." };
	}
}, "deleteInvoice");

// ── Replaced SaaS tools (savings ledger) ─────────────────────────

export const getCompanyToolsQuery = query(async (companyId: string) => {
	"use server";
	await requireAdmin();
	return db
		.select()
		.from(tools)
		.where(eq(tools.companyId, companyId))
		.orderBy(desc(tools.createdAt));
}, "admin-company-tools");

export const createToolAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.insert(tools).values({
		companyId: String(formData.get("company_id")),
		name: String(formData.get("name")),
		monthlyCost: Number(formData.get("monthly_cost") || 0),
		cutoverDate: formData.get("cutover_date") ? new Date(String(formData.get("cutover_date"))) : null,
		notes: String(formData.get("notes") || "") || null,
	});
	await revalidate(getCompanyValueQuery.key);
	throw redirect(String(formData.get("_referer") || "/admin/companies"));
}, "createTool");

export const updateToolAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db
		.update(tools)
		.set({
			name: String(formData.get("name")),
			monthlyCost: Number(formData.get("monthly_cost") || 0),
			cutoverDate: formData.get("cutover_date") ? new Date(String(formData.get("cutover_date"))) : null,
			notes: String(formData.get("notes") || "") || null,
		})
		.where(eq(tools.id, String(formData.get("id"))));
	await revalidate(getCompanyValueQuery.key);
	throw redirect(String(formData.get("_referer") || "/admin/companies"));
}, "updateTool");

export const deleteToolAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.delete(tools).where(eq(tools.id, String(formData.get("id"))));
	await revalidate(getCompanyValueQuery.key);
	return { success: "Tool removed." };
}, "deleteTool");

/** Gross saved, billable fees, and net ROI for one company (admin-only view). */
export const getCompanyValueQuery = query(async (companyId: string) => {
	"use server";
	await requireAdmin();
	const [toolRows, billed] = await Promise.all([
		db.select().from(tools).where(eq(tools.companyId, companyId)),
		db
			.select({ hours: timeEntries.hours, billable: timeEntries.billable, hourlyRate: projects.hourlyRate })
			.from(timeEntries)
			.innerJoin(projects, eq(projects.id, timeEntries.projectId))
			.where(eq(projects.companyId, companyId)),
	]);
	const grossSaved = grossSavedForCompany(
		toolRows.map((t) => ({ name: t.name, monthlyCost: t.monthlyCost, cutoverDate: t.cutoverDate })),
	);
	const fees = billedAmount(billed);
	return { grossSaved, fees, net: grossSaved - fees };
}, "admin-company-value");

// ── Deliverables ──────────────────────────────────────────────────

// ── Deliverables ──────────────────────────────────────────────────

export const getDeliverablesQuery = query(async (projectId: string) => {
	"use server";
	await requireAdmin();
	const delvs = await db
		.select()
		.from(deliverables)
		.where(eq(deliverables.projectId, projectId))
		.orderBy(deliverables.sortOrder);

	if (delvs.length === 0) return [];

	const allUpdates = await db
		.select()
		.from(deliverableUpdates)
		.where(
			inArray(
				deliverableUpdates.deliverableId,
				delvs.map((d) => d.id),
			),
		);

	const updatesByDeliverable = new Map<
		string,
		typeof deliverableUpdates.$inferSelect[]
	>();
	for (const u of allUpdates) {
		const arr = updatesByDeliverable.get(u.deliverableId) ?? [];
		arr.push(u);
		updatesByDeliverable.set(u.deliverableId, arr);
	}


	const allPrLinks = await db
		.select({
			fromId: entityLinks.fromId,
			repo: pullRequests.repo,
			number: pullRequests.number,
			title: pullRequests.title,
			state: pullRequests.state,
			merged: pullRequests.merged,
			url: pullRequests.url,
		})
		.from(entityLinks)
		.innerJoin(pullRequests, eq(pullRequests.id, entityLinks.toId))
		.where(
			and(
				eq(entityLinks.fromKind, "deliverable"),
				eq(entityLinks.toKind, "pull_request"),
				eq(entityLinks.linkType, "pr"),
				inArray(entityLinks.fromId, delvs.map((d) => d.id)),
			),
		);
	const prsByDeliverable = new Map<string, typeof allPrLinks>();
	for (const l of allPrLinks) {
		const arr = prsByDeliverable.get(l.fromId) ?? [];
		arr.push(l);
		prsByDeliverable.set(l.fromId, arr);
	}

	return delvs.map((d) => ({
		...d,
		updates: updatesByDeliverable.get(d.id) ?? [],
		prs: prsByDeliverable.get(d.id) ?? [],
	}));
}, "admin-deliverables");

export const createDeliverableAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const projectId = String(formData.get("project_id"));
	const [last] = await db
		.select({ sortOrder: deliverables.sortOrder })
		.from(deliverables)
		.where(eq(deliverables.projectId, projectId))
		.orderBy(desc(deliverables.sortOrder))
		.limit(1);
	const nextOrder = (last?.sortOrder ?? -1) + 1;
	await db.insert(deliverables).values({
		projectId,
		title: String(formData.get("title")),
		description: String(formData.get("description") || ""),
		sortOrder: nextOrder,
	});
	await revalidate(getDeliverablesQuery.key);
	return { success: "Deliverable created." };
}, "createDeliverable");

export const updateDeliverableStatusAction = formAction(
	async (formData: FormData) => {
		"use server";
		await requireAdmin();
		const id = String(formData.get("id"));
		const status = String(formData.get("status")) as DeliverableStatus;
		await db
			.update(deliverables)
			.set({ status, updatedAt: new Date() })
			.where(eq(deliverables.id, id));
		const ref = formData.get("_referer");
		throw redirect(ref ? String(ref) : "/admin/projects");
	},
	"updateDeliverableStatus",
);

export const addDeliverableUpdateAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const deliverableId = String(formData.get("deliverable_id"));
	const body = String(formData.get("body"));
	if (!body.trim()) return { error: "Update cannot be empty" };
	await db.insert(deliverableUpdates).values({ deliverableId, body });
	await db
		.update(deliverables)
		.set({ updatedAt: new Date() })
		.where(eq(deliverables.id, deliverableId));
	const ref = formData.get("_referer");
	throw redirect(ref ? String(ref) : "/admin/projects");
}, "addDeliverableUpdate");

export const deleteDeliverableAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	try {
		await db.delete(deliverables).where(eq(deliverables.id, id));
		return { success: "Deliverable deleted." };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Failed to delete deliverable." };
	}
}, "deleteDeliverable");

// ── Meeting drafts (Anarlog publisher) ─────────────────────────────────

export interface TranscriptBlock {
	speaker: string;
	start_ms: number;
	end_ms: number;
	text: string;
}

function parseBlocks(raw: string): TranscriptBlock[] {
	const arr: unknown = JSON.parse(raw);
	if (!Array.isArray(arr)) throw new Error("blocks must be a JSON array");
	return arr.map((b: any) => ({
		speaker: String(b.speaker ?? "Speaker"),
		start_ms: Number(b.start_ms) || 0,
		end_ms: Number(b.end_ms) || 0,
		text: String(b.text ?? "").trim(),
	}));
}

export function renderTranscript(blocks: TranscriptBlock[]): string {
	return blocks
		.filter((b) => b.text)
		.map((b) => `${b.speaker}: ${b.text}`)
		.join("\n\n");
}

export const getMeetingDraftsQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db
		.select({
			id: documents.id,
			title: documents.title,
			description: documents.description,
			createdAt: documents.createdAt,
			hasAudio: documents.audioPath,
			projectId: documents.projectId,
		})
		.from(documents)
		.where(eq(documents.visibility, "draft"))
		.orderBy(desc(documents.createdAt));
}, "admin-meeting-drafts");

export const getMeetingDraftQuery = query(async (id: string) => {
	"use server";
	await requireAdmin();
	const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	return doc ?? null;
}, "admin-meeting-draft");

/** Persist in-editor changes (title, block text) without publishing. */
export const saveMeetingDraftAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const title = String(formData.get("title") || "Untitled Transcript");
	const blocks = parseBlocks(String(formData.get("blocks_json")));
	await db
		.update(documents)
		.set({ title, transcriptJson: JSON.stringify(blocks) })
		.where(eq(documents.id, id));
	return { success: "Draft saved." };
}, "saveMeetingDraft");

/** Pad kept ranges ±300ms and merge overlaps/tiny gaps so cuts don't clip words. */
function mergeKeptRanges(blocks: TranscriptBlock[]): Array<[number, number]> {
	const PAD = 300;
	const sorted = blocks
		.filter((b) => b.end_ms > b.start_ms)
		.sort((a, b) => a.start_ms - b.start_ms)
		.map((b) => [Math.max(0, b.start_ms - PAD), b.end_ms + PAD] as [number, number]);
	const merged: Array<[number, number]> = [];
	for (const r of sorted) {
		const last = merged[merged.length - 1];
		if (last && r[0] <= last[1] + 500) {
			last[1] = Math.max(last[1], r[1]);
		} else {
			merged.push([...r] as [number, number]);
		}
	}
	return merged;
}

/** Publish a meeting draft: cut audio to the kept ranges, rewrite content,
 *  assign the project, flip visibility to client. */
export const publishMeetingAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const projectId = String(formData.get("project_id") || "");
	if (!projectId) return { error: "Pick a project before publishing." };
	const blocks = parseBlocks(String(formData.get("blocks_json")));
	if (blocks.length === 0) return { error: "Nothing left to publish — all blocks cut." };

	const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
	if (!doc) return { error: "Draft not found." };

	const svc = supabaseService();
	let audioPath = doc.audioPath;
	let audioFileName = doc.audioFileName;

	// Audio must (a) reflect the cuts and (b) live under `${projectId}/` —
	// /api/download authorizes client access by path prefix.
	const needsRelocate = !!doc.audioPath && !doc.audioPath.startsWith(`${projectId}/`);
	const needsSplice = !!doc.audioPath;
	if (doc.audioPath && (needsRelocate || needsSplice)) {
		const { data: blob, error: dlErr } = await svc.storage
			.from("portal-docs")
			.download(doc.audioPath);
		if (dlErr || !blob) {
			return { error: `Could not fetch audio: ${dlErr?.message ?? "empty"}` };
		}

		let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
		if (needsSplice) {
			const ranges = mergeKeptRanges(blocks);
			const spliced = await spliceAudio(bytes, ranges);
			if (spliced.error) return spliced;
			bytes = spliced.bytes!;
		}

		// splice output is always mp3 — force the extension to match, whatever
		// the draft was uploaded as (m4a re-encoded by the upload route, etc.)
		const base = (audioFileName || "audio").replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
		const newPath = `${projectId}/${Date.now()}-${base}.mp3`;
		const { error: upErr } = await svc.storage.from("portal-docs").upload(newPath, bytes, {
			contentType: "audio/mpeg",
		});
		if (upErr) return { error: `Audio re-upload failed: ${upErr.message}` };
		// Remove the original draft upload (old project-scoped paths stay if same project)
		if (doc.audioPath !== newPath) {
			await svc.storage.from("portal-docs").remove([doc.audioPath]);
		}
		audioPath = newPath;
	}

	await db
		.update(documents)
		.set({
			projectId,
			content: renderTranscript(blocks),
			transcriptJson: JSON.stringify(blocks),
			audioPath,
			audioFileName,
			visibility: "client",
		})
		.where(eq(documents.id, id));
	return { success: "Published." };
}, "publishMeeting");

/** ffmpeg keep-list splice: atrim each range, concat. Returns re-encoded mp3. */
async function spliceAudio(
	input: Uint8Array,
	ranges: Array<[number, number]>,
): Promise<{ bytes?: Uint8Array; error?: string }> {
	const dir = `${process.env.TMPDIR ?? "/tmp"}/mc-splice-${Date.now()}-${crypto.randomUUID()}`;
	const inPath = `${dir}/in.audio`;
	const outPath = `${dir}/out.mp3`;
	await Bun.write(inPath, input);
	const run = async (cmd: string[]) => {
		const proc = Bun.spawn({ cmd, stdout: "ignore", stderr: "pipe", timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
		const code = await proc.exited;
		return { ok: code === 0, stderr: code === 0 ? "" : await new Response(proc.stderr).text() };
	};

	// Supabase Free caps every object at 50MB — size the bitrate from the
	// output duration so any meeting length fits (same math as the upload
	// route's reencodeAudio; 96k ceiling, 16k floor).
	const durationSec = ranges.reduce((sum, [s, e]) => sum + (e - s) / 1000, 0);
	const TARGET_BYTES = 45 * 1024 * 1024;
	const kbps = Math.min(96, Math.max(16, Math.floor((TARGET_BYTES * 8) / durationSec / 1000)));

	const parts = ranges.map(
		([s, e], i) =>
			`[0:a]atrim=start=${(s / 1000).toFixed(3)}:end=${(e / 1000).toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
	);
	const filter =
		parts.join(";") + `;${ranges.map((_, i) => `[a${i}]`).join("")}concat=n=${ranges.length}:v=0:a=1[out]`;
	const res = await run([
		"ffmpeg", "-hide_banner", "-loglevel", "error",
		"-i", inPath,
		"-filter_complex", filter,
		"-map", "[out]",
		"-b:a", `${kbps}k`,
		outPath,
	]);
	if (!res.ok) {
		return { error: `ffmpeg failed (is it installed?): ${res.stderr.slice(0, 300)}` };
	}
	const out = await Bun.file(outPath).bytes();
	await Bun.$`rm -rf ${dir}`.nothrow().quiet();
	return { bytes: out };
}

// ── Admin API keys (memberless — server-to-server, e.g. meeting publisher) ──

export const getAdminApiKeysQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db
		.select({
			id: apiKeys.id,
			label: apiKeys.label,
			keyPrefix: apiKeys.keyPrefix,
			lastUsedAt: apiKeys.lastUsedAt,
			revokedAt: apiKeys.revokedAt,
			createdAt: apiKeys.createdAt,
		})
		.from(apiKeys)
		.where(isNull(apiKeys.memberId))
		.orderBy(desc(apiKeys.createdAt));
}, "admin-api-keys");

export const createAdminApiKeyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const label = String(formData.get("label") || "Default");
	const rawKey = generateApiKey();
	try {
		await db.insert(apiKeys).values({
			memberId: null,
			label,
			keyHash: hashKey(rawKey),
			keyPrefix: keyPrefix(rawKey),
		});
	} catch (err) {
		return { error: err instanceof Error ? err.message : "Failed to create API key." };
	}
	await revalidate(getAdminApiKeysQuery.key);
	return { key: rawKey }; // shown once — only the hash is stored
}, "createAdminApiKey");

export const revokeAdminApiKeyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	try {
		await db
			.update(apiKeys)
			.set({ revokedAt: new Date() })
			.where(and(eq(apiKeys.id, id), isNull(apiKeys.memberId)));
		return { success: "Key revoked." };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "Failed to revoke key." };
	}
}, "revokeAdminApiKey");

// ── Outreach pipeline ───────────────────────────────────────────

export type ProspectEmailStatus = {
	lastSentAt: Date | null;
	repliedAt: Date | null;
	replySnippet: string | null;
};

/** Email status for one prospect address, read straight from the synced
 *  corpus: last outbound to that address + the newest inbound from it AFTER
 *  that send (a random old email from the same address is not a reply).
 *  ponytail: ILIKE + per-prospect queries — a handful of prospects over a
 *  one-mailbox corpus; index if the pipeline ever grows past that. */
async function prospectEmailStatus(email: string): Promise<ProspectEmailStatus> {
	const [lastSent] = await db
		.select({ date: emailMessages.date })
		.from(emailMessages)
		.where(and(eq(emailMessages.isSent, true), ilike(emailMessages.toEmails, `%${email}%`)))
		.orderBy(desc(emailMessages.date))
		.limit(1);
	const replyCond = lastSent
		? and(eq(emailMessages.isSent, false), eq(emailMessages.fromEmail, email), gt(emailMessages.date, lastSent.date))
		: and(eq(emailMessages.isSent, false), eq(emailMessages.fromEmail, email));
	const [reply] = await db
		.select({ date: emailMessages.date, bodyText: emailMessages.bodyText })
		.from(emailMessages)
		.where(replyCond)
		.orderBy(desc(emailMessages.date))
		.limit(1);
	return {
		lastSentAt: lastSent?.date ?? null,
		repliedAt: reply?.date ?? null,
		replySnippet: reply?.bodyText?.slice(0, 120) ?? null,
	};
}

// Both lists in one pass: filtering by `now()` on the server keeps the
// due-now list identical between SSR and hydration. Each prospect also gets
// its email status; a detected reply auto-advances a `sent` card to `replied`
// (idempotent — the stage flip stops it re-firing).
export const getOutreachQuery = query(async () => {
	"use server";
	await requireAdmin();
	// poke Gmail sync so the board is self-refreshing: reply detection reads
	// synced rows, and fresh rows land on the next board load (sync is
	// fire-and-forget — never block the board on Gmail round-trips)
	await triggerSyncIfStale().catch(() => {});
	const rows = await db
		.select()
		.from(outreachProspects)
		.orderBy(desc(outreachProspects.createdAt));
	// latest video per prospect (videos own the link now — one pass, newest wins)
	const videoRows = await db.select().from(videos).orderBy(desc(videos.createdAt));
	const videoByProspect = new Map<string, Video>();
	for (const v of videoRows) if (v.prospectId && !videoByProspect.has(v.prospectId)) videoByProspect.set(v.prospectId, v);
	const all = [] as (typeof rows[number] & { emailStatus: ProspectEmailStatus | null; video: Video | null })[];
	for (const p of rows) {
		const status = p.email ? await prospectEmailStatus(p.email) : null;
		if (status?.repliedAt && ["proposed", "sent", "watching"].includes(p.stage)) {
			await db.update(outreachProspects).set({ stage: "replied" }).where(eq(outreachProspects.id, p.id));
			p.stage = "replied";
		}
		all.push({ ...p, emailStatus: status, video: p.id ? (videoByProspect.get(p.id) ?? null) : null });
	}
	const now = new Date();
	const due = all
		.filter(
			(p) =>
				p.nextActionAt &&
				p.nextActionAt <= now &&
				p.stage !== "won" &&
				p.stage !== "shutdown",
		)
		.sort(
			(a, b) => a.nextActionAt!.getTime() - b.nextActionAt!.getTime(),
		);
	const campaignList = await db
		.select({ id: campaigns.id, name: campaigns.name })
		.from(campaigns)
		.orderBy(asc(campaigns.name));
	return { all, due, campaigns: campaignList };
}, "admin-outreach");

export const createOutreachAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const company = String(formData.get("company") || "").trim();
	if (!company) return { error: "Company is required." };
	const rawNext = String(formData.get("next_action_at") || "");
	const [created] = await db
		.insert(outreachProspects)
		.values({
			company,
			contactName: String(formData.get("contact_name") || "").trim() || null,
			email: String(formData.get("email") || "").trim() || null,
			brainUrl: String(formData.get("brain_url") || "").trim() || null,
			brainActivityKey: String(formData.get("brain_activity_key") || "").trim() || null,
			stage: String(formData.get("stage") || "proposed") as OutreachStage,
			// Client converts datetime-local to ISO+Z in the browser's tz before
			// submitting, so this parses to the intended instant regardless of
			// the server's TZ (prod runs UTC).
			nextActionAt: rawNext ? new Date(rawNext) : new Date(Date.now() + 5 * 86_400_000),
		})
		.returning({ id: outreachProspects.id });
	// optional video at creation — lands on the videos table
	const videoUrl = String(formData.get("video_url") || "").trim();
	if (videoUrl) {
		await setProspectVideo(created.id, {
			url: videoUrl,
			description: String(formData.get("video_description") || "").trim() || null,
		});
	}
	await revalidate(getOutreachQuery.key);
	await revalidate(getVideosQuery.key);
	return { success: `${company} added.` };
}, "createOutreach");

// next-action interval implied by each stage ADVANCE (plan: invite→+3d,
// follow-up→+4d, reply→+1d). Manual date edits always win — presets only
// apply when the advance button sends preset_next=1.
export const STAGE_NEXT_DAYS: Partial<Record<OutreachStage, number>> = {
	sent: 3,
	watching: 4,
	replied: 1,
	meeting: 1,
};

export const setOutreachStageAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const stage = String(formData.get("stage")) as OutreachStage;
	if (!OUTREACH_STAGES.includes(stage)) return { error: "Unknown stage." };
	const presetNext = String(formData.get("preset_next") || "") === "1";
	const days = STAGE_NEXT_DAYS[stage];
	await db
		.update(outreachProspects)
		.set({
			stage,
			...(presetNext && days
				? { nextActionAt: new Date(Date.now() + days * 86_400_000) }
				: {}),
		})
		.where(eq(outreachProspects.id, id));
	await revalidate(getOutreachQuery.key);
	return { success: `Stage → ${stage}.` };
}, "setOutreachStage");

// ICP qualification — researched by Collin (or the sourcing automation), never
// asked of the lead. icpApproved=yes is the gate that lets the connect
// automation send an invite.
export const setOutreachIcpAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const one = (k: string, allowed: string[]) => {
		const v = String(formData.get(k) || "");
		return allowed.includes(v) ? v : undefined;
	};
	await db
		.update(outreachProspects)
		.set({
			...(one("region", ["unknown", "Midwest", "other"]) ? { region: one("region", ["unknown", "Midwest", "other"]) } : {}),
			...(one("revenue_band", ["unknown", "low", "mid", "high"]) ? { revenueBand: one("revenue_band", ["unknown", "low", "mid", "high"]) } : {}),
			...(one("tech_team", ["unknown", "none", "small", "large"]) ? { techTeam: one("tech_team", ["unknown", "none", "small", "large"]) } : {}),
			...(one("ai_interest", ["unknown", "none", "some", "high"]) ? { aiInterest: one("ai_interest", ["unknown", "none", "some", "high"]) } : {}),
			...(formData.has("icp_approved")
				? { icpApproved: String(formData.get("icp_approved")) === "1" }
				: {}),
		})
		.where(eq(outreachProspects.id, id));
	await revalidate(getOutreachQuery.key);
	return { success: "ICP fields saved." };
}, "setOutreachIcp");

// Sidebar badge: prospects whose next action is due now (excludes terminal stages).
export const getDueOutreachCountQuery = query(async () => {
	"use server";
	await requireAdmin();
	const rows = await db
		.select({ id: outreachProspects.id })
		.from(outreachProspects)
		.where(
			and(
				isNotNull(outreachProspects.nextActionAt),
				lte(outreachProspects.nextActionAt, new Date()),
				notInArray(outreachProspects.stage, ["won", "shutdown"]),
			),
		);
	return rows.length;
}, "due-outreach-count");

// Brain URL + activity key for an existing prospect (formerly a Fly env secret).
export const setOutreachBrainAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	await db
		.update(outreachProspects)
		.set({
			brainUrl: String(formData.get("brain_url") || "").trim() || null,
			brainActivityKey: String(formData.get("brain_activity_key") || "").trim() || null,
		})
		.where(eq(outreachProspects.id, id));
	await revalidate(getOutreachQuery.key);
	return { success: "Brain settings saved." };
}, "setOutreachBrain");

// Videos list for /admin/videos — the videos table joined to its prospect.
export const getVideosQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db
		.select({
			video: videos,
			company: outreachProspects.company,
			stage: outreachProspects.stage,
		})
		.from(videos)
		.leftJoin(outreachProspects, eq(videos.prospectId, outreachProspects.id))
		.orderBy(desc(videos.createdAt));
}, "admin-videos");

// Video link + description for a prospect, on the videos table. Empty
// video_url removes the video ("empty clears, absent leaves unchanged" via
// has(): card + videos-page forms always submit both fields).
export const setOutreachVideoAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	if (!id) return { error: "id is required" };
	await setProspectVideo(id, {
		url: String(formData.get("video_url") || "").trim(),
		description: formData.has("video_description")
			? String(formData.get("video_description") || "").trim() || null
			: undefined,
	});
	await revalidate(getOutreachQuery.key);
	await revalidate(getVideosQuery.key);
	return { success: "Video saved." };
}, "setOutreachVideo");

export const setOutreachContactAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	if (!id) return { error: "id is required" };
	await db
		.update(outreachProspects)
		.set({
			contactName: String(formData.get("contact_name") || "").trim() || null,
			email: String(formData.get("email") || "").trim() || null,
		})
		.where(eq(outreachProspects.id, id));
	await revalidate(getOutreachQuery.key);
	await revalidate(getProspectEmailCardQuery.key);
	return { success: "Contact saved." };
}, "setOutreachContact");

export const setOutreachNextActionAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const raw = String(formData.get("next_action_at") || "");
	await db
		.update(outreachProspects)
		.set({
			nextActionAt: raw ? new Date(raw) : null,
			nextActionNote: String(formData.get("next_action_note") || "").trim() || null,
		})
		.where(eq(outreachProspects.id, id));
	await revalidate(getOutreachQuery.key);
	return { success: "Next action saved." };
}, "setOutreachNextAction");

// ── Outreach campaigns (sequences; the board tracks people, these track sends) ──

export const getCampaignsQuery = query(async () => {
	"use server";
	await requireAdmin();
	const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
	const cos = await db
		.select()
		.from(campaignCompanies)
		.orderBy(asc(campaignCompanies.sequenceStep), asc(campaignCompanies.companyName));
	// board linkage: which prospects came from each campaign (matched by FK)
	const linked = await db
		.select({
			id: outreachProspects.id,
			company: outreachProspects.company,
			stage: outreachProspects.stage,
			campaignId: outreachProspects.campaignId,
		})
		.from(outreachProspects);
	// Gmail-grounded send/reply state per company — same computation as the
	// campaign_stats MCP tool and the brain's campaign facts
	const stats = await campaignStats();
	const statsByCompany = new Map(stats.flatMap((s) => s.companies.map((c) => [c.id, c] as const)));
	return rows.map((c) => ({
		...c,
		companies: cos
			.filter((x) => x.campaignId === c.id)
			.map((x) => ({ ...x, sendStats: statsByCompany.get(x.id) ?? null })),
		prospects: linked.filter((p) => p.campaignId === c.id),
	}));
}, "admin-campaigns");

export type CampaignTemplatesResult = { success: string } | { error: string };

/** Admin campaigns editor write path: structural checks only (positive
 *  step, subject+body on non-blank touches, blank block = removed touch).
 *  Voice lint here is advisory client-side — saves always persist and the
 *  live LintedTextarea panel shows violations while editing. The MCP
 *  set_campaign_templates tool keeps its hard lint gate; agents write
 *  through a different path. */
export const setCampaignTemplatesAction = formAction(async (formData: FormData): Promise<CampaignTemplatesResult> => {
	"use server";
	await requireAdmin();
	const campaignId = String(formData.get("campaign_id") || "");
	if (!campaignId) return { error: "Campaign id is required." };
	const count = Number(formData.get("touch_count") || 0);
	const touches: CampaignTouch[] = [];
	for (let i = 0; i < count; i++) {
		const step = Number(formData.get(`touch_${i}_step`) || 0);
		const subject = String(formData.get(`touch_${i}_subject`) || "").trim();
		const body = String(formData.get(`touch_${i}_body`) || "");
		if (!subject && !body.trim()) continue; // blank block = removed touch
		if (!Number.isInteger(step) || step < 1) return { error: `Touch ${i + 1}: step must be a positive whole number.` };
		if (!subject || !body.trim()) return { error: `Touch ${step}: subject and body are required.` };
		touches.push({ step, subject, body });
	}
	await db.update(campaigns).set({ templates: touches }).where(eq(campaigns.id, campaignId));
	await revalidate(getCampaignsQuery.key);
	return { success: `Templates saved — ${touches.length} touch${touches.length === 1 ? "" : "es"}.` };
}, "setCampaignTemplates");

export const createCampaignAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const name = String(formData.get("name") || "").trim();
	if (!name) return { error: "Campaign name is required." };
	const description = String(formData.get("description") || "").trim() || null;
	await db.insert(campaigns).values({ name, description });
	await revalidate(getCampaignsQuery.key);
	return { success: `Campaign "${name}" created.` };
}, "createCampaign");

export const updateCampaignAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id") || "");
	if (!id) return { error: "Campaign id is required." };
	const name = String(formData.get("name") || "").trim();
	if (!name) return { error: "Campaign name is required." };
	const description = String(formData.get("description") || "").trim() || null;
	await db.update(campaigns).set({ name, description }).where(eq(campaigns.id, id));
	await revalidate(getCampaignsQuery.key);
	return { success: "Saved." };
}, "updateCampaign");

export const deleteCampaignAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	await db.delete(campaigns).where(eq(campaigns.id, id));
	await revalidate(getCampaignsQuery.key);
	await revalidate(getOutreachQuery.key);
	return { success: "Campaign deleted. Prospects keep their board stages." };
}, "deleteCampaign");

export const addCampaignCompanyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const campaignId = String(formData.get("campaign_id"));
	const companyName = String(formData.get("company_name") || "").trim();
	if (!companyName) return { error: "Company name is required." };
	const rawSend = String(formData.get("next_send_at") || "");
	try {
		await db.insert(campaignCompanies).values({
			campaignId,
			companyName,
			contactEmail: String(formData.get("contact_email") || "").trim() || null,
			nextSendAt: rawSend ? new Date(rawSend) : null,
			nextEmailNote: String(formData.get("next_email_note") || "").trim() || null,
		});
	} catch {
		return { error: `${companyName} is already in this campaign.` };
	}
	await revalidate(getCampaignsQuery.key);
	return { success: `${companyName} added.` };
}, "addCampaignCompany");

export const updateCampaignCompanyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const step = Number(formData.get("sequence_step") || 1);
	const rawSend = String(formData.get("next_send_at") || "");
	await db
		.update(campaignCompanies)
		.set({
			sequenceStep: Number.isFinite(step) && step > 0 ? Math.floor(step) : 1,
			nextSendAt: rawSend ? new Date(rawSend) : null,
			nextEmailNote: String(formData.get("next_email_note") || "").trim() || null,
			contactEmail: String(formData.get("contact_email") || "").trim() || null,
		})
		.where(eq(campaignCompanies.id, id));
	await revalidate(getCampaignsQuery.key);
	return { success: "Saved." };
}, "updateCampaignCompany");

export const deleteCampaignCompanyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.delete(campaignCompanies).where(eq(campaignCompanies.id, String(formData.get("id"))));
	await revalidate(getCampaignsQuery.key);
	return { success: "Removed." };
}, "deleteCampaignCompany");

export const setProspectCampaignAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const campaignId = String(formData.get("campaign_id") || "").trim();
	await db
		.update(outreachProspects)
		.set({ campaignId: campaignId || null })
		.where(eq(outreachProspects.id, id));
	await revalidate(getOutreachQuery.key);
	await revalidate(getCampaignsQuery.key);
	return { success: campaignId ? "Campaign linked." : "Campaign unlinked." };
}, "setProspectCampaign");

export interface BrainDigestItem {
	kind: string;
	headline: string;
	occurredOn?: string;
	citationUrl?: string;
}

// ponytail: fail-soft by design — the digest only drafts manual email
// content, so any failure (network, non-200, slow, bad JSON) degrades
// to "brain unreachable" and never blocks the page. Timeout via
// AbortSignal.timeout (Node 18+). 15s: Fly machines auto-stop; cold start ≫ warm latency.
export const getBrainDigestQuery = query(async (brainUrl: string) => {
	"use server";
	await requireAdmin();
	try {
		const res = await fetch(`${brainUrl.replace(/\/+$/, "")}/digest`, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return { error: "brain unreachable" as const };
		const json: unknown = await res.json();
		const raw = Array.isArray(json)
			? json
			: ((json as { items?: unknown[] })?.items ?? []);
		const items = (raw as Record<string, unknown>[])
			.slice(0, 3)
			.map(
				(i): BrainDigestItem => ({
					kind: String(i.kind ?? "item"),
					headline: String(i.headline ?? ""),
					occurredOn: i.occurredOn ? String(i.occurredOn) : undefined,
					citationUrl: i.citationUrl ? String(i.citationUrl) : undefined,
				}),
			)
			.filter((i) => i.headline);
		return { items };
	} catch {
		return { error: "brain unreachable" as const };
	}
}, "brain-digest");

export interface BrainActivity {
	visits: number;
	visitDays: number;
	lastVisit: string | null;
	toolCalls: number;
	lastToolAt: string | null;
	// max scroll depth reached, 0–100 (% of page height)
	maxDepth: number;
	clicks: number;
	// longest single-visit dwell, seconds
	maxDwell: number;
	tools: string[];
	// last connected agent client name, if any brain reported one
	agent?: string;
	// daily counts for the last 14 days (dd = YYYY-MM-DD, v = visits, t = mcp tool calls)
	days: { dd: string; v: number; t: number }[];
}

// Activity key lives on the prospect row (brain_activity_key column) —
// no more comma-separated env secret.
export const getBrainActivityQuery = query(async (prospectId: string) => {
	"use server";
	await requireAdmin();
	const [row] = await db
		.select({ brainUrl: outreachProspects.brainUrl, key: outreachProspects.brainActivityKey })
		.from(outreachProspects)
		.where(eq(outreachProspects.id, prospectId))
		.limit(1);
	if (!row?.brainUrl) return { error: "no key" as const };
	const key = row.key ?? "";
	if (!key) return { error: "no key" as const };
	const brainUrl = row.brainUrl;

	// Same fail-soft contract as the digest: engagement stats must never block
	// the board. No key for this prospect is "no data", not an error.
	try {
		const res = await fetch(`${brainUrl.replace(/\/+$/, "")}/activity`, {
			headers: { accept: "application/json", "x-activity-key": key },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return { error: "brain unreachable" as const };
		const j = (await res.json()) as Partial<BrainActivity>;
		return {
			activity: {
				visits: j.visits ?? 0,
				visitDays: j.visitDays ?? 0,
				lastVisit: j.lastVisit ?? null,
				toolCalls: j.toolCalls ?? 0,
				lastToolAt: j.lastToolAt ?? null,
				maxDepth: j.maxDepth ?? 0,
				clicks: j.clicks ?? 0,
				maxDwell: j.maxDwell ?? 0,
				tools: normalizeBrainTools(j.tools),
				agent: typeof j.agent === "string" && j.agent ? j.agent : undefined,
				days: Array.isArray(j.days)
					? j.days.map((d) => ({ dd: String(d.dd), v: Number(d.v) || 0, t: Number(d.t) || 0 }))
					: [],
			} satisfies BrainActivity,
		};
	} catch {
		return { error: "brain unreachable" as const };
	}
}, "brain-activity");

// Email preview + address suggestions for one prospect, from synced threads.
// DB-only (no Gmail round-trip) so the dialog can render it inline.
export const getProspectEmailCardQuery = query(async (prospectId: string) => {
	"use server";
	await requireAdmin();
	const [p] = await db
		.select({ email: outreachProspects.email })
		.from(outreachProspects)
		.where(eq(outreachProspects.id, prospectId))
		.limit(1);
	if (!p?.email) return null;
	const [card, suggestions] = await Promise.all([
		latestThreadFor(p.email),
		contactSuggestionsFor(p.email),
	]);
	return {
		email: p.email,
		card,
		suggestions: suggestions
			.filter((s) => s.email !== p.email!.toLowerCase())
			.slice(0, 4),
	};
}, "prospect-email-card");

// Wipes the brain's activity_events rows via POST /activity/reset (gated by
// the same x-activity-key as GET /activity). Fails soft — an old brain
// without the route surfaces "brain rejected the reset".
export const resetBrainActivityAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const [row] = await db
		.select({ brainUrl: outreachProspects.brainUrl, key: outreachProspects.brainActivityKey })
		.from(outreachProspects)
		.where(eq(outreachProspects.id, id))
		.limit(1);
	if (!row?.brainUrl || !row.key) return { error: "No brain activity key configured." };
	try {
		const res = await fetch(`${row.brainUrl.replace(/\/+$/, "")}/activity/reset`, {
			method: "POST",
			headers: { "x-activity-key": row.key },
			signal: AbortSignal.timeout(15_000),
		});
		if (!res.ok) return { error: "Brain rejected the reset — brain needs /activity/reset deployed." };
	} catch {
		return { error: "brain unreachable" };
	}
	await revalidate(getBrainActivityQuery.key);
	return { success: "Brain metrics reset." };
}, "resetBrainActivity");

// ── Brain requests (the /brain lead magnet pipeline) ────────────────────────

export const getBrainRequestsQuery = query(async () => {
	"use server";
	await requireAdmin();
	const rows = await db.select().from(brainRequests).orderBy(desc(brainRequests.createdAt)).limit(200);
	const issues = rows.length
		? await db
				.select({ id: docs.id, title: docs.title })
				.from(docs)
				.where(inArray(docs.id, [...new Set(rows.map((r) => r.sourceDocId).filter((x): x is string => !!x))]))
		: [];
	const titles = new Map(issues.map((i) => [i.id, i.title]));
	return rows.map((r) => ({
		...r,
		answers: (r.answers ?? {}) as Record<string, unknown>,
		sourceTitle: r.sourceDocId ? titles.get(r.sourceDocId) ?? null : null,
	}));
}, "brain-requests");

export const setBrainRequestStatusAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id") || "");
	const status = String(formData.get("status") || "") as "new" | "building" | "delivered" | "declined";
	if (!["new", "building", "delivered", "declined"].includes(status)) return { error: "Unknown status." };
	await db.update(brainRequests).set({ status }).where(eq(brainRequests.id, id));
	await revalidate(getBrainRequestsQuery.key);
	return { success: `Status → ${status}.` };
}, "setBrainRequestStatus");

// Ship the brain → it becomes outreach pipeline entry. Links (or creates) the
// matching prospect row and marks the request delivered.
export const linkBrainRequestToProspectAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id") || "");
	const [req] = await db.select().from(brainRequests).where(eq(brainRequests.id, id)).limit(1);
	if (!req) return { error: "Request not found." };
	const company = String(formData.get("company") || "").trim() || req.company;
	const [existing] = await db
		.select({ id: outreachProspects.id })
		.from(outreachProspects)
		.where(ilike(outreachProspects.company, company))
		.limit(1);
	const prospectId =
		existing?.id ??
		(
			await db
				.insert(outreachProspects)
				.values({ company, sourceNote: `brain-request ${req.createdAt.toISOString().slice(0, 10)}` })
				.returning({ id: outreachProspects.id })
		)[0].id;
	await db.update(brainRequests).set({ prospectId, status: "delivered" }).where(eq(brainRequests.id, id));
	await revalidate(getBrainRequestsQuery.key);
	return { success: `Linked to prospect: ${company}.` };
}, "linkBrainRequestProspect");

// ── Quotes ─────────────────────────────────────────────────────────
// Fixed-price proposals; accepted+signed = the contract. Body prose lives in
// a docs row; priced structure is quote_line_items (required/optional).

export const getQuotesQuery = query(async () => {
	"use server";
	await requireAdmin();
	const rows = await db
		.select({
			id: quotes.id,
			title: quotes.title,
			status: quotes.status,
			companyId: quotes.companyId,
			companyName: companies.name,
			projectId: quotes.projectId,
			projectName: projects.name,
			bodyDocId: quotes.bodyDocId,
			updatedAt: quotes.updatedAt,
		})
		.from(quotes)
		.leftJoin(companies, eq(companies.id, quotes.companyId))
		.leftJoin(projects, eq(projects.id, quotes.projectId))
		.orderBy(desc(quotes.updatedAt));
	const allItems = await db.select().from(quoteItems);
	return rows.map((q) => ({
		...q,
		totals: computeQuoteTotals(allItems.filter((i) => i.quoteId === q.id)),
	}));
}, "admin-quotes");

export const getProjectQuotesQuery = query(async (projectId: string) => {
	"use server";
	await requireAdmin();
	const rows = await db
		.select({ id: quotes.id, title: quotes.title, status: quotes.status, updatedAt: quotes.updatedAt, startDate: quotes.startDate, endDate: quotes.endDate })
		.from(quotes)
		.where(eq(quotes.projectId, projectId))
		.orderBy(desc(quotes.updatedAt));
	const allItems = await db.select().from(quoteItems);
	return rows.map((q) => ({
		...q,
		total: computeQuoteTotals(allItems.filter((i) => i.quoteId === q.id)).total,
	}));
}, "admin-project-quotes");

export const getQuoteQuery = query(async (id: string) => {
	"use server";
	await requireAdmin();
	const [row] = await db
		.select({ quote: quotes, companyName: companies.name, projectName: projects.name })
		.from(quotes)
		.leftJoin(companies, eq(companies.id, quotes.companyId))
		.leftJoin(projects, eq(projects.id, quotes.projectId))
		.where(eq(quotes.id, id))
		.limit(1);
	if (!row) return null;
	const [items, bodyDoc, versions, signatures] = await Promise.all([
		db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.sortOrder)),
		db
			.select({ id: docs.id, title: docs.title, markdown: docs.markdown, status: docs.status })
			.from(docs)
			.where(eq(docs.id, row.quote.bodyDocId))
			.limit(1),
		db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, id)).orderBy(desc(quoteVersions.version)),
		db.select().from(quoteSignatures).where(eq(quoteSignatures.quoteId, id)).orderBy(desc(quoteSignatures.createdAt)),
	]);
	return {
		...row.quote,
		companyName: row.companyName,
		projectName: row.projectName,
		items,
		totals: computeQuoteTotals(items),
		bodyDoc: bodyDoc[0] ?? null,
		versions,
		signatures,
		actuals: row.quote.projectId ? await getProjectActuals(row.quote.projectId) : null,
	};
}, "admin-quote");

export const createQuoteAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const companyId = String(formData.get("company_id") || "");
	if (!companyId) return { error: "Company is required." };
	const title = String(formData.get("title") || "").trim() || "Untitled quote";
	const doc = await createDoc(title, "", { genre: "quote" });
	const [row] = await db
		.insert(quotes)
		.values({
			companyId,
			projectId: formData.get("project_id") ? String(formData.get("project_id")) : null,
			bodyDocId: doc.id,
			title,
			validDays: Number(formData.get("valid_days")) || 30,
		})
		.returning({ id: quotes.id });
	revalidate(getQuotesQuery.key);
	throw redirect(`/admin/quotes/${row.id}`);
}, "createQuote");

export const updateQuoteMetaAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	// Partial update (drizzle ignores undefined): the quote detail form
	// submits every field; the project page sends only id + project_id.
	const values: Partial<typeof quotes.$inferInsert> = {};
	if (formData.has("title")) {
		const title = String(formData.get("title") || "").trim();
		if (title) values.title = title;
	}
	if (formData.has("project_id")) {
		const projectId = String(formData.get("project_id") || "") || null;
		if (projectId) {
			// portal access is company-scoped: a quote may only link to a
			// project of the same company
			const [project] = await db
				.select({ companyId: projects.companyId })
				.from(projects)
				.where(eq(projects.id, projectId))
				.limit(1);
			const [quote] = await db
				.select({ companyId: quotes.companyId })
				.from(quotes)
				.where(eq(quotes.id, id))
				.limit(1);
			if (!project || !quote || project.companyId !== quote.companyId) {
				return { error: "Quote belongs to a different company." };
			}
		}
		values.projectId = projectId;
	}
	if (formData.has("valid_days")) values.validDays = Number(formData.get("valid_days")) || 30;
	if (formData.has("quoted_cap_hours")) {
		values.quotedCapHours = formData.get("quoted_cap_hours") ? Number(formData.get("quoted_cap_hours")) : null;
	}
	if (formData.has("start_date")) values.startDate = dateOrNull(formData.get("start_date"));
	if (formData.has("end_date")) values.endDate = dateOrNull(formData.get("end_date"));
	await db.update(quotes).set(values).where(eq(quotes.id, id));
	await revalidate([
		getQuoteQuery.keyFor(id),
		getQuotesQuery.key,
		getProjectQuotesQuery.key,
		getProjectQuery.key,
		getProjectsQuery.key,
	]);
	return { success: "Saved." };
}, "updateQuoteMeta");

// Attach a quote to a project = link + contract dates + deliverables in one go.
// Required line items become deliverables, idempotent by title (safe to re-run).
export const importQuoteToProjectAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const quoteId = String(formData.get("quote_id") || "");
	const projectId = String(formData.get("project_id") || "");
	if (!quoteId || !projectId) return { error: "Quote and project are required." };
	const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1);
	const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
	if (!quote || !project) return { error: "Quote or project not found." };
	if (quote.companyId !== project.companyId) return { error: "Quote belongs to a different company." };
	if (quote.projectId && quote.projectId !== projectId) return { error: "Quote is attached to another project." };

	await db.update(quotes).set({ projectId }).where(eq(quotes.id, quoteId));
	// accepted quote = the contract: its dates win, but never clear the project's
	const projectValues: Partial<typeof projects.$inferInsert> = {};
	if (quote.startDate) projectValues.startDate = quote.startDate;
	if (quote.endDate) projectValues.endDate = quote.endDate;
	if (Object.keys(projectValues).length) {
		await db.update(projects).set(projectValues).where(eq(projects.id, projectId));
	}

	const items = await db
		.select()
		.from(quoteItems)
		.where(and(eq(quoteItems.quoteId, quoteId), eq(quoteItems.group, "required")));
	const existing = await db
		.select({ title: deliverables.title })
		.from(deliverables)
		.where(eq(deliverables.projectId, projectId));
	const taken = new Set(existing.map((d) => d.title.toLowerCase()));
	const fresh = items.filter((i) => !taken.has(i.name.toLowerCase()));
	if (fresh.length) {
		await db.insert(deliverables).values(
			fresh.map((i) => ({ projectId, title: i.name, description: i.detail ?? "", sortOrder: i.sortOrder })),
		);
	}
	await revalidate([
		getQuoteQuery.keyFor(quoteId),
		getQuotesQuery.key,
		getProjectQuotesQuery.key,
		getProjectQuery.key,
		getProjectsQuery.key,
		getDeliverablesQuery.key,
	]);
	return { success: fresh.length ? `Attached — imported ${fresh.length} deliverable(s).` : "Attached." };
}, "importQuoteToProject");

export const upsertQuoteItemAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const quoteId = String(formData.get("quote_id"));
	const values = {
		quoteId,
		group: (String(formData.get("group") || "required") === "optional" ? "optional" : "required") as "required" | "optional",
		name: String(formData.get("name") || "").trim(),
		detail: String(formData.get("detail") || "") || null,
		hours: Number(formData.get("hours")) || 0,
		unitRate: Number(formData.get("unit_rate")) || 0,
		sortOrder: Number(formData.get("sort_order")) || 0,
	};
	if (!values.name) return { error: "Line item name is required." };
	const itemId = String(formData.get("item_id") || "");
	if (itemId) await db.update(quoteItems).set(values).where(eq(quoteItems.id, itemId));
	else await db.insert(quoteItems).values(values);
	await revalidate([getQuoteQuery.keyFor(quoteId), getQuotesQuery.key]);
	return { success: "Line item saved." };
}, "upsertQuoteItem");

export const deleteQuoteItemAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const quoteId = String(formData.get("quote_id"));
	await db.delete(quoteItems).where(eq(quoteItems.id, String(formData.get("item_id"))));
	await revalidate([getQuoteQuery.keyFor(quoteId), getQuotesQuery.key]);
	return { success: "Line item removed." };
}, "deleteQuoteItem");

const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted", "rejected"];

// Human-only transitions (agents are drafts-only via MCP). Every transition
// snapshots the items — "what changed between sends".
export const setQuoteStatusAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const status = String(formData.get("status")) as QuoteStatus;
	if (!QUOTE_STATUSES.includes(status)) return { error: "Invalid status." };
	const [q] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
	if (!q) return { error: "Quote not found." };
	if (q.status === status) return { success: `Already ${status}.` };
	const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id));
	const totals = computeQuoteTotals(items);
	const [last] = await db
		.select({ version: quoteVersions.version })
		.from(quoteVersions)
		.where(eq(quoteVersions.quoteId, id))
		.orderBy(desc(quoteVersions.version))
		.limit(1);
	await db.insert(quoteVersions).values({
		quoteId: id,
		version: (last?.version ?? 0) + 1,
		status,
		itemsJson: items,
		subtotal: totals.total,
	});
	await db.update(quotes).set({ status }).where(eq(quotes.id, id));
	// accepted → sync the project's fixed price to the everything-in total
	if (status === "accepted" && q.projectId) {
		await db.update(projects).set({ fixedPrice: totals.total }).where(eq(projects.id, q.projectId));
	}
	await revalidate([getQuoteQuery.keyFor(id), getQuotesQuery.key, getProjectQuotesQuery.key, getProjectQuery.key, getProjectsQuery.key]);
	return { success: `Status → ${status}.` };
}, "setQuoteStatus");

// ── People (contact profile pages /admin/contacts) ───────────────
// A person = client_members row: one primary (login) email + extras in
// client_member_emails + company memberships. Creating a person here does
// NOT send a portal invite — that stays the company page's explicit flow.

export const getPeopleQuery = query(async () => {
	"use server";
	await requireAdmin();
	const [members, extras, memberships] = await Promise.all([
		db.select().from(clientMembers).orderBy(desc(clientMembers.createdAt)),
		db.select({ memberId: clientMemberEmails.memberId, email: clientMemberEmails.email }).from(clientMemberEmails),
		db
			.select({ memberId: clientCompanyMembers.memberId, companyId: companies.id, companyName: companies.name })
			.from(clientCompanyMembers)
			.innerJoin(companies, eq(clientCompanyMembers.companyId, companies.id)),
	]);
	return members.map((m) => ({
		...m,
		extraEmails: extras.filter((e) => e.memberId === m.id).map((e) => e.email),
		companies: memberships.filter((x) => x.memberId === m.id).map((x) => ({ id: x.companyId, name: x.companyName })),
	}));
}, "admin-people");

export const getPersonQuery = query(async (id: string) => {
	"use server";
	await requireAdmin();
	return getPersonDossier(id);
}, "admin-person");

const uniqueEmailError = (e: unknown) =>
	e instanceof Error && "code" in e && (e as { code?: string }).code === "23505"
		? "That email address already belongs to a person."
		: e instanceof Error
			? e.message
			: "Something went wrong.";

export const createPersonAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const name = String(formData.get("name") || "").trim();
	const email = String(formData.get("email") || "").trim().toLowerCase();
	if (!name || !email) return { error: "Name and email are required." };
	const companyId = String(formData.get("company_id") || "");
	try {
		const [member] = await db.insert(clientMembers).values({ name, email }).returning();
		if (companyId) {
			await db.insert(clientCompanyMembers).values({ memberId: member.id, companyId }).onConflictDoNothing();
		}
		await revalidate(getPeopleQuery.key);
		return { success: `${name} created.`, id: member.id };
	} catch (e) {
		return { error: uniqueEmailError(e) };
	}
}, "create-person");

export const addPersonEmailAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const memberId = String(formData.get("member_id"));
	const email = String(formData.get("email") || "").trim().toLowerCase();
	if (!email) return { error: "Email is required." };
	try {
		await db.insert(clientMemberEmails).values({ memberId, email });
		await revalidate([getPersonQuery.keyFor(memberId), getPeopleQuery.key]);
		return { success: `${email} added.` };
	} catch (e) {
		return { error: uniqueEmailError(e) };
	}
}, "add-person-email");

export const removePersonEmailAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const memberId = String(formData.get("member_id"));
	await db.delete(clientMemberEmails).where(eq(clientMemberEmails.id, id));
	await revalidate([getPersonQuery.keyFor(memberId), getPeopleQuery.key]);
	return { success: "Address removed." };
}, "remove-person-email");

export const linkPersonCompanyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const memberId = String(formData.get("member_id"));
	const companyId = String(formData.get("company_id"));
	await db.insert(clientCompanyMembers).values({ memberId, companyId }).onConflictDoNothing();
	await revalidate([getPersonQuery.keyFor(memberId), getPeopleQuery.key]);
	return { success: "Company linked." };
}, "link-person-company");

export const unlinkPersonCompanyAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const memberId = String(formData.get("member_id"));
	const companyId = String(formData.get("company_id"));
	await db
		.delete(clientCompanyMembers)
		.where(and(eq(clientCompanyMembers.memberId, memberId), eq(clientCompanyMembers.companyId, companyId)));
	await revalidate([getPersonQuery.keyFor(memberId), getPeopleQuery.key]);
	return { success: "Company unlinked." };
}, "unlink-person-company");

// ── GitHub identities (Basalt OAuth-issued sessions ↔ GitHub users) ──

export const getGithubInstallationsQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db.select().from(githubInstallations).orderBy(desc(githubInstallations.createdAt));
}, "github-installations");

export const getGithubIdentitiesQuery = query(async () => {
	"use server";
	await requireAdmin();
	return db.select().from(githubUsers).orderBy(desc(githubUsers.linkedAt));
}, "github-identities");

// ── Basalt Reviewer (PR-review product, written by the reviewer service) ──

/** Recent PR reviews with their installation's company name, for
 *  /admin/github/reviews and the company page. Read-only — the reviewer
 *  service owns writes. */
export const getReviewerReviewsQuery = query(async (companyId?: string) => {
	"use server";
	await requireAdmin();
	const rows = await db
		.select({
			review: reviewerReviews,
			companyName: companies.name,
			accountLogin: reviewerInstallations.accountLogin,
		})
		.from(reviewerReviews)
		.leftJoin(reviewerInstallations, eq(reviewerInstallations.installationId, reviewerReviews.installationId))
		.leftJoin(companies, eq(companies.id, reviewerInstallations.companyId))
		.where(companyId ? eq(reviewerInstallations.companyId, companyId) : undefined)
		.orderBy(desc(reviewerReviews.createdAt))
		.limit(companyId ? 30 : 100);
	return rows;
}, "reviewer-reviews");

/** This month's reviewer usage for one company's installations: fast/deep
 *  counts, security findings total, and install approval state. */
export const getCompanyReviewerUsageQuery = query(async (companyId: string) => {
	"use server";
	await requireAdmin();
	const installs = await db
		.select()
		.from(reviewerInstallations)
		.where(eq(reviewerInstallations.companyId, companyId));
	if (!installs.length) return { installs, counts: [] };
	const monthStart = new Date();
	monthStart.setUTCDate(1);
	monthStart.setUTCHours(0, 0, 0, 0);
	const counts = await db
		.select({
			lane: reviewerReviews.lane,
			reviews: sql<number>`count(*)::int`,
			securityFindings: sql<number>`coalesce(sum(${reviewerReviews.securityCount}), 0)::int`,
		})
		.from(reviewerReviews)
		.where(
			and(
				inArray(
					reviewerReviews.installationId,
					installs.map((i) => i.installationId),
				),
				gte(reviewerReviews.createdAt, monthStart),
			),
		)
		.groupBy(reviewerReviews.lane);
	return { installs, counts };
}, "company-reviewer-usage");

export type GithubLinkPreview =
	| { status: "invalid-state" }
	| { status: "no-code" }
	| { status: "error"; message: string }
	| { status: "ready"; githubId: number; login: string; installationId: string };

/** The GitHub-redirected link page: verify state (if the flow was ours),
 *  exchange the code, and hand back who wants to link. */
export const getGithubLinkPreviewQuery = query(
	async (code: string, state: string, installationId: string): Promise<GithubLinkPreview> => {
		"use server";
		await requireAdmin();
		const secret = process.env.GITHUB_WEBHOOK_SECRET;
		if (state) {
			if (!secret || !verifyGithubAuthState(state, secret)) return { status: "invalid-state" };
		}
		if (!code) return { status: "no-code" };
		try {
			const identity = await exchangeGithubCode(code);
			return { status: "ready", ...identity, installationId };
		} catch (e) {
			return { status: "error", message: e instanceof Error ? e.message : "GitHub link failed" };
		}
	},
	"github-link-preview",
);

export const linkGithubIdentityAction = formAction(async (formData: FormData) => {
	"use server";
	const supabase = await getAuthedClient();
	if (!supabase) throw redirect("/admin/login");
	const user = await getCurrentUser();
	const githubId = Number(formData.get("github_id"));
	const login = String(formData.get("login"));
	if (!user?.id || !githubId || !login) return { error: "Missing user or GitHub identity" };
	await db
		.insert(githubUsers)
		.values({ githubId, login, basaltUserId: user.id })
		.onConflictDoUpdate({
			target: githubUsers.githubId,
			set: { login, basaltUserId: user.id, linkedAt: new Date() },
		});
	await revalidate([getGithubIdentitiesQuery.key]);
	throw redirect("/admin/github");
}, "link-github-identity");

export const unlinkGithubIdentityAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const githubId = Number(formData.get("github_id"));
	if (!githubId) return { error: "Missing github_id" };
	await db.delete(githubUsers).where(eq(githubUsers.githubId, githubId));
	await revalidate([getGithubIdentitiesQuery.key]);
	return { success: "GitHub identity unlinked." };
}, "unlink-github-identity");
