// GET/POST /api/activity/matchers — the attribution map (mc_ key).
// GET: full matcher list (local scanners classify sessions locally).
// POST: upsert matchers (seed script bulk import; prompt learning goes
// through prompt-answers instead).
import type { APIEvent } from "filesystem-routing/api";
import { desc, eq } from "drizzle-orm";
import { db } from "~/db";
import { projectMatchers, projects, companies } from "~/db/schema";
import { isAdminApiKey, json } from "~/lib/admin-api";
import { upsertMatchers } from "~/lib/activity/record";

export const GET = async (event: APIEvent) => {
	if (!(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	const rows = await db.select().from(projectMatchers).orderBy(desc(projectMatchers.createdAt));
	// project list rides along: the seed script and admin UI need id+name in
	// one call, and projects are not secret from an mc_-authorized caller.
	const projectRows = await db
		.select({ id: projects.id, name: projects.name, status: projects.status, companyName: companies.name })
		.from(projects)
		.leftJoin(companies, eq(companies.id, projects.companyId))
		.orderBy(desc(projects.updatedAt));
	return json({ matchers: rows, projects: projectRows });
};

export const POST = async (event: APIEvent) => {
	if (!(await isAdminApiKey(event.request))) return json({ error: "Unauthorized" }, 401);
	let body: { matchers?: unknown[] };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}
	const raw = Array.isArray(body.matchers) ? body.matchers.slice(0, 1000) : null;
	if (!raw) return json({ error: "matchers[] required" }, 400);
	const clean: Parameters<typeof upsertMatchers>[0] = [];
	for (const r of raw) {
		const it = r as Record<string, unknown>;
		const kind = it.kind === "git_remote" || it.kind === "worktree" || it.kind === "title" ? it.kind : null;
		const projectId = typeof it.projectId === "string" && /^[0-9a-f-]{36}$/i.test(it.projectId) ? it.projectId : null;
		const category = it.category === "internal" || it.category === "personal" ? it.category : null;
		if (!kind || typeof it.pattern !== "string" || !it.pattern.trim() || (projectId && category) || (!projectId && !category))
			return json({ error: "Each matcher needs kind, pattern, and projectId XOR category" }, 400);
		clean.push({ projectId, category, kind, pattern: it.pattern.trim().slice(0, 300) });
	}
	const upserted = await upsertMatchers(clean);
	return json({ ok: true, upserted });
};
