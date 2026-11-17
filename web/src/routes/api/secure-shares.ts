// Secure shares admin API — session-guarded.
// GET  /api/secure-shares → { shares: [...with item counts], projects: [for the create select] }
// POST /api/secure-shares {title, note?, projectId?, expiresAt?} → create (token + DEK wrap generated here)
import type { APIEvent } from "@solidjs/start/server";
import { count, desc, eq, max } from "drizzle-orm";
import { db } from "~/db";
import { projects, secureShareItems, secureShares } from "~/db/schema";
import { randomHex } from "~/lib/crypto";
import { newWrappedDek } from "~/lib/secure-share";
import { getAuthedClient } from "~/lib/session";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET() {
	if ((await getAuthedClient()) === null) return json({ error: "Unauthorized" }, 401);
	const [shares, projectList] = await Promise.all([
		db
			.select({
				id: secureShares.id,
				title: secureShares.title,
				token: secureShares.token,
				status: secureShares.status,
				note: secureShares.note,
				expiresAt: secureShares.expiresAt,
				createdAt: secureShares.createdAt,
				projectName: projects.name,
				itemCount: count(secureShareItems.id),
				lastUploadAt: max(secureShareItems.createdAt),
			})
			.from(secureShares)
			.leftJoin(projects, eq(secureShares.projectId, projects.id))
			.leftJoin(secureShareItems, eq(secureShareItems.shareId, secureShares.id))
			.groupBy(secureShares.id, projects.name)
			.orderBy(desc(secureShares.createdAt)),
		db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name).limit(500),
	]);
	return json({ shares, projects: projectList });
}

export async function POST(event: APIEvent) {
	if ((await getAuthedClient()) === null) return json({ error: "Unauthorized" }, 401);
	const body = (await event.request.json().catch(() => ({}))) as {
		title?: string;
		note?: string;
		projectId?: string | null;
		expiresAt?: string | null;
	};
	const title = (body.title ?? "").trim();
	if (!title) return json({ error: "Title is required" }, 400);
	const note = (body.note ?? "").trim().slice(0, 2000) || null;
	const projectId = body.projectId || null;
	let expiresAt: Date | null = null;
	if (body.expiresAt) {
		expiresAt = new Date(body.expiresAt);
		if (Number.isNaN(expiresAt.getTime())) return json({ error: "Invalid expiry date" }, 400);
	}

	// Missing SECURE_SHARE_MASTER_KEY surfaces here as a clear 500 — nothing stored.
	let wrappedDek: string;
	try {
		wrappedDek = await newWrappedDek();
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : "Key wrap failed" }, 500);
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const [share] = await db
				.insert(secureShares)
				.values({ title, note, projectId, expiresAt, token: randomHex(16), wrappedDek })
				.returning({ id: secureShares.id, token: secureShares.token });
			return json({ ok: true, share });
		} catch (e) {
			if (!(e instanceof Error) || !e.message.includes("duplicate key")) throw e;
		}
	}
	return json({ error: "Could not generate a unique token — try again" }, 500);
}
