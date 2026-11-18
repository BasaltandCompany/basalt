// people.ts — person identity + the one dossier that feeds the profile page
// and the MCP get_person tool. Email↔person identity is READ-TIME address
// matching (primary + client_member_emails) — never stale, no derived link
// rows. Org relations are real FKs (prospects.contact_id / .company_id).
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, raw } from "~/db";
import {
	brainFacts,
	brainOpenLoops,
	brainPages,
	brainTimeline,
	clientCompanyMembers,
	clientMemberEmails,
	clientMembers,
	companies,
	deliverables,
	documents,
	emailMessages,
	emailThreads,
	invoices,
	outreachProspects,
	projects,
	quotes,
} from "~/db/schema";
import { slugify } from "./brain/core";
import { linksFor } from "~/registry/registry";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Brain page slug for a person — same keying syncPersons uses, so CRM
 *  contacts and corpus-derived pages (speakers, counterparties) converge. */
export const personSlug = (name: string) => `person-${slugify(name)}`;

/** Every address this person sends/receives from: login email + extras. */
export async function emailsForPerson(memberId: string): Promise<string[]> {
	const [member] = await db
		.select({ email: clientMembers.email })
		.from(clientMembers)
		.where(eq(clientMembers.id, memberId))
		.limit(1);
	if (!member) return [];
	const extra = await db
		.select({ email: clientMemberEmails.email })
		.from(clientMemberEmails)
		.where(eq(clientMemberEmails.memberId, memberId));
	return [...new Set([member.email, ...extra.map((r) => r.email)].map(normalizeEmail))];
}

export type PersonDossier = Awaited<ReturnType<typeof getPersonDossier>>;

/** Everything the firm knows about one person. Sections stay independent —
 *  an empty corpus renders empty states, never a failed query. */
export async function getPersonDossier(memberId: string) {
	const [member] = await db.select().from(clientMembers).where(eq(clientMembers.id, memberId)).limit(1);
	if (!member) return null;

	const addresses = await emailsForPerson(memberId);

	// ── Orgs + the work under them ──
	const memberCompanies = await db
		.select({ id: companies.id, name: companies.name })
		.from(clientCompanyMembers)
		.innerJoin(companies, eq(clientCompanyMembers.companyId, companies.id))
		.where(eq(clientCompanyMembers.memberId, memberId));
	const companyIds = memberCompanies.map((c) => c.id);

	const projectRows = companyIds.length
		? await db.select().from(projects).where(inArray(projects.companyId, companyIds)).orderBy(desc(projects.createdAt))
		: [];
	const projectIds = projectRows.map((p) => p.id);

	const [invoiceRows, deliverableRows, quoteRows] = await Promise.all([
		projectIds.length
			? db.select().from(invoices).where(inArray(invoices.projectId, projectIds)).orderBy(desc(invoices.createdAt))
			: Promise.resolve([]),
		projectIds.length
			? db.select().from(deliverables).where(inArray(deliverables.projectId, projectIds)).orderBy(desc(deliverables.createdAt))
			: Promise.resolve([]),
		companyIds.length
			? db
					.select({
						id: quotes.id,
						title: quotes.title,
						status: quotes.status,
						companyId: quotes.companyId,
						projectId: quotes.projectId,
						createdAt: quotes.createdAt,
						updatedAt: quotes.updatedAt,
					})
					.from(quotes)
					.where(inArray(quotes.companyId, companyIds))
					.orderBy(desc(quotes.updatedAt))
			: Promise.resolve([]),
	]);

	// ── Email: any message from/to one of their addresses (CC not parsed) ──
	const addrConds = addresses.flatMap((a) => [
		sql`lower(${emailMessages.fromEmail}) = ${a}`,
		sql`${emailMessages.toEmails} ILIKE ${`%${a}%`}`,
	]);
	const messageRows = addrConds.length
		? await db
				.select({
					id: emailMessages.id,
					threadId: emailMessages.threadId,
					subject: emailThreads.subject,
					fromName: emailMessages.fromName,
					fromEmail: emailMessages.fromEmail,
					toEmails: emailMessages.toEmails,
					isSent: emailMessages.isSent,
					date: emailMessages.date,
					attachments: emailMessages.attachments,
				})
				.from(emailMessages)
				.innerJoin(emailThreads, eq(emailMessages.threadId, emailThreads.id))
				.where(or(...addrConds))
				.orderBy(desc(emailMessages.date))
				.limit(25)
		: [];

	// ── Meetings: transcript speaker-name match + explicit entity_links ──
	const speakerMeetings = member.name
		? await raw<{ id: string; title: string; created_at: Date }>(sql`
			SELECT DISTINCT d.id, d.title, d.created_at
			FROM documents d, jsonb_array_elements(d.transcript_json::jsonb) AS t
			WHERE d.type = 'transcript' AND d.transcript_json IS NOT NULL
				AND t->>'speaker' ILIKE ${`%${member.name}%`}
			ORDER BY d.created_at DESC
			LIMIT 20
		`)
		: [];
	const linkPicture = await linksFor({ kind: "contact", id: memberId });
	const linkedMeetings = linkPicture.links.filter((l) => l.card.kind === "meeting");
	const meetingIds = new Set(speakerMeetings.map((m) => m.id));
	const extraLinkedMeetings = linkedMeetings.filter((l) => !meetingIds.has(l.card.id));

	// ── Outreach lifecycle (unified: same person, prospect-side view) ──
	const prospectRows = await db
		.select({
			id: outreachProspects.id,
			company: outreachProspects.company,
			contactName: outreachProspects.contactName,
			stage: outreachProspects.stage,
			notes: outreachProspects.notes,
			brainUrl: outreachProspects.brainUrl,
			companyId: outreachProspects.companyId,
			companyName: companies.name,
		})
		.from(outreachProspects)
		.leftJoin(companies, eq(outreachProspects.companyId, companies.id))
		.where(eq(outreachProspects.contactId, memberId));

	// ── Brain dossier (page + facts + open loops + timeline) ──
	const slug = personSlug(member.name);
	const [page] = await db
		.select({ id: brainPages.id, slug: brainPages.slug, title: brainPages.title, compiledTruth: brainPages.compiledTruth })
		.from(brainPages)
		.where(eq(brainPages.slug, slug))
		.limit(1);
	const [factRows, loopRows, timelineRows] = page
		? await Promise.all([
				db
					.select({ fact: brainFacts.fact, kind: brainFacts.kind, notability: brainFacts.notability, createdAt: brainFacts.createdAt })
					.from(brainFacts)
					.where(and(eq(brainFacts.entitySlug, slug), isNull(brainFacts.expiredAt)))
					.orderBy(desc(brainFacts.createdAt))
					.limit(30),
				db
					.select({ summary: brainOpenLoops.summary, loopType: brainOpenLoops.loopType, dueAt: brainOpenLoops.dueAt })
					.from(brainOpenLoops)
					.where(and(eq(brainOpenLoops.pageSlug, slug), eq(brainOpenLoops.status, "open")))
					.orderBy(desc(brainOpenLoops.createdAt))
					.limit(10),
				db
					.select({ date: brainTimeline.date, source: brainTimeline.source, summary: brainTimeline.summary })
					.from(brainTimeline)
					.where(eq(brainTimeline.pageId, page.id))
					.orderBy(desc(brainTimeline.date))
					.limit(10),
			])
		: [[], [], []];

	return {
		member,
		addresses,
		companies: memberCompanies,
		projects: projectRows,
		invoices: invoiceRows,
		deliverables: deliverableRows,
		quotes: quoteRows,
		messages: messageRows,
		meetings: {
			speakers: speakerMeetings,
			linked: extraLinkedMeetings.map((l) => l.card),
		},
		prospects: prospectRows,
		links: linkPicture.links,
		brain: page
			? { slug: page.slug, title: page.title, compiledTruth: page.compiledTruth, facts: factRows, openLoops: loopRows, timeline: timelineRows }
			: null,
	};
}

/**
 * Unify prospects with people/orgs: exact email match → prospects.contact_id;
 * exact/alias company-name match → prospects.company_id. Idempotent, only
 * fills nulls, never overwrites a human's explicit link. Called from
 * syncProspects every brain cycle.
 */
export async function reconcileProspectContacts(): Promise<{ contactMatches: number; companyMatches: number }> {
	const members = await db.select({ id: clientMembers.id }).from(clientMembers);
	const byAddress = new Map<string, string>();
	for (const m of members) {
		for (const addr of await emailsForPerson(m.id)) byAddress.set(addr, m.id);
	}

	const prospects = await db
		.select({
			id: outreachProspects.id,
			email: outreachProspects.email,
			company: outreachProspects.company,
			contactId: outreachProspects.contactId,
			companyId: outreachProspects.companyId,
		})
		.from(outreachProspects);

	let contactMatches = 0;
	let companyMatches = 0;
	for (const p of prospects) {
		const patch: { contactId?: string; companyId?: string } = {};
		if (!p.contactId && p.email) {
			const hit = byAddress.get(normalizeEmail(p.email));
			if (hit) {
				patch.contactId = hit;
				contactMatches++;
			}
		}
		if (!p.companyId) {
			// conservative: full-name ILIKE or a quoted alias inside the JSON array
			const [c] = await db
				.select({ id: companies.id })
				.from(companies)
				.where(
					or(
						sql`${companies.name} ILIKE ${p.company}`,
						sql`coalesce(${companies.aliases}, '') ILIKE ${`%"${p.company}"%`}`,
					),
				)
				.limit(1);
			if (c) {
				patch.companyId = c.id;
				companyMatches++;
			}
		}
		if (patch.contactId || patch.companyId) {
			await db.update(outreachProspects).set(patch).where(eq(outreachProspects.id, p.id));
		}
	}
	return { contactMatches, companyMatches };
}
