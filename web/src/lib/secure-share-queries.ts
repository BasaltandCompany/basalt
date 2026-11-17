"use server";

// Admin detail query for a secure share — runs on the server during SSR, so
// the detail page gets real data in the stream instead of a client fetch
// (same pattern as docs-share.ts; the relative-fetch crash is why).
import { asc, eq } from "drizzle-orm";
import { db } from "~/db";
import { projects, secureShareItems, secureShares } from "~/db/schema";
import { getAuthedClient } from "~/lib/session";

export async function getShareDetail(id: string): Promise<{
	share: {
		id: string;
		title: string;
		token: string;
		status: string;
		note: string | null;
		expiresAt: Date | null;
		createdAt: Date;
		projectName: string | null;
	};
	items: {
		id: string;
		kind: string;
		label: string;
		mimeType: string | null;
		sizeBytes: number | null;
		uploaderLabel: string | null;
		createdAt: Date;
	}[];
} | null> {
	if ((await getAuthedClient()) === null) return null;
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
	if (!share) return null;
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
	return { share, items };
}
