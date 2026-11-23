// Self-check for gmail payload parsing + mime building (pure functions).
// Run: DATABASE_URL=postgres://dummy bun test src/lib/gmail.test.ts
import { describe, expect, test } from "bun:test";
import { buildMime, buildReplyQuote, stripQuotedHistory, extractText, extractHtml, addr, latestMessage, isTrashed, threadSubject, extractAttachments } from "./gmail";
import { toBase64 } from "./crypto";

const part = (mimeType: string, data: string): any => ({
	mimeType,
	body: { data: toBase64(data) },
	headers: [],
});

const msg = (headers: [string, string][], parts?: any[], body?: any): any => ({
	headers: headers.map(([name, value]) => ({ name, value })),
	parts: parts ?? [],
	...(body ?? {}), // Gmail payload shape: { mimeType, body: { data } } at top level
});

describe("extractText", () => {
	test("prefers text/plain part", () => {
		const p = msg(
			[],
			[part("text/html", "<b>html</b>"), part("text/plain", "plain text")],
		);
		expect(extractText(p)).toBe("plain text");
	});

	test("walks nested multipart", () => {
		const p = msg([], [part("multipart/alternative", ""), part("text/plain", "nested")]);
		expect(extractText(p)).toBe("nested");
	});

	test("falls back to de-tagged html", () => {
		const p = msg([], [], part("text/html", "<p>Hello <b>world</b></p><p>Second &amp; last</p>"));
		const out = extractText(p);
		expect(out).toContain("Hello world");
		expect(out).toContain("Second & last");
		expect(out).not.toContain("<p>");
	});

	test("empty payload → empty string", () => {
		expect(extractText(msg([]))).toBe("");
	});
});

describe("extractHtml", () => {
	test("returns the raw text/html part", () => {
		const p = msg([], [part("text/html", "<b>hi</b>"), part("text/plain", "plain")]);
		expect(extractHtml(p)).toBe("<b>hi</b>");
	});

	test("walks nested multipart", () => {
		const p = msg([], [part("multipart/alternative", ""), part("text/html", "<p>nested</p>")]);
		expect(extractHtml(p)).toBe("<p>nested</p>");
	});

	test("no html part → empty string", () => {
		expect(extractHtml(msg([], [part("text/plain", "plain")]))).toBe("");
	});
});

describe("addr", () => {
	test('"Name" <a@b.c>', () => {
		expect(addr('"Eric Brownell" <eric@cdl.example>')).toEqual({
			name: "Eric Brownell",
			email: "eric@cdl.example",
		});
	});
	test("bare address", () => {
		expect(addr("eric@cdl.example")).toEqual({ name: null, email: "eric@cdl.example" });
	});
});

describe("buildMime", () => {
	test("headers + body with CRLF", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "line one\nline two" });
		expect(mime).toContain("To: a@b.c");
		expect(mime).toContain("Subject: Hi");
		expect(mime).toContain("text/plain");
		expect(mime).toContain("\r\n\r\nline one\nline two");
	});
	test("From + Reply-To on every send", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "b" });
		expect(mime).toContain("From: Collin Pfeifer <cpfeifer@basalt.ac>");
		expect(mime).toContain("Reply-To: cpfeifer@basalt.ac");
	});
	test("cc/bcc headers, omitted when empty", () => {
		const mime = buildMime({ to: "a@b.c", cc: "c@d.e, f@g.h", bcc: "x@y.z", subject: "Hi", body: "b" });
		expect(mime).toContain("Cc: c@d.e, f@g.h");
		expect(mime).toContain("Bcc: x@y.z");
		expect(buildMime({ to: "a@b.c", subject: "Hi", body: "b" })).not.toContain("Cc:");
	});
	test("no signature → single plain part (machine sends stay bare)", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "b" });
		expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
		expect(mime).not.toContain("multipart");
		expect(mime).not.toContain("-- \n");
	});
	test("full signature → multipart/alternative with branded html part", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "line one\n<script>alert(1)</script> & more", signature: "full" });
		expect(mime).toContain('Content-Type: multipart/alternative; boundary="_basalt_sig"');
		// plain part: body + text signature
		expect(mime).toContain("line one\n<script>alert(1)</script> & more\n\n-- \nCollin Pfeifer");
		// html part: escaped body + logo + disclaimer, in order
		const htmlStart = mime.indexOf("<html><body");
		expect(htmlStart).toBeGreaterThan(-1);
		expect(mime.indexOf("line one<br>&lt;script&gt;")).toBeGreaterThan(htmlStart);
		expect(mime).toContain("/logo-email.png");
		expect(mime).toContain("cpfeifer@basalt.ac");
		expect(mime).toContain("confidential");
		expect(mime).toContain("--_basalt_sig--");
		// regression: the alternative header is emitted ONCE — a duplicate lands in
		// the body as preamble and strict clients (Spark) render the footer blank
		expect(mime.match(/Content-Type: multipart\/alternative/g)).toHaveLength(1);
		// body starts directly at the first boundary, no stray lines before it
		expect(mime.indexOf("--_basalt_sig")).toBeGreaterThan(mime.indexOf("\r\n\r\n"));
		expect(mime.split("\r\n\r\n")[1]?.startsWith("--_basalt_sig\r\n")).toBe(true);
	});
	test("plain signature → just Collin, no logo or disclaimer", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "quick note", signature: "plain" });
		expect(mime).toContain("multipart/alternative");
		expect(mime).toContain("quick note\n\n-- \nCollin");
		expect(mime).toContain(">Collin</div>");
		expect(mime).not.toContain("logo-email.png");
		expect(mime).not.toContain("confidential");
	});
	test("per-draft footer override replaces both parts, variant None still bare", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "body", signature: "full", signatureText: "Collin Pfeifer\nTechnology · Basalt & Company" });
		expect(mime).toContain("body\n\nCollin Pfeifer\nTechnology · Basalt & Company");
		expect(mime).toContain("Collin Pfeifer<br>Technology · Basalt &amp; Company");
		expect(mime).not.toContain("logo-email.png");
		expect(mime).not.toContain("confidential");
		// None wins over any override — no footer at all
		const bare = buildMime({ to: "a@b.c", subject: "Hi", body: "b", signatureText: "x" });
		expect(bare).not.toContain("multipart");
		// blank/whitespace override falls back to the branded variant
		const branded = buildMime({ to: "a@b.c", subject: "Hi", body: "b", signature: "full", signatureText: "   " });
		expect(branded).toContain("logo-email.png");
	});

	test("reply MIME orders body, footer, then the latest-message quote in plain and HTML", () => {
		const mime = buildMime({
			to: "a@b.c",
			subject: "Hi",
			body: "BODY TOKEN",
			signature: "full",
			signatureText: "FOOTER TOKEN",
			quotedReply: "On Nov 19, 2026, Jane wrote:\n> QUOTE TOKEN",
		});
		const htmlStart = mime.indexOf("<html><body");
		expect(mime.indexOf("BODY TOKEN")).toBeLessThan(mime.indexOf("FOOTER TOKEN"));
		expect(mime.indexOf("FOOTER TOKEN")).toBeLessThan(mime.indexOf("On Nov 19, 2026"));
		expect(mime.indexOf("BODY TOKEN", htmlStart)).toBeLessThan(mime.indexOf("FOOTER TOKEN", htmlStart));
		expect(mime.indexOf("FOOTER TOKEN", htmlStart)).toBeLessThan(mime.indexOf("<blockquote", htmlStart));
		expect(mime).toContain("QUOTE TOKEN");
	});

	// ── attachments ──
	test("attachments → multipart/mixed, body section first, one base64 part per file", () => {
		const b64 = toBase64("PDFBYTES");
		const mime = buildMime({
			to: "a@b.c",
			subject: "Proposal",
			body: "attached",
			attachments: [{ filename: "BCW Projects — Proposal.pdf", mimeType: "application/pdf", base64: b64 }],
		});
		expect(mime).toContain('Content-Type: multipart/mixed; boundary="_basalt_att"');
		// body stays the first part, text/plain, unharmed
		expect(mime.indexOf("--_basalt_att")).toBeLessThan(mime.indexOf("Content-Type: text/plain"));
		expect(mime).toContain("\r\n\r\nattached\r\n--_basalt_att");
		expect(mime).toContain('Content-Disposition: attachment; filename="BCW Projects — Proposal.pdf"');
		expect(mime).toContain('Content-Type: application/pdf; name="BCW Projects — Proposal.pdf"');
		expect(mime).toContain("Content-Transfer-Encoding: base64");
		expect(mime).toContain(b64);
		expect(mime.trimEnd().endsWith("--_basalt_att--")).toBe(true);
	});

	test("base64 lines wrapped at 76 chars (RFC 2045)", () => {
		const long = "Q".repeat(200);
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "b", attachments: [{ filename: "x.txt", mimeType: "text/plain", base64: long }] });
		for (const line of mime.split("\r\n")) {
			if (/^[A-Za-z0-9+/]+=*$/.test(line)) expect(line.length).toBeLessThanOrEqual(76);
		}
		expect(mime).toContain("Q".repeat(76));
	});

	test("attachments + signature keep body, footer, quote before files", () => {
		const mime = buildMime({
			to: "a@b.c",
			subject: "Hi",
			body: "BODY TOKEN",
			signature: "plain",
			quotedReply: "On Nov 19, 2026, Jane wrote:\n> QUOTE TOKEN",
			attachments: [{ filename: "a.pdf", mimeType: "application/pdf", base64: toBase64("x") }],
		});
		const attachment = mime.indexOf('Content-Disposition: attachment; filename="a.pdf"');
		expect(mime).toContain("multipart/mixed");
		expect(mime).toContain("multipart/alternative");
		expect(mime.indexOf("BODY TOKEN")).toBeLessThan(mime.indexOf("-- \nCollin"));
		expect(mime.indexOf("-- \nCollin")).toBeLessThan(mime.indexOf("QUOTE TOKEN"));
		expect(mime.indexOf("QUOTE TOKEN")).toBeLessThan(attachment);
		expect(mime.trimEnd().endsWith("--_basalt_att--")).toBe(true);
	});

	test("filename header-breaking chars stripped", () => {
		const mime = buildMime({ to: "a@b.c", subject: "Hi", body: "b", attachments: [{ filename: 'bad\r\n"name".pdf', mimeType: "application/pdf", base64: "eA==" }] });
		expect(mime).toContain('filename="badname.pdf"');
		expect(mime).not.toContain('"name"');
	});
	test("no attachments → output byte-identical to the legacy single-part path", () => {
		const plain = buildMime({ to: "a@b.c", subject: "Hi", body: "b" });
		const empty = buildMime({ to: "a@b.c", subject: "Hi", body: "b", attachments: [] });
		expect(empty).toBe(plain);
		expect(plain).not.toContain("multipart");
	});
});

describe("reply history trimming", () => {
	test("keeps only the newest message from a nested Gmail reply", () => {
		const body = `Sounds good. Add me as reviewer on the PRs.

Luke Leckron | BCW Supplies

On Nov 20, 2026, 4:30 PM, Basalt & Company <cpfeifer@basalt.ac> wrote:
> Perfect thanks Luke.
>
> On Nov 19, 2026, 9:00 AM, Luke wrote:
> > Older history`;
		expect(stripQuotedHistory(body)).toBe("Sounds good. Add me as reviewer on the PRs.\n\nLuke Leckron | BCW Supplies");
	});

	test("cuts leading quote blocks and Outlook original-message headers", () => {
		expect(stripQuotedHistory("> old message\n> older message")).toBe("");
		expect(stripQuotedHistory("Latest answer.\n\nOn Nov 20, Jane <jane@example.com>\nwrote:\n> old message")).toBe("Latest answer.");
		expect(
			stripQuotedHistory(`Latest answer.

-----Original Message-----
From: Jane Smith <jane@example.com>
Sent: Thursday, November 19, 2026 4:42 PM
To: Collin Pfeifer <cpfeifer@basalt.ac>
Subject: Re: Hello

Old message`),
		).toBe("Latest answer.");
	});

	test("ordinary text containing From is unchanged", () => {
		const body = "From the client side, this looks good.\nShip it tomorrow.";
		expect(stripQuotedHistory(body)).toBe(body);
	});
});

describe("latestMessage", () => {
	const m = (id: string, internalDate: string, labelIds: string[] = []): any => ({
		id,
		internalDate,
		labelIds,
	});

	test("picks last by date, not array order (sent mail stored after a newer reply)", () => {
		const msgs = [m("reply", "1700001000000"), m("mine", "1700009000000")];
		expect(latestMessage(msgs)?.id).toBe("mine");
	});

	test("empty array → undefined", () => {
		expect(latestMessage([])).toBeUndefined();
	});
});

describe("threadSubject", () => {
	const m = (id: string, internalDate: string, subject: string): any => ({
		id,
		internalDate,
		payload: { headers: [{ name: "Subject", value: subject }] },
	});

	test("subject stays the root message's — an NDR (Delivery Status Notification) inside the thread must not rename it", () => {
		const msgs = [
			m("ndr", "1700010000000", "Delivery Status Notification (Failure)"),
			m("sent", "1700000000000", "made something for Koola Logistics"),
		];
		expect(threadSubject(msgs)).toBe("made something for Koola Logistics");
	});

	test("missing subject header → (no subject)", () => {
		expect(threadSubject([{ id: "x", internalDate: "1" } as any])).toBe("(no subject)");
	});
});

describe("isTrashed", () => {
	test("every message TRASH → true", () => {
		expect(isTrashed({ messages: [{ labelIds: ["TRASH"] }, { labelIds: ["TRASH", "UNREAD"] }] as any })).toBe(true);
	});
	test("any message still live → false", () => {
		expect(isTrashed({ messages: [{ labelIds: ["INBOX"] }, { labelIds: ["TRASH"] }] as any })).toBe(false);
	});
	test("no messages → false", () => {
		expect(isTrashed({})).toBe(false);
	});
});

// ── Rate-limit backoff (fetch stubbed; token endpoint answers too) ──
import { gmail, latestByThread } from "./gmail";

const account = { id: "a1", refreshToken: "r" } as any;
const json = (body: any, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const QUOTA_403 = () =>
	json(
		{ error: { code: 403, message: "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'" } },
		403,
	);

// stub fetch: token endpoint always OK; gmail endpoint replays `api` responses,
// then 200s with `final()`. api/final are factories — Response bodies are single-use.
function stubFetch(api: Response[], final: () => Response) {
	const paths: string[] = [];
	const real = globalThis.fetch;
	globalThis.fetch = (async (url: any) => {
		if (String(url).includes("gmail.googleapis.com")) {
			paths.push(String(url).replace(/^.*gmail\/v1\/users\/me/, ""));
			return api.length ? api.shift()! : final();
		}
		return json({ access_token: "at", expires_in: 3600 });
	}) as any;
	return { paths, restore: () => (globalThis.fetch = real) };
}

describe("gmail backoff", () => {
	test("quota 403 → retries → succeeds", async () => {
		const { paths, restore } = stubFetch([QUOTA_403()], () => json({ id: "t1", historyId: "1" }));
		try {
			const out = await gmail<{ id: string }>(account, "/threads/x", { method: "POST" });
			expect(out.id).toBe("t1");
			expect(paths).toEqual(["/threads/x", "/threads/x"]);
		} finally {
			restore();
		}
	});

	test("plain 403 (permission) → fails fast, no retry", async () => {
		const { paths, restore } = stubFetch([json({ error: { code: 403, message: "The user is not authorized" } }, 403)], () => json({}));
		try {
			await expect(gmail(account, "/threads/x")).rejects.toThrow(/403|not authorized/);
			expect(paths).toEqual(["/threads/x"]);
		} finally {
			restore();
		}
	});

	test("GET 5xx → retries; POST 5xx → fails fast", async () => {
		const get = stubFetch([json({ error: { code: 500 } }, 500)], () => json({ id: "g1" }));
		try {
			const out = await gmail<{ id: string }>(account, "/threads/x");
			expect(out.id).toBe("g1");
			expect(get.paths.length).toBe(2);
		} finally {
			get.restore();
		}
		const post = stubFetch([json({ error: { code: 500 } }, 500)], () => json({}));
		try {
			await expect(gmail(account, "/messages/send", { method: "POST" })).rejects.toThrow();
			expect(post.paths.length).toBe(1);
		} finally {
			post.restore();
		}
	});

	test(
		"gives up after 3 retries on persistent throttling",
		async () => {
			const { paths, restore } = stubFetch([], QUOTA_403);
			try {
				await expect(gmail(account, "/threads/x")).rejects.toThrow(/Quota/);
				expect(paths.length).toBe(4); // 1 + 3 retries
			} finally {
				restore();
			}
		},
		15_000, // backoff sleeps 1+2+4s + jitter
	);
});

describe("latestByThread", () => {
	const stub = (threadId: string, internalDate: string, snippet: string, labelIds?: string[]) => ({
		threadId,
		internalDate,
		snippet,
		labelIds,
	});

	test("newest message per thread wins", () => {
		const out = latestByThread([
			stub("t1", "1000", "first"),
			stub("t1", "2000", "second"),
			stub("t2", "3000", "other thread"),
		]);
		expect(out.get("t1")?.snippet).toBe("second");
		expect(out.get("t1")?.date).toEqual(new Date(2000));
		expect(out.get("t2")?.snippet).toBe("other thread");
	});

	test("unread comes from the newest message", () => {
		const out = latestByThread([
			stub("t1", "1000", "read one", []),
			stub("t1", "2000", "unread one", ["INBOX", "UNREAD"]),
		]);
		expect(out.get("t1")?.unread).toBe(true);
	});

	test("older unread message does not mark thread unread", () => {
		const out = latestByThread([
			stub("t1", "2000", "read reply", ["INBOX"]),
			stub("t1", "1000", "unread old", ["UNREAD"]),
		]);
		expect(out.get("t1")?.unread).toBe(false);
	});

	test("missing labelIds → not unread", () => {
		const out = latestByThread([stub("t1", "1", "s")]);
		expect(out.get("t1")?.unread).toBe(false);
	});
});

describe("extractAttachments", () => {
	test("collects nested parts carrying filename + attachmentId", () => {
		const p = msg(
			[],
			[
				{ ...part("text/plain", "hi") },
				{
					mimeType: "multipart/mixed",
					headers: [],
					parts: [
						{ mimeType: "application/pdf", filename: "quote.pdf", headers: [], body: { attachmentId: "att1", size: 1234 } },
						{ mimeType: "image/png", filename: "logo.png", headers: [], body: { attachmentId: "att2", size: 10 } },
					],
				},
			],
		);
		const out = extractAttachments(p);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ filename: "quote.pdf", mimeType: "application/pdf", size: 1234, attachmentId: "att1" });
	});

	test("body parts without attachmentId are skipped", () => {
		const p = msg([], [part("text/plain", "just text")]);
		expect(extractAttachments(p)).toEqual([]);
	});
});

describe("buildReplyQuote", () => {
	test("header + > prefixed newest-message lines", () => {
		const q = buildReplyQuote({ date: new Date(2026, 10, 19, 16, 42), fromName: "Jane Smith", fromEmail: "jane@acme.com", bodyText: "line one\nline two" });
		expect(q?.split("\n")[0]).toMatch(/^On Nov 19, 2026, 4:42 PM, Jane Smith <jane@acme\.com> wrote:$/);
		expect(q).toContain("> line one\n> line two");
	});

	test("nested history is omitted from the quote", () => {
		const q = buildReplyQuote({
			date: new Date(2026, 10, 19),
			fromName: "Jane",
			bodyText: "new answer\n\nOn Nov 18, 2026, 1:00 PM, Collin wrote:\n> old answer",
		});
		expect(q).toContain("> new answer");
		expect(q).not.toContain("old answer");
	});

	test("blank newest content returns no quote", () => {
		expect(buildReplyQuote({ date: new Date(2026, 10, 19), fromEmail: "x@y.z", bodyText: "> old message" })).toBeNull();
	});
});
