import { test, expect } from "@playwright/test";
import { utimesSync } from "node:fs";
import path from "node:path";

// One-off check: after a "deploy" (Last-Modified of the prerendered page
// changes), the running SPA must reload itself within one poll tick.
test("deploy watcher reloads the SPA on a new bundle", async ({ page }) => {
	await page.addInitScript(() => {
		const loads = Number(sessionStorage.getItem("watch-check-loads") ?? 0) + 1;
		sessionStorage.setItem("watch-check-loads", String(loads));
	});
	await page.goto("/admin/login");
	await page.waitForSelector('input[name="email"]');
	// The watcher only arms when the server stamps Last-Modified (prod build);
	// vite dev serves SSR without it, so skip there.
	const lm = await page.evaluate(async () => (await fetch("/", { method: "HEAD" })).headers.get("last-modified"));
	test.skip(!lm, "dev server serves no Last-Modified — deploy watcher is prod-only");
	
	expect(await page.evaluate(() => Number(sessionStorage.getItem("watch-check-loads")))).toBe(1);

	// simulate a deploy: fresh mtime on the prerendered page
	const idx = path.resolve("dist/client/index.html");
	utimesSync(idx, new Date(), new Date());

	// one poll tick (60s) + slack
	await page.waitForTimeout(70_000);
	expect(await page.evaluate(() => Number(sessionStorage.getItem("watch-check-loads")))).toBeGreaterThanOrEqual(2);
});
