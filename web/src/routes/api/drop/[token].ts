// Public guest upload endpoint for secure share drops. Strictly upload-only:
// guests can never list or read a drop back. Unknown/closed/expired token →
// 404 with the same generic message (no token enumeration).
import type { APIEvent } from "filesystem-routing/api";
import { count, eq } from "drizzle-orm";
import { db } from "~/db";
import { secureShareItems, secureShares, type SecureShare } from "~/db/schema";
import { supabaseService } from "~/lib/supabase";
import { randomHex, toBase64 } from "~/lib/crypto";
import {
	encryptBytes,
	encryptToBase64,
	MAX_FILE_BYTES,
	MAX_ITEMS_PER_SHARE,
	MAX_TEXT_BYTES,
	SECURE_SHARE_BUCKET,
	shareExpired,
	unwrapDek,
} from "~/lib/secure-share";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function getOpenShare(token: string): Promise<SecureShare | null> {
	const [row] = await db.select().from(secureShares).where(eq(secureShares.token, token));
	if (!row || row.status !== "open" || shareExpired(row)) return null;
	return row;
}

export async function POST(event: APIEvent) {
	const share = await getOpenShare(event.params!.token ?? "");
	if (!share) return json({ error: "This link is no longer accepting uploads." }, 404);

	const form = await event.request.formData();
	const text = String(form.get("text") ?? "").trim();
	const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
	const uploaderLabel = String(form.get("name") ?? "").trim().slice(0, 100) || null;

	if (!text && files.length === 0) {
		return json({ error: "Nothing to upload — paste text or attach a file." }, 400);
	}
	if (text.length > MAX_TEXT_BYTES) {
		return json({ error: "Pasted text is too large (max 256 KB)." }, 400);
	}
	for (const f of files) {
		if (f.size > MAX_FILE_BYTES) return json({ error: `${f.name} is over the 10 MiB per-file limit.` }, 400);
	}

	// Share-level cap, checked before encrypting anything.
	const [{ value: existing }] = await db
		.select({ value: count() })
		.from(secureShareItems)
		.where(eq(secureShareItems.shareId, share.id));
	if (existing + (text ? 1 : 0) + files.length > MAX_ITEMS_PER_SHARE) {
		return json({ error: "This link is full — ask for a new one." }, 400);
	}

	let dek: Uint8Array;
	try {
		dek = await unwrapDek(share.wrappedDek);
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : "Server misconfiguration." }, 500);
	}

	const svc = supabaseService();
	let uploaded = 0;
	try {
		if (text) {
			const cipher = await encryptToBase64(dek, new TextEncoder().encode(text));
			await db.insert(secureShareItems).values({
				shareId: share.id,
				kind: "text",
				label: "Pasted text",
				sizeBytes: new TextEncoder().encode(text).length,
				contentCipher: cipher,
				uploaderLabel,
			});
			uploaded++;
		}
		for (const file of files) {
			const itemId = randomHex(16); // unique, url-free — just a storage key
			const storagePath = `${share.id}/${itemId}`;
			const { iv, ct } = await encryptBytes(dek, new Uint8Array(await file.arrayBuffer()));
			const { error } = await svc.storage.from(SECURE_SHARE_BUCKET).upload(storagePath, ct, {
				contentType: "application/octet-stream",
			});
			if (error) throw new Error(error.message);
			try {
				await db.insert(secureShareItems).values({
					id: crypto.randomUUID(),
					shareId: share.id,
					kind: "file",
					label: file.name.slice(0, 255),
					mimeType: file.type || null,
					sizeBytes: file.size,
					storagePath,
					storageIv: toBase64(iv),
					uploaderLabel,
				});
			} catch (dbErr) {
				await svc.storage.from(SECURE_SHARE_BUCKET).remove([storagePath]); // no orphan ciphertext
				throw dbErr;
			}
			uploaded++;
		}
	} catch (e) {
		console.error("drop upload failed:", e);
		return json({ error: "Upload failed — please try again." }, 500);
	}

	return json({ ok: true, uploaded });
}
