import { describe, expect, test } from "bun:test";
import { decryptFromBase64, encryptToBase64, newWrappedDek, unwrapDek } from "./secure-share";

process.env.SECURE_SHARE_MASTER_KEY ||= "test-master-key-for-roundtrips-0123456789";

const key32 = new TextEncoder().encode("k".repeat(32));

describe("secure-share crypto", () => {
	test("encrypt → decrypt roundtrip (bytes and text)", async () => {
		const pt = new TextEncoder().encode("API_KEY=supersecret\nDATABASE_URL=postgres://…");
		const blob = await encryptToBase64(key32, pt);
		expect(blob).not.toContain("supersecret");
		const back = await decryptFromBase64(key32, blob);
		expect(new TextDecoder().decode(back)).toBe("API_KEY=supersecret\nDATABASE_URL=postgres://…");
	});

	test("tampered ciphertext fails", async () => {
		const blob = await encryptToBase64(key32, new TextEncoder().encode("x"));
		const raw = Uint8Array.from(blob, (c) => c.charCodeAt(0));
		// flip a byte inside the ciphertext body
		raw[raw.length - 1] ^= 0xff;
		const flipped = String.fromCharCode(...raw);
		await expect(decryptFromBase64(key32, flipped)).rejects.toBeInstanceOf(Error);
	});

	test("wrap → unwrap DEK roundtrip", async () => {
		const wrapped = await newWrappedDek();
		const dek = await unwrapDek(wrapped);
		expect(dek.length).toBe(32);
		// the unwrapped DEK actually encrypts/decrypts
		const blob = await encryptToBase64(dek, new TextEncoder().encode("hello"));
		expect(new TextDecoder().decode(await decryptFromBase64(dek, blob))).toBe("hello");
	});

	test("wrong master key → explicit unwrap failure", async () => {
		const wrapped = await newWrappedDek();
		const prev = process.env.SECURE_SHARE_MASTER_KEY;
		process.env.SECURE_SHARE_MASTER_KEY = "a-different-master-key-entirely-000";
		try {
			await expect(unwrapDek(wrapped)).rejects.toThrow("SECURE_SHARE_MASTER_KEY does not match");
		} finally {
			process.env.SECURE_SHARE_MASTER_KEY = prev;
		}
	});
});
