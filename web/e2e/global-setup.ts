import { writeFileSync, mkdirSync } from "node:fs";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ override: true, path: ".env.local" });

// Test fixtures for the client-portal e2e suite. Mirrors the manual ASPTR-224
// walkthrough: seed two companies (client + rival), invite client A via the
// GoTrue admin API, capture the invite link from the local Mailpit.
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const SITE = (process.env.PUBLIC_SITE_URL ?? "http://localhost:3011").replace(/\/$/, "");
const MAILPIT = "http://127.0.0.1:54324";
const CLIENT_EMAIL = "e2e-client-a@basalt.test";
const RIVAL_EMAIL = "e2e-client-b@basalt.test";
const PASSWORD = "e2e-cactus-2026!";

async function healthCheck() {
	for (const [name, url] of [
		["GoTrue", `${SUPABASE_URL}/auth/v1/health`],
		["Mailpit", `${MAILPIT}/api/v1/messages`],
	] as const) {
		const res = await fetch(url).catch(() => null);
		if (!res?.ok)
			throw new Error(
				`${name} not reachable at ${url} — run \`supabase start\` (and the web dev server target) first.`,
			);
	}
}

async function seed() {
	const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
	try {
		// Deterministic reruns: drop last run's fixtures, then reseed.
		await sql.unsafe(`
			begin;
			delete from client_company_members where member_id in (
				select id from client_members where email like 'e2e-client-%@basalt.test');
			delete from client_members where email like 'e2e-client-%@basalt.test';
			delete from invoices where number like 'E2E-%';
			delete from documents where title like 'E2E-%';
			delete from projects where name like 'E2E %';
			delete from companies where name like 'E2E %';
			insert into companies (name) values ('E2E Co A') returning id;
			with c as (insert into companies (name) values ('E2E Co B') returning id)
				insert into projects (name, company_id, engagement_type, hourly_rate, status)
				select 'E2E Project B', c.id, 'hourly', 150, 'active' from c;
			insert into projects (name, company_id, engagement_type, hourly_rate, status)
				select 'E2E Project A', id, 'retainer', 150, 'active' from companies where name = 'E2E Co A';
			insert into documents (project_id, type, title, description, visibility)
				select id, 'transcript', 'E2E-DOC-A', 'Only client A should see this.', 'client'
				from projects where name = 'E2E Project A';
			insert into documents (project_id, type, title, description, visibility)
				select id, 'transcript', 'E2E-DOC-B', 'Only client B should see this.', 'client'
				from projects where name = 'E2E Project B';
			insert into invoices (project_id, number, amount, status, issue_date, due_date, notes)
				select id, 'E2E-INV-A', 1234, 'sent', current_date, current_date + 30, 'e2e fixture'
				from projects where name = 'E2E Project A';
			insert into client_members (name, email, is_active)
				values ('E2E Client A', '${CLIENT_EMAIL}', true), ('E2E Client B', '${RIVAL_EMAIL}', true);
			insert into client_company_members (member_id, company_id)
				select m.id, c.id from client_members m, companies c
				where (m.email = '${CLIENT_EMAIL}' and c.name = 'E2E Co A')
				   or (m.email = '${RIVAL_EMAIL}' and c.name = 'E2E Co B');
			commit;
		`);
		const rival = (await sql`select id from projects where name = 'E2E Project B'`)[0];
		return rival.id as string;
	} finally {
		await sql.end();
	}
}

async function deleteAuthUser(email: string) {
	const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
		headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
	});
	const { users } = (await res.json()) as { users: { id: string; email: string }[] };
	const user = users.find((u) => u.email === email);
	if (!user) return;
	await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
		method: "DELETE",
		headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
	});
}

async function invite(email: string) {
	const res = await fetch(
		`${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(`${SITE}/portal/login`)}`,
		{
			method: "POST",
			headers: {
				apikey: SERVICE_KEY,
				Authorization: `Bearer ${SERVICE_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ email }),
		},
	);
	if (!res.ok) throw new Error(`invite failed (${res.status}): ${await res.text()}`);
}

async function captureInviteLink(email: string): Promise<string> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		const box = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as {
			messages: { ID: string; To: { Address: string }[]; Subject: string }[];
		};
		const mail = box.messages.find(
			(m) => m.Subject.toLowerCase().includes("invited") && m.To[0]?.Address === email,
		);
		if (mail) {
			const full = (await (await fetch(`${MAILPIT}/api/v1/message/${mail.ID}`)).json()) as {
				HTML?: string;
				Text?: string;
			};
			// hrefs are HTML-escaped (&amp;) — goto needs the raw URL.
			const body = (full.HTML ?? full.Text ?? "").replace(/&amp;/g, "&");
			const link = body.match(/href="([^"]+)"/)?.[1];
			if (link) return link;
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`No invite email for ${email} landed in Mailpit within 15s`);
}

export default async function globalSetup() {
	// This setup deletes and recreates fixtures; never let it target hosted data.
	const local = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);
	if (!SUPABASE_URL || !process.env.DATABASE_URL || !local(SUPABASE_URL) || !local(process.env.DATABASE_URL) || !local(SITE))
		throw new Error("Portal E2E requires local Supabase, database, and site URLs.");
	await healthCheck();
	const rivalProjectId = await seed();
	await deleteAuthUser(CLIENT_EMAIL);
	await deleteAuthUser(RIVAL_EMAIL);
	await invite(CLIENT_EMAIL);
	const inviteUrl = await captureInviteLink(CLIENT_EMAIL);
	mkdirSync(new URL(".", import.meta.url), { recursive: true });
	writeFileSync(
		new URL("./.state.json", import.meta.url),
		JSON.stringify({ email: CLIENT_EMAIL, password: PASSWORD, inviteUrl, rivalProjectId }, null, 2),
	);
}
