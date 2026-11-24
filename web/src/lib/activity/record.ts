// Server-side activity recording (ASPTR-227): db-touching helpers shared by
// the /api/activity ingest routes and the admin UI. Machine callers
// authenticate with mc_ keys at the route layer (lib/admin-api.ts).
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db";
import { activityEvents, agentUsageDaily, clientMembers, clientMemberEmails, clientCompanyMembers, projectMatchers, projects } from "~/db/schema";
import { indexMatchers, matchTitle, type Bucket, type MatcherIndex } from "./match";
import { MUTATION_MINUTES } from "./rollup";

export const SAMPLE_INTERVAL_MS = 30_000;
export const IDLE_LIMIT_SECONDS = 120;
export const PROMPT_MIN_MS = 10 * 60_000;
const TITLE_SNIPPET_MAX = 80;
// travel buffer around in-person (location-bearing) calendar events
export const TRAVEL_MINUTES = Number(process.env.ACTIVITY_TRAVEL_MINUTES ?? 30);

export async function loadMatcherIndex(): Promise<MatcherIndex> {
	return indexMatchers(await db.select().from(projectMatchers));
}

function bucketColumns(bucket: NonNullable<Bucket>) {
	return "projectId" in bucket ? { projectId: bucket.projectId, category: null } : { projectId: null, category: bucket.category };
}

/** A single in-app mutation (email sent, doc saved, project edited) earns
 * one exact-confidence 5-minute span; the merge dedupes against longer spans. */
export async function recordMutation(projectId: string, detail: string): Promise<void> {
	const at = new Date();
	await db.insert(activityEvents).values({
		source: "app_mutation",
		startedAt: at,
		endedAt: new Date(at.getTime() + MUTATION_MINUTES * 60_000),
		projectId,
		confidence: "exact",
		detail: detail.slice(0, 200),
		dedupeKey: `mut:${projectId}:${at.getTime()}`,
	});
}
/** Email send → mutation credit: resolve the recipient to a single active
 * project through portal membership. Unresolvable recipients record
 * nothing — a cold email to a prospect is not client work yet. */
export async function recordMutationForEmail(toEmail: string, detail: string): Promise<void> {
	const email = toEmail.trim().toLowerCase();
	if (!/.+@.+\..+/.test(email)) return;
	const memberRows = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientMembers)
		.innerJoin(clientCompanyMembers, eq(clientCompanyMembers.memberId, clientMembers.id))
		.where(eq(sql`lower(${clientMembers.email})`, email));
	const altRows = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientMemberEmails)
		.innerJoin(clientCompanyMembers, eq(clientCompanyMembers.memberId, clientMemberEmails.memberId))
		.where(eq(sql`lower(${clientMemberEmails.email})`, email));
	const companyIds = new Set([...memberRows, ...altRows].map((r) => r.companyId));
	if (companyIds.size !== 1) return;
	const rows = await db
		.select({ id: projects.id })
		.from(projects)
		.where(and(inArray(projects.companyId, [...companyIds]), eq(projects.status, "active")));
	if (rows.length === 1) await recordMutation(rows[0].id, detail);
}

/** Visibility heartbeat: extend the current block or open a new one. A block
 * dies 90s after the last ping (hidden tab / sleep / lock stops pings). */
export async function touchHeartbeat(userId: string, projectId: string, at: Date): Promise<void> {
	const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1);
	if (!project) return; // deleted project id from a stale tab — ignore
	const deviceId = `web:${userId}`;
	const [current] = await db
		.select()
		.from(activityEvents)
		.where(
			and(
				eq(activityEvents.source, "app_heartbeat"),
				eq(activityEvents.deviceId, deviceId),
				eq(activityEvents.projectId, projectId),
				gte(activityEvents.endedAt, new Date(at.getTime() - 90_000)),
			),
		)
		.orderBy(desc(activityEvents.endedAt))
		.limit(1);
	if (current) {
		await db.update(activityEvents).set({ endedAt: at }).where(eq(activityEvents.id, current.id));
		return;
	}
	await db.insert(activityEvents).values({
		deviceId,
		source: "app_heartbeat",
		startedAt: new Date(at.getTime() - SAMPLE_INTERVAL_MS),
		endedAt: at,
		projectId,
		confidence: "exact",
		detail: "dashboard",
		dedupeKey: `hb:${userId}:${projectId}:${at.getTime()}`,
	});
}

export type DesktopSample = { at: string; appName: string | null; title: string | null; idleSec: number | null; locked: boolean | null };

/** Build attributed desktop blocks from raw 30s samples: split on idle,
 * lock, attribution change, or a >65s gap; upsert by batch dedupe keys. */
export async function ingestDesktopSamples(
	deviceId: string,
	batchId: string,
	samples: DesktopSample[],
	index: MatcherIndex,
): Promise<number> {
	const ordered = [...samples].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
	type Group = { start: string; end: string; bucket: Bucket; appName: string | null; title: string | null };
	const groups: Group[] = [];
	let cur: Group | null = null;
	for (const s of ordered) {
		const active = (s.idleSec ?? 0) < IDLE_LIMIT_SECONDS && !s.locked;
		if (!active) {
			cur = null; // idle/lock ends the block; idle spans are never stored
			continue;
		}
		const bucket: Bucket = matchTitle(s.title, s.appName, index);
		if (!cur) {
			cur = { start: s.at, end: new Date(Date.parse(s.at) + SAMPLE_INTERVAL_MS).toISOString(), bucket, appName: s.appName, title: s.title };
			groups.push(cur);
			continue;
		}
		const gap = Date.parse(s.at) - Date.parse(cur.end);
		if (gap > 35_000 || bucketChanged(cur.bucket, bucket)) {
			cur = { start: s.at, end: new Date(Date.parse(s.at) + SAMPLE_INTERVAL_MS).toISOString(), bucket, appName: s.appName, title: s.title };
			groups.push(cur);
			continue;
		}
		cur.end = new Date(Date.parse(s.at) + SAMPLE_INTERVAL_MS).toISOString();
		cur.title = s.title ?? cur.title; // keep the most recent title for review context
	}
	if (groups.length === 0) return 0;
	await db
		.insert(activityEvents)
		.values(
			groups.map((g, i) => ({
				deviceId,
				source: "desktop" as const,
				startedAt: new Date(g.start),
				endedAt: new Date(g.end),
				confidence: "inferred" as const,
				...(g.bucket ? bucketColumns(g.bucket) : { projectId: null, category: null }),
				appName: g.appName,
				titleSnippet: g.title?.slice(0, TITLE_SNIPPET_MAX) ?? null,
				detail: null,
				dedupeKey: `desk:${deviceId}:${batchId}:${i}`,
			})),
		)
		.onConflictDoUpdate({
			target: activityEvents.dedupeKey,
			set: {
				endedAt: sql`excluded.ended_at`,
				projectId: sql`excluded.project_id`,
				category: sql`excluded.category`,
			},
		});
	return groups.length;
}

function bucketChanged(a: Bucket, b: Bucket): boolean {
	const key = (x: Bucket) => (x === null ? "u" : "projectId" in x ? `p:${x.projectId}` : `c:${x.category}`);
	return key(a) !== key(b);
}

/** Unassigned desktop blocks worth asking about — ended recently, long
 * enough, not already answered "none". */
export async function pendingPromptBlocks(deviceId: string, limit = 3) {
	const rows = await db
		.select()
		.from(activityEvents)
		.where(
			and(
				eq(activityEvents.source, "desktop"),
				eq(activityEvents.deviceId, deviceId),
				isNull(activityEvents.projectId),
				isNull(activityEvents.category),
				sql`${activityEvents.detail} is distinct from 'none'`,
				gte(activityEvents.endedAt, new Date(Date.now() - 2 * 60 * 60_000)),
				sql`extract(epoch from (${activityEvents.endedAt} - ${activityEvents.startedAt})) * 1000 >= ${PROMPT_MIN_MS}`,
			),
		)
		.orderBy(desc(activityEvents.endedAt))
		.limit(limit);
	return rows;
}

/** Prompt answer: reclassify a block; optionally learn the app → bucket
 * default so future blocks auto-attribute and prompts decay. */
export async function answerPrompt(
	eventId: string,
	bucket: NonNullable<Bucket> | null,
	remember: boolean,
	appName: string | null,
): Promise<void> {
	const [ev] = await db.select().from(activityEvents).where(eq(activityEvents.id, eventId)).limit(1);
	if (!ev) throw new Error("No such activity event.");
	await db
		.update(activityEvents)
		.set({
			...(bucket ? bucketColumns(bucket) : { projectId: null, category: null }),
			confidence: "prompted",
			detail: bucket ? null : "none",
		})
		.where(eq(activityEvents.id, eventId));
	if (remember && bucket && appName) {
		await db
			.insert(projectMatchers)
			.values({ kind: "title", pattern: appName, source: "learned", ...bucketColumns(bucket) })
			.onConflictDoUpdate({
				target: [projectMatchers.kind, projectMatchers.pattern],
				set: { useCount: sql`${projectMatchers.useCount} + 1`, ...bucketColumns(bucket) },
			});
	}
}

export type MeetingInput = { uid: string; title: string | null; startsAt: Date; endsAt: Date; location: string | null; attendees: string[] };

const VIRTUAL_LOCATION = /(zoom\.us|meet\.google|teams\.microsoft|whereby|gotomeet|webex|http|dial|phone)/i;

/** Calendar meeting → event row. Attendee emails match portal members →
 * their companies → a single ACTIVE project. Location-bearing non-virtual
 * events get a travel buffer on both sides. Upserts by calendar UID. */
export async function ingestMeetings(meetings: MeetingInput[]): Promise<number> {
	if (meetings.length === 0) return 0;
	const emails = [...new Set(meetings.flatMap((m) => m.attendees))];
	const memberRows = emails.length
		? await db
				.select({ companyId: clientCompanyMembers.companyId, email: sql<string>`lower(${clientMembers.email})` })
				.from(clientMembers)
				.innerJoin(clientCompanyMembers, eq(clientCompanyMembers.memberId, clientMembers.id))
				.where(inArray(sql`lower(${clientMembers.email})`, emails))
		: [];
	const altRows = emails.length
		? await db
				.select({ companyId: clientCompanyMembers.companyId, email: sql<string>`lower(${clientMemberEmails.email})` })
				.from(clientMemberEmails)
				.innerJoin(clientCompanyMembers, eq(clientCompanyMembers.memberId, clientMemberEmails.memberId))
				.where(inArray(sql`lower(${clientMemberEmails.email})`, emails))
		: [];
	const companyIds = new Set([...memberRows, ...altRows].map((r) => r.companyId));
	const projectRows = companyIds.size
		? await db
				.select({ id: projects.id, companyId: projects.companyId, name: projects.name })
				.from(projects)
				.where(and(inArray(projects.companyId, [...companyIds]), eq(projects.status, "active")))
		: [];
	const projectsByCompany = new Map<string, { id: string; name: string }[]>();
	for (const p of projectRows) {
		const list = projectsByCompany.get(p.companyId) ?? [];
		list.push({ id: p.id, name: p.name });
		projectsByCompany.set(p.companyId, list);
	}
	let stored = 0;
	for (const m of meetings) {
		const companies = new Set([...memberRows, ...altRows].filter((r) => m.attendees.includes(r.email)).map((r) => r.companyId));
		let projectId: string | null = null;
		let detail: string | null = null;
		if (companies.size === 1) {
			const list = projectsByCompany.get([...companies][0]) ?? [];
			if (list.length === 1) projectId = list[0].id;
			else if (list.length > 1) detail = `ambiguous: ${list.map((p) => p.name).join(", ")}`;
		} else if (companies.size > 1) detail = "multiple client companies attended";
		const travel = m.location && !VIRTUAL_LOCATION.test(m.location) ? TRAVEL_MINUTES * 60_000 : 0;
		await db
			.insert(activityEvents)
			.values({
				source: "calendar",
				startedAt: new Date(m.startsAt.getTime() - travel),
				endedAt: new Date(m.endsAt.getTime() + travel),
				...(projectId ? { projectId, category: null } : { projectId: null, category: null }),
				confidence: projectId ? "exact" : "inferred",
				titleSnippet: m.title?.slice(0, TITLE_SNIPPET_MAX) ?? null,
				detail,
				dedupeKey: `cal:${m.uid}`,
			})
			.onConflictDoUpdate({
				target: activityEvents.dedupeKey,
				set: { startedAt: sql`excluded.started_at`, endedAt: sql`excluded.ended_at`, projectId: sql`excluded.project_id`, confidence: sql`excluded.confidence`, titleSnippet: sql`excluded.title_snippet`, detail: sql`excluded.detail` },
			});
		stored++;
	}
	return stored;
}

export type UsageRow = {
	dedupeKey: string;
	day: string;
	projectId: string | null;
	category: "internal" | "personal" | null;
	provider: string | null;
	model: string | null;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	apiCostUsd: number;
	sessionCount: number;
};

/** Daily agent usage upsert — scanner recomputes full windows, so values
 * replace (idempotent replays). */
export async function ingestUsage(rows: UsageRow[]): Promise<number> {
	if (rows.length === 0) return 0;
	await db
		.insert(agentUsageDaily)
		.values(
			rows.map((r) => ({
				dedupeKey: r.dedupeKey,
				day: r.day,
				projectId: r.projectId,
				category: r.category,
				provider: r.provider,
				model: r.model,
				inputTokens: r.inputTokens,
				outputTokens: r.outputTokens,
				cacheReadTokens: r.cacheReadTokens,
				cacheWriteTokens: r.cacheWriteTokens,
				totalTokens: r.totalTokens,
				apiCostUsd: r.apiCostUsd,
				sessionCount: r.sessionCount,
			})),
		)
		.onConflictDoUpdate({
			target: agentUsageDaily.dedupeKey,
			set: {
				inputTokens: sql`excluded.input_tokens`,
				outputTokens: sql`excluded.output_tokens`,
				cacheReadTokens: sql`excluded.cache_read_tokens`,
				cacheWriteTokens: sql`excluded.cache_write_tokens`,
				totalTokens: sql`excluded.total_tokens`,
				apiCostUsd: sql`excluded.api_cost_usd`,
				sessionCount: sql`excluded.session_count`,
				projectId: sql`excluded.project_id`,
				category: sql`excluded.category`,
			},
		});
	return rows.length;
}

/** Matcher upsert for the seed script and the prompt-learning path. */
export async function upsertMatchers(
	rows: { projectId: string | null; category: "internal" | "personal" | null; kind: "git_remote" | "worktree" | "title"; pattern: string }[],
): Promise<number> {
	if (rows.length === 0) return 0;
	await db
		.insert(projectMatchers)
		.values(rows.map((r) => ({ ...r, source: "curated" as const })))
		.onConflictDoUpdate({
			target: [projectMatchers.kind, projectMatchers.pattern],
			set: { projectId: sql`excluded.project_id`, category: sql`excluded.category` },
		});
	return rows.length;
}
