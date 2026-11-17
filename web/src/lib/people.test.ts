import { describe, expect, test } from "bun:test";
import { normalizeEmail, personSlug } from "./people";

describe("normalizeEmail", () => {
	test("trims and lowercases", () => {
		expect(normalizeEmail("  Eric@BCWForms.com ")).toBe("eric@bcwforms.com");
	});
	test("already-normalized input is untouched", () => {
		expect(normalizeEmail("eric@bcwforms.com")).toBe("eric@bcwforms.com");
	});
});

describe("personSlug", () => {
	test("mirrors the syncPersons page keying so CRM + corpus converge", () => {
		expect(personSlug("Eric Brownell")).toBe("person-eric-brownell");
	});
	test("handles punctuation-heavy names", () => {
		expect(personSlug("Gabe Pellicone Jr.")).toBe("person-gabe-pellicone-jr");
	});
});
