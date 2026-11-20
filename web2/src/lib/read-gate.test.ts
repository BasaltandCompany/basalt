import { describe, expect, test } from "bun:test";
import { clearLedger, nameKey, noteRead, requireRead, sessionKey } from "./read-gate";

describe("read-gate", () => {
	test("blocks an unread target, passes after noteRead", () => {
		clearLedger();
		const gate = requireRead("s1", "doc:abc", "call get_doc");
		expect(gate.ok).toBe(false);
		if (!gate.ok) {
			expect(gate.error).toContain("get_doc");
			expect(gate.required_read.keys).toEqual(["doc:abc"]);
		}
		noteRead("s1", "doc:abc");
		expect(requireRead("s1", "doc:abc", "call get_doc").ok).toBe(true);
	});

	test("any one of several keys satisfies", () => {
		clearLedger();
		noteRead("s1", ["prospect:acme co", "prospect:1111"]);
		expect(requireRead("s1", ["prospect:9999", "prospect:1111"], "hint").ok).toBe(true);
		expect(requireRead("s1", ["prospect:9999", "prospect:2222"], "hint").ok).toBe(false);
	});

	test("sessions are isolated", () => {
		clearLedger();
		noteRead("session-a", "campaign:1");
		expect(requireRead("session-b", "campaign:1", "hint").ok).toBe(false);
		expect(requireRead("session-a", "campaign:1", "hint").ok).toBe(true);
	});

	test("no chat_uuid falls into the shared bucket", () => {
		clearLedger();
		expect(sessionKey(undefined)).toBe("__shared__");
		expect(sessionKey("")).toBe("__shared__");
		expect(sessionKey("  ")).toBe("__shared__");
		const shared = sessionKey(null);
		noteRead(shared, "doc:x");
		expect(requireRead(shared, "doc:x", "hint").ok).toBe(true);
		expect(sessionKey("chat-1")).toBe("chat-1");
	});

	test("nameKey normalizes case and whitespace", () => {
		expect(nameKey("prospect", "  Acme Corp ")).toBe("prospect:acme corp");
		noteRead("s1", nameKey("prospect", "Acme Corp"));
		expect(requireRead("s1", nameKey("prospect", "acme corp "), "hint").ok).toBe(true);
	});

	test("keys without a colon are ignored", () => {
		clearLedger();
		noteRead("s1", ["garbage"]);
		expect(requireRead("s1", "garbage", "hint").ok).toBe(false);
	});

	test("evicts the least-recently-used session at the cap", () => {
		clearLedger();
		noteRead("old", "doc:old");
		for (let i = 0; i < 199; i++) noteRead(`filler-${i}`, `doc:${i}`);
		// touch "old" so it reads as most-recently-used; filler-0 becomes the LRU
		expect(requireRead("old", "doc:old", "hint").ok).toBe(true);
		noteRead("newest", "doc:new");
		expect(requireRead("old", "doc:old", "hint").ok).toBe(true);
		expect(requireRead("filler-0", "doc:0", "hint").ok).toBe(false);
		expect(requireRead("newest", "doc:new", "hint").ok).toBe(true);
	});
});
