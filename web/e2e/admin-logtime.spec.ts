import { test, expect } from "@playwright/test";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ override: true, path: ".env.local" });

// Admin "log time" must not halt the client's reactive system. Solid 2 throws
// CLEANUP_IN_FORBIDDEN_SCOPE when onCleanup runs inside an onSettled scope —
// that error halts reactivity app-wide (the entry still writes server-side,
// but the UI only updates after a refresh). This spec pins the fix.
const ADMIN_EMAIL = "e2e-admin@basalt.test";
const PASSWORD = "e2e-cactus-2026!";

test.beforeAll(async () => {
	// Seed the admin user if missing (idempotent).
	const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email: ADMIN_EMAIL, password: PASSWORD, email_confirm: true }),
	});
	const body = (await res.json()) as { msg?: string; error_code?: string; id?: string };
	if (!res.ok && body.error_code !== "email_exists") {
		throw new Error(`admin seed failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
	}
	// A project to log time against.
	const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
	const [{ count }] = await sql`
		select count(*)::int as count from projects where status = 'active'
	`;
	await sql.end();
	if (count === 0) throw new Error("need at least one active project for the log-time form");
});

test("log time updates the dashboard without an uncaught client exception", async ({ page }) => {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(String(e)));
	page.on("console", (m) => {
		if (m.type() === "error" && /REACTIVITY|CLEANUP_IN/i.test(m.text())) errors.push(m.text());
	});

	await page.goto("/admin/login");
	await page.fill('input[name="email"]', ADMIN_EMAIL);
	await page.fill('input[name="password"]', PASSWORD);
	await page.click('button[type="submit"]');
	await page.waitForTimeout(2000);

	await page.goto("/admin");
	await page.waitForSelector('form:has(textarea[name="description"])');
	const desc = `e2e log-time ${Date.now()}`;
	const form = page.locator('form:has(textarea[name="description"])');
	await form.locator('button[aria-haspopup="listbox"]').click();
	await page.locator('[role="option"]').first().click();
	await form.locator('input[name="hours"]').fill("0.25");
	await form.locator('textarea[name="description"]').fill(desc);
	await page.click('button:has-text("Log Entry")');

	// The new entry must appear client-side (no refresh) and nothing may throw.
	await expect(page.locator("table", { hasText: desc })).toBeVisible({ timeout: 10_000 });

	// ── Sidebar Timer: start + stop must both update the UI with no throw.
	// Same crash class as the log-entry form (covers the redirect-throwing
	// start/stop actions the entry form doesn't exercise).
	const timerForm = page.locator("form:has(button.timer-start)");
	await timerForm.locator('button[aria-haspopup="listbox"]').click();
	await page.locator('[role="option"]').first().click();
	await timerForm.locator('input[name="description"]').fill("e2e timer");
	await timerForm.locator("button.timer-start").click();
	await expect(page.locator("button.timer-stop")).toBeVisible({ timeout: 10_000 });
	await page.locator("button.timer-stop").click();
	await expect(page.locator("button.timer-start")).toBeVisible({ timeout: 10_000 });
	expect(errors).toEqual([]);
});
