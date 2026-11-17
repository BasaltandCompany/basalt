// Envelope encryption for secure share drops — AES-256-GCM via webcrypto
// (works in Bun and browsers, same primitives as crypto.ts). Each share gets
// a random 256-bit DEK that encrypts its items; the DEK itself is stored only
// wrapped under a KEK derived from SECURE_SHARE_MASTER_KEY, so the database
// alone can never decrypt anything. A full server compromise (env + code +
// DB) can — that is the accepted model; true zero-knowledge was rejected
// because it makes admin viewing lossy (lost URL = lost data).
//
// Rotating the master key invalidates every wrap — restoring data means
// restoring the old key (a re-wrap script is deliberate future work).
import { toBase64, fromBase64Bytes } from "./crypto";

export const SECURE_SHARE_BUCKET = "secure-shares";
/** Abuse ceiling for the public guest endpoint — not a UX affordance. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB (matches bucket file_size_limit)
export const MAX_TEXT_BYTES = 256 * 1024; // 256 KB
export const MAX_ITEMS_PER_SHARE = 50;

const KEK_SALT = "secure-share-kek-v1";
const PBKDF2_ITERATIONS = 600_000;

// Cached per process, keyed by the master value so tests can flip the env.
let kekCache: { master: string; key: Promise<CryptoKey> } | null = null;

/** KEK from the env master key. Missing env throws with the fix in the message. */
function kek(): Promise<CryptoKey> {
	const master = process.env.SECURE_SHARE_MASTER_KEY;
	if (!master) {
		throw new Error("SECURE_SHARE_MASTER_KEY is not set — secure shares cannot encrypt or decrypt.");
	}
	if (!kekCache || kekCache.master !== master) {
		kekCache = {
			master,
			key: crypto.subtle
				.importKey("raw", new TextEncoder().encode(master), "PBKDF2", false, ["deriveKey"])
				.then((k) =>
					crypto.subtle.deriveKey(
						{ name: "PBKDF2", salt: new TextEncoder().encode(KEK_SALT), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
						k,
						{ name: "AES-GCM", length: 256 },
						false,
						["encrypt", "decrypt"],
					),
				),
		};
	}
	return kekCache.key;
}

// TS 7 webcrypto typing demands ArrayBuffer-backed views; everything we pass
// is (TextEncoder/getRandomValues/arrayBuffer output) — one honest cast.
const bs = (u: Uint8Array) => u as unknown as Uint8Array<ArrayBuffer>;

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", bs(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-GCM encrypt → base64(iv ‖ ciphertext). GCM's auth tag is what makes a
 *  wrong master key fail loudly at unwrap time — no stored verifier needed. */
export async function encryptToBase64(key: CryptoKey | Uint8Array, plaintext: Uint8Array): Promise<string> {
	const k = key instanceof Uint8Array ? await aesKey(key) : key;
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, k, bs(plaintext)));
	const out = new Uint8Array(iv.length + ct.length);
	out.set(iv);
	out.set(ct, iv.length);
	return toBase64(out);
}

/** AES-GCM with a fresh iv — raw pieces, for binary payloads (file items). */
export async function encryptBytes(
	key: CryptoKey | Uint8Array,
	plaintext: Uint8Array,
): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
	const k = key instanceof Uint8Array ? await aesKey(key) : key;
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, k, bs(plaintext)));
	return { iv, ct };
	return { iv, ct };
}

/** Inverse of encryptToBase64. Rejects on wrong key or tampered ciphertext. */
export async function decryptFromBase64(key: CryptoKey | Uint8Array, blob: string): Promise<Uint8Array> {
	const data = fromBase64Bytes(blob);
	return decryptBytes(key, data.subarray(0, 12), data.subarray(12));
}

/** Inverse of encryptBytes. */
export async function decryptBytes(
	key: CryptoKey | Uint8Array,
	iv: Uint8Array,
	ct: Uint8Array,
): Promise<Uint8Array> {
	const k = key instanceof Uint8Array ? await aesKey(key) : key;
	return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(iv) }, k, bs(ct)));
}

/** Per-share DEK: 32 random bytes, returned wrapped under the KEK. */
export async function newWrappedDek(): Promise<string> {
	return encryptToBase64(await kek(), crypto.getRandomValues(new Uint8Array(32)));
}

/** Unwrap a share's DEK. A master-key mismatch surfaces as an explicit error,
 *  never as garbage output (GCM auth failure). */
export async function unwrapDek(wrapped: string): Promise<Uint8Array> {
	try {
		return await decryptFromBase64(await kek(), wrapped);
	} catch {
		throw new Error("Secure share decrypt failed — SECURE_SHARE_MASTER_KEY does not match this link's wrap.");
	}
}

export function shareExpired(s: { expiresAt: Date | null }): boolean {
	return s.expiresAt !== null && s.expiresAt.getTime() < Date.now();
}
