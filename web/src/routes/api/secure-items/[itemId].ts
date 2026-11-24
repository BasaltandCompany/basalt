// Secure share item decrypt endpoint — admin session required.
// GET /api/secure-items/:id?format=text → { text } (text items, for inline view)
// GET /api/secure-items/:id             → decrypted file stream (attachment download)
// Guests have no path here: the drop endpoint is upload-only (ASPTR-218 covers
// any future client-login gating).
import type { APIEvent } from "filesystem-routing/api";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { secureShareItems, secureShares } from "~/db/schema";
import { supabaseService } from "~/lib/supabase";
import { decryptBytes, decryptFromBase64, SECURE_SHARE_BUCKET, unwrapDek } from "~/lib/secure-share";
import { fromBase64Bytes } from "~/lib/crypto";
import { getAuthedClient } from "~/lib/session";

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET(event: APIEvent) {
	if ((await getAuthedClient()) === null) return json({ error: "Unauthorized" }, 401);
	const id = event.params!.itemId ?? "";
	const format = new URL(event.request.url).searchParams.get("format");

	const [item] = await db
		.select({ item: secureShareItems, wrappedDek: secureShares.wrappedDek })
		.from(secureShareItems)
		.innerJoin(secureShares, eq(secureShareItems.shareId, secureShares.id))
		.where(eq(secureShareItems.id, id));
	if (!item) return json({ error: "Not found" }, 404);

	let dek: Uint8Array;
	try {
		dek = await unwrapDek(item.wrappedDek);
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : "Decrypt failed" }, 500);
	}

	// Inline text view
	if (format === "text") {
		if (item.item.kind !== "text" || !item.item.contentCipher) return json({ error: "Not a text item" }, 400);
		try {
			const pt = await decryptFromBase64(dek, item.item.contentCipher);
			return json({ text: new TextDecoder().decode(pt) });
		} catch (e) {
			return json({ error: e instanceof Error ? e.message : "Decrypt failed" }, 500);
		}
	}

	// File download
	if (item.item.kind !== "file" || !item.item.storagePath || !item.item.storageIv) {
		return json({ error: "Not a file item" }, 400);
	}
	const svc = supabaseService();
	const { data, error } = await svc.storage.from(SECURE_SHARE_BUCKET).download(item.item.storagePath);
	if (error || !data) return json({ error: "Stored ciphertext not found" }, 404);
	try {
		const ct = new Uint8Array(await data.arrayBuffer());
		const pt = await decryptBytes(dek, fromBase64Bytes(item.item.storageIv), ct);
		// header-safe filename: strip quotes/control chars
		const safeName = item.item.label.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
		return new Response(pt as unknown as Uint8Array<ArrayBuffer>, {
			headers: {
				"Content-Type": item.item.mimeType || "application/octet-stream",
				"Content-Disposition": `attachment; filename="${safeName}"`,
			},
		});
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : "Decrypt failed" }, 500);
	}
}
