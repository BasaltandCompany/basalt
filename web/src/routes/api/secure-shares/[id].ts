// Secure share detail admin API — session-guarded.
// GET    /api/secure-shares/:id → { share, items } — metadata only, never ciphertext
// PATCH  /api/secure-shares/:id {status: "open" | "closed"}
// DELETE /api/secure-shares/:id → delete share (items cascade) + best-effort storage cleanup
import type { APIEvent } from "@solidjs/start/server";
import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { projects, secureShareItems, secureShares } from "~/db/schema";
import { supabaseService } from "~/lib/supabase";
import { SECURE_SHARE_BUCKET } from "~/lib/secure-share";
import { getAuthedClient } from "~/lib/session";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET(event: APIEvent) {
	if ((await getAuthedClient()) === null) return json({ error: "Unauthorized" }, 401);
	const id = event.params.id ?? "";
	const [share] = await db
		.select({
			id: secureShares.id,
			title: secureShares.title,
			token: secureShares.token,
			status: secureShares.status,
			note: secureShares.note,
			expiresAt: secureShares.expiresAt,
			createdAt: secureShares.createdAt,
			projectName: projects.name,
		})
		.from(secureShares)
		.leftJoin(projects, eq(secureShares.projectId, projects.id))
		.where(eq(secureShares.id, id));
	if (!share) return json({ error: "Not found" }, 404);
	const items = await db
		.select({
			id: secureShareItems.id,
			kind: secureShareItems.kind,
			label: secureShareItems.label,
			mimeType: secureShareItems.mimeType,
			sizeBytes: secureShareItems.sizeBytes,
			uploaderLabel: secureShareItems.uploaderLabel,
			createdAt: secureShareItems.createdAt,
		})
		.from(secureShareItems)
		.where(eq(secureShareItems.shareId, id))
		.orderBy(asc(secureShareItems.createdAt));
	return json({ share, items });
}

export async function PATCH(event: APIEvent) {
	if ((await getAuthedClient()) === null) return json({ error: "Unauthorized" }, 401);
	const id = event.params.id ?? "";
	const body = (await event.request.json().catch(() => ({}))) as { status?: string };
	if (body.status !== "open" && body.status !== "closed") return json({ error: "status must be open or closed" }, 400);
	await db.update(secureShares).set({ status: body.status }).where(eq(secureShares.id, id));
	return json({ ok: true, status: body.status });
}

export async function DELETE(event: APIEvent) {
	if ((await getAuthedClient()) === null) return json({ error: "Unauthorized" }, 401);
	const id = event.params.id ?? "";
	const paths = (
		await db.select({ storagePath: secureShareItems.storagePath }).from(secureShareItems).where(eq(secureShareItems.shareId, id))
	)
		.map((r) => r.storagePath)
		.filter((p): p is string => p !== null);
	await db.delete(secureShares).where(eq(secureShares.id, id)); // items cascade
	if (paths.length > 0) {
		// best-effort — DB is gone either way; leftover ciphertext objects are inert
		await supabaseService().storage.from(SECURE_SHARE_BUCKET).remove(paths);
	}
	return json({ ok: true });
}
