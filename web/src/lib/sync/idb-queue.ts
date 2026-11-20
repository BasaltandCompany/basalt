// Durable tx queue storage — one IndexedDB store ("basalt-sync" → "txs"),
// raw API, no dependency. Pending transactions survive a refresh or disconnect
// here and replay on boot (Linear's __transactions table, minimal).
// Falls back to an in-memory map when IndexedDB is unavailable (SSR, tests)
// so callers stay unchanged.
const DB_NAME = "basalt-sync";
const STORE = "txs";

let dbp: Promise<IDBDatabase | null> | null = null;
const mem = new Map<string, unknown>(); // fallback when indexedDB is missing

function open(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") return Promise.resolve(null);
	if (!dbp) {
		dbp = new Promise((resolve) => {
			const req = indexedDB.open(DB_NAME, 1);
			req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => resolve(null); // private mode / blocked — memory fallback
		});
	}
	return dbp;
}

export const idbQueue = {
	async put(value: { id: string }): Promise<void> {
		const db = await open();
		if (!db) {
			mem.set(value.id, value);
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).put(value);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},
	async remove(id: string): Promise<void> {
		const db = await open();
		if (!db) {
			mem.delete(id);
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.objectStore(STORE).delete(id);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	},
	async all(): Promise<{ id: string }[]> {
		const db = await open();
		if (!db) return [...mem.values()] as { id: string }[];
		return new Promise((resolve, reject) => {
			const tx = db.transaction(STORE, "readonly");
			const req = tx.objectStore(STORE).getAll();
			req.onsuccess = () => resolve(req.result as { id: string }[]);
			req.onerror = () => reject(req.error);
		});
	},
};
