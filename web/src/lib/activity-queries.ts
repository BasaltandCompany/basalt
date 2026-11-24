// Admin queries + actions for /admin/activity (ASPTR-227). The rollup loads
// raw events + usage for one week and does the merge engine-side (no
// double-count, idle-veto) — the DB stays a dumb fact store.
import { query, formAction, revalidate } from "@solidjs/router";
import { redirect } from "@solidjs/web";
import { and, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "~/db";
import { activityEvents, agentUsageDaily, projectMatchers, projects, timeEntries } from "~/db/schema";
import { bucketTotals, clipHeartbeats, mergeToSegments, msToHours, weekWindow, type MergeEvent } from "~/lib/activity/rollup";
import { answerPrompt } from "~/lib/activity/record";
import { getCurrentUser } from "./session";

async function requireAdmin() {
	if ((await getCurrentUser()) === null) throw redirect("/admin/login");
}

const toDay = (d: Date) => d.toISOString().slice(0, 10);

export const getActivityQuery = query(async (offsetWeeks = 0) => {
	"use server";
	await requireAdmin();
	const { start, end } = weekWindow(new Date(), offsetWeeks);

	const events = await db
		.select()
		.from(activityEvents)
		.where(and(gte(activityEvents.startedAt, start), lt(activityEvents.startedAt, end)))
		.orderBy(desc(activityEvents.startedAt))
		.limit(4000);
	const merge: MergeEvent[] = clipHeartbeats(
		events.map((e) => ({
			id: e.id,
			startedAt: e.startedAt,
			endedAt: e.endedAt,
			source: e.source,
			confidence: e.confidence,
			projectId: e.projectId,
			category: e.category,
			deviceId: e.deviceId,
		})),
	);
	const totals = bucketTotals(mergeToSegments(merge));

	const usageRows = await db
		.select()
		.from(agentUsageDaily)
		.where(and(gte(agentUsageDaily.day, toDay(start)), lt(agentUsageDaily.day, toDay(end))));

	const projectRows = await db.select({ id: projects.id, name: projects.name }).from(projects);
	const names = new Map(projectRows.map((p) => [p.id, p.name]));

	const usageByProject = new Map<string, { tokens: number; cost: number; sessions: number }>();
	for (const u of usageRows) {
		const key = u.projectId ? `p:${u.projectId}` : u.category ? `c:${u.category}` : "unassigned";
		const agg = usageByProject.get(key) ?? { tokens: 0, cost: 0, sessions: 0 };
		agg.tokens += u.totalTokens;
		agg.cost += u.apiCostUsd;
		agg.sessions += u.sessionCount;
		usageByProject.set(key, agg);
	}

	const projectHours = [...totals.entries()]
		.filter(([k]) => k.startsWith("p:"))
		.map(([k, t]) => {
			const id = k.slice(2);
			const u = usageByProject.get(k) ?? { tokens: 0, cost: 0, sessions: 0 };
			return { id, name: names.get(id) ?? "(deleted project)", hours: msToHours(t.ms), tokens: u.tokens, apiCostUsd: Math.round(u.cost * 10000) / 10000, sessions: u.sessions };
		})
		.filter((r) => r.hours > 0 || r.tokens > 0)
		.sort((a, b) => b.hours - a.hours);

	const bucketHours = (key: string) => msToHours(totals.get(key)?.ms ?? 0);
	const usageTotals = (key: string) => usageByProject.get(key) ?? { tokens: 0, cost: 0, sessions: 0 };

	// review list: unassigned blocks (rows, not merged — one assign each)
	const unassigned = await db
		.select()
		.from(activityEvents)
		.where(and(gte(activityEvents.startedAt, start), lt(activityEvents.startedAt, end), isNull(activityEvents.projectId), isNull(activityEvents.category)))
		.orderBy(desc(activityEvents.endedAt))
		.limit(50);

	const matcherRows = await db
		.select({
			id: projectMatchers.id,
			kind: projectMatchers.kind,
			pattern: projectMatchers.pattern,
			source: projectMatchers.source,
			useCount: projectMatchers.useCount,
			projectId: projectMatchers.projectId,
			category: projectMatchers.category,
			projectName: projects.name,
		})
		.from(projectMatchers)
		.leftJoin(projects, eq(projects.id, projectMatchers.projectId))
		.orderBy(desc(projectMatchers.useCount));

	return {
		weekOf: start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
		projects: projectHours,
		internal: { hours: bucketHours("c:internal"), ...usageTotals("c:internal") },
		personal: { hours: bucketHours("c:personal"), ...usageTotals("c:personal") },
		unassigned: { hours: bucketHours("unassigned"), ...usageTotals("unassigned") },
		clientTotalHours: projectHours.reduce((s, p) => s + p.hours, 0),
		totalTokens: [...usageByProject.values()].reduce((s, u) => s + u.tokens, 0),
		totalApiCostUsd: Math.round([...usageByProject.values()].reduce((s, u) => s + u.cost, 0) * 10000) / 10000,
		unassignedBlocks: unassigned.map((e) => ({
			id: e.id,
			startedAt: e.startedAt,
			hours: msToHours(new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()),
			source: e.source,
			appName: e.appName,
			titleSnippet: e.titleSnippet,
			convertedEntryId: e.convertedEntryId,
		})),
		matchers: matcherRows,
		projectOptions: projectRows,
	};
}, "activity");

export const assignActivityAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const target = String(formData.get("target") || "");
	if (!/^(p:|c:(internal|personal))/.test(target)) return { error: "Pick a project or a bucket." };
	const remember = formData.get("remember") === "on";
	const [ev] = await db.select().from(activityEvents).where(eq(activityEvents.id, id)).limit(1);
	if (!ev) return { error: "Block not found." };
	const bucket = target.startsWith("p:") ? { projectId: target.slice(2) } : { category: target.slice(2) as "internal" | "personal" };
	await answerPrompt(id, bucket, remember, remember ? ev.appName : null);
	// manual assignment outranks prompted: mark it
	await db.update(activityEvents).set({ confidence: "manual" }).where(eq(activityEvents.id, id));
	await revalidate(getActivityQuery.key);
	return { success: "Assigned." };
}, "assignActivity");

export const convertActivityAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const id = String(formData.get("id"));
	const [ev] = await db.select().from(activityEvents).where(eq(activityEvents.id, id)).limit(1);
	if (!ev) return { error: "Block not found." };
	if (!ev.projectId) return { error: "Assign to a project first." };
	if (ev.convertedEntryId) return { error: "Already converted." };
	const hours = msToHours(new Date(ev.endedAt).getTime() - new Date(ev.startedAt).getTime());
	if (hours <= 0) return { error: "Block is empty." };
	const [entry] = await db
		.insert(timeEntries)
		.values({
			projectId: ev.projectId,
			entryDate: ev.startedAt,
			hours,
			description: `auto: ${ev.appName ?? ev.source}${ev.titleSnippet ? ` — ${ev.titleSnippet}` : ""}`.slice(0, 200),
			billable: true,
		})
		.returning();
	await db.update(activityEvents).set({ convertedEntryId: entry.id }).where(eq(activityEvents.id, id));
	await revalidate(getActivityQuery.key);
	return { success: `Logged ${hours} hrs to the project's time entries.` };
}, "convertActivity");

export const addMatcherAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const kind = String(formData.get("kind"));
	const pattern = String(formData.get("pattern") || "").trim();
	const target = String(formData.get("target") || "");
	if (!["git_remote", "worktree", "title"].includes(kind)) return { error: "Bad matcher kind." };
	if (!pattern) return { error: "Pattern is required." };
	if (!/^(p:|c:(internal|personal))/.test(target)) return { error: "Pick a project or a bucket." };
	await db
		.insert(projectMatchers)
		.values({
			kind: kind as "git_remote" | "worktree" | "title",
			pattern,
			projectId: target.startsWith("p:") ? target.slice(2) : null,
			category: target.startsWith("c:") ? (target.slice(2) as "internal" | "personal") : null,
		})
		.onConflictDoNothing({ target: [projectMatchers.kind, projectMatchers.pattern] });
	await revalidate(getActivityQuery.key);
	return { success: "Matcher saved." };
}, "addMatcher");

export const deleteMatcherAction = formAction(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	await db.delete(projectMatchers).where(eq(projectMatchers.id, String(formData.get("id"))));
	await revalidate(getActivityQuery.key);
	return { success: "Matcher deleted." };
}, "deleteMatcher");
