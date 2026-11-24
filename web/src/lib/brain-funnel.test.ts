// Tests for the /gift funnel edges: gift-request validation (400/honeypot
// paths — the insert needs a real DB, out of scope for this suite). Open/click
// tracking is native now: seal pixel (/api/track/open) + /l/?r={{email}} into
// short_link_clicks — no Resend webhook in the loop.
import { describe, expect, test } from "bun:test";
import { POST as giftRequest } from "../routes/api/gift-request";

describe("gift-request validation", () => {
	let ip = 0;
	const call = (payload: Record<string, unknown>) =>
		giftRequest({
			request: new Request("http://x/api/gift-request", {
				method: "POST",
				body: JSON.stringify(payload),
				headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${++ip}` },
			}),
		} as never);

	test("missing name/company → 400", async () => {
		expect((await call({ email: "a@b.co" })).status).toBe(400);
		expect((await call({ name: "A", company: " " })).status).toBe(400);
	});

	test("invalid email → 400", async () => {
		expect((await call({ name: "A", company: "B", email: "nope" })).status).toBe(400);
	});

	test("pilot application requires industry, tech footprint and consent, not revenue or a proposed workflow", async () => {
		const base = { name: "A", company: "B", email: "a@b.co", about: "Metal parts", industry: "Fabrication", techFootprint: "One IT manager", contactConsent: "yes" };
		expect((await call({ ...base, industry: "" })).status).toBe(400);
		expect((await call({ ...base, techFootprint: "" })).status).toBe(400);
		expect((await call({ ...base, contactConsent: false })).status).toBe(400);
		expect((await call({ ...base, about: "x".repeat(2001) })).status).toBe(400);
	});

	test("honeypot filled → silent ok, nothing stored", async () => {
		const res = await call({ website: "spam.example", name: "A", company: "B", email: "a@b.co" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	test("malformed JSON → 400", async () => {
		const res = giftRequest({
			request: new Request("http://x", { method: "POST", body: "not json" }),
		} as never);
		expect((await res).status).toBe(400);
	});

	test("public pilot keeps verified proof, without exposing the ICP or a game-plan offer", async () => {
		const root = new URL("../routes/", import.meta.url);
		const home = await Bun.file(new URL("index.tsx", root)).text();
		const gift = await Bun.file(new URL("gift.tsx", root)).text();
		const study = await Bun.file(new URL("case-study.tsx", root)).text();
		expect(home).toContain("2.75x");
		expect(study).toContain("2.2×");
		expect(study).toContain("REN-ISAC");
		for (const copy of [home, gift, study]) expect(copy).not.toMatch(/10–70M|free game plan/i);
		expect(gift).toContain('name="industry"');
		expect(gift).toContain('name="techFootprint"');
		expect(gift).not.toContain('name="revenue"');
		const admin = await Bun.file(new URL("../routes/admin/brain-requests/index.tsx", import.meta.url)).text();
		for (const term of ["Legacy game plan + three months of Claude", "r.answers.industry", "r.answers.techFootprint"]) expect(admin).toContain(term);
	});
});
