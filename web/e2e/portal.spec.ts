import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const state = JSON.parse(
	readFileSync(new URL("./.state.json", import.meta.url), "utf8"),
) as { email: string; password: string; inviteUrl: string; rivalProjectId: string };

// Sign in through the real UI. Signs out first so tests are order-independent.
async function login(page: Page) {
	await page.goto("/portal/logout");
	await page.goto("/portal/login");
	// Hydration attaches the action handlers — clicking before it lands does a
	// native GET submit (credentials in the URL) and the login silently fails.
	await page.waitForLoadState("networkidle");
	await page.getByRole("textbox", { name: /email/i }).fill(state.email);
	await page.getByRole("textbox", { name: /password/i }).fill(state.password);
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL("**/portal");
}

test.describe("client portal", () => {
	test("signs up via the invite email link", async ({ page }) => {
		await page.goto(state.inviteUrl);
		await expect(page.getByRole("heading", { name: /set your password/i })).toBeVisible({
			timeout: 10_000,
		});
		await page.getByRole("textbox", { name: /new password/i }).fill(state.password);
		await page.getByRole("textbox", { name: /confirm password/i }).fill(state.password);
		await page.getByRole("button", { name: /set password/i }).click();
		await page.waitForURL("**/portal");
		// Own data, not the rival's.
		await expect(page.getByText("E2E Project A")).toBeVisible();
		await expect(page.getByText(state.email)).toBeVisible();
		await expect(page.getByText("E2E Project B")).toHaveCount(0);
	});

	test("documents list survives hydration and is company-scoped", async ({ page }) => {
		await login(page);
		await page.goto("/portal/documents");
		// Regression for the hydration wipe: SSR had the doc, the client dropped it.
		await expect(page.getByText("E2E-DOC-A")).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText("E2E-DOC-B")).toHaveCount(0);
	});

	test("invoices show only the client's own invoice", async ({ page }) => {
		await login(page);
		await page.goto("/portal/invoices");
		await expect(page.getByText("E2E-INV-A")).toBeVisible();
		await expect(page.getByText("E2E-INV-B")).toHaveCount(0);
	});

	test("deep-linking another company's project redirects without leaking", async ({ page }) => {
		await login(page);
		await page.goto(`/portal/projects/${state.rivalProjectId}`);
		await page.waitForURL("**/portal");
		const body = await page.locator("body").innerText();
		expect(body).not.toContain("E2E Project B");
		expect(body).not.toContain("E2E-DOC-B");
	});

	test("sign out ends the session", async ({ page }) => {
		await login(page);
		await page.getByRole("button", { name: /sign out/i }).click();
		await page.waitForURL("**/portal/login");
		await page.goto("/portal");
		await page.waitForURL("**/portal/login");
	});

	// Known broken: superseded server-query flights halt the reactive tree.
	// fixme(ASPTR-225)
	test.fixme("documents search-as-you-type filters results", async ({ page }) => {
		await login(page);
		await page.goto("/portal/documents");
		await page.getByRole("textbox", { name: /search documents/i }).fill("rival");
		await expect(page.getByText("E2E-DOC-A")).toHaveCount(0);
		await expect(page.getByText("No matches found")).toBeVisible();
	});
});
