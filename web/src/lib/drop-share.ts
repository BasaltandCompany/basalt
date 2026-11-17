"use server";

// Public, upload-only drop metadata for /drop/<token> — the guest page gets
// an RPC stub instead of the db chain (same pattern as docs-share.ts).
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { secureShares } from "~/db/schema";
import { shareExpired } from "~/lib/secure-share";

/** Title + note for an open drop, or null (unknown/closed/expired — 404 page). */
export async function getOpenDropMeta(token: string): Promise<{ title: string; note: string | null } | null> {
	const [row] = await db
		.select({ title: secureShares.title, note: secureShares.note, status: secureShares.status, expiresAt: secureShares.expiresAt })
		.from(secureShares)
		.where(eq(secureShares.token, token));
	if (!row || row.status !== "open" || shareExpired(row)) return null;
	return { title: row.title, note: row.note };
}
