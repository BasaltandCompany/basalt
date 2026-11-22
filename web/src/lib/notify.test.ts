import { describe, expect, test } from "bun:test";
import { previewLines } from "./notify";
import { renderQuoteReadyEmail, renderStatusUpdateEmail } from "./notify-emails";

describe("previewLines", () => {
	test("takes the first three non-empty lines", () => {
		expect(previewLines("a\n\nb\n\nc\n\nd")).toBe("a\nb\nc");
	});

	test("caps at 300 chars with an ellipsis", () => {
		const long = "x".repeat(400);
		const out = previewLines(long);
		expect(out.length).toBe(301);
		expect(out.endsWith("…")).toBe(true);
	});

	test("blank-only input is empty", () => {
		expect(previewLines("\n \n")).toBe("");
	});
});

describe("notification email HTML", () => {
	test("escapes client-controlled text (quote title is injected as HTML)", () => {
		const html = renderQuoteReadyEmail({
			title: '<script>alert("x")</script>',
			company: "Acme",
			total: "$1",
			lines: "2 lines",
			quoteUrl: "https://basalt.ac/portal/quotes/abc",
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain('href="https://basalt.ac/portal/quotes/abc"');
	});

	test("status email includes preview, digest, and portal CTA; omits digest when null", () => {
		const base = { heading: "Weekly update", projectName: "Kestrel", preview: "Shipped the thing", portalUrl: "https://basalt.ac/portal" };
		const withDigest = renderStatusUpdateEmail({ ...base, digest: "6.5h logged this week" });
		expect(withDigest).toContain("Shipped the thing");
		expect(withDigest).toContain("6.5h logged this week");
		const withoutDigest = renderStatusUpdateEmail({ ...base, digest: null });
		expect(withoutDigest).not.toContain("6.5h logged this week");
	});
});
