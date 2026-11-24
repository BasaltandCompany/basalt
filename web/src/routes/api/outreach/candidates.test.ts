import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

const rows: { company: string; contactName?: string | null; notes?: string | null; stage?: string }[] = [];
const dialect = new PgDialect();
const db = {
  select: () => ({ from: () => ({ where: (condition: any) => ({ limit: async () => {
    const { sql, params } = dialect.sqlToQuery(condition);
    const row = rows.find((r) => sql.includes("substring(")
      ? r.notes && (sql.includes("/sales/lead/") ? r.notes.match(/\/sales\/lead\/([\w-]+)/)?.[1] : r.notes.match(/\/in\/([\w.%-]+)/)?.[1]?.toLowerCase()) === params.at(-1)
      : r.company.toLowerCase() === String(params.at(-1)).toLowerCase());
    return row ? [{ id: "existing" }] : [];
  } }) }) }),
  insert: () => ({ values: async (row: typeof rows[number]) => { rows.push(row); } }),
};
mock.module("~/db", () => ({ db }));
mock.module("~/lib/admin-api", () => ({ isAdminApiKey: async () => true, json: (body: unknown, status = 200) => Response.json(body, { status }) }));
const { POST, linkedinProfileKey } = await import("./[loop]");

async function add(candidates: unknown[]) {
  const res = await POST({ request: new Request("https://basalt.ac/api/outreach/candidates", { method: "POST", body: JSON.stringify({ candidates }) }) } as Parameters<typeof POST>[0]);
  return { status: res.status, data: await res.json() };
}

describe("outreach candidates", () => {
  test("saves distinct people at one company and skips the same Sales Navigator lead with another tracking suffix", async () => {
    rows.length = 0;
    const first = "https://www.linkedin.com/sales/lead/ACwAABV1UJ8BGiRn9L_0gVqvCP78A7sRticW6Mo,NAME_SEARCH,YbK5";
    expect((await add([{ company: "Acme", contactName: "A", profileUrl: first }])).data.created).toBe(1);
    expect((await add([{ company: "Acme", contactName: "B", profileUrl: "https://www.linkedin.com/sales/lead/BB_123,OTHER,x" }])).data.created).toBe(1);
    expect((await add([{ company: "Acme", contactName: "A", profileUrl: first.replace("NAME_SEARCH,YbK5", "OTHER,abc") }])).data.skipped).toBe(1);
    expect(rows).toHaveLength(2);
  });
  test("matches pre-existing li notes and keeps URL-less company dedupe", async () => {
    rows.length = 0;
    rows.push({ company: "OldCo", notes: "li: https://www.linkedin.com/in/person-a/?trk=old" });
    expect((await add([{ company: "OldCo", profileUrl: "https://www.linkedin.com/in/person-a" }])).data.skipped).toBe(1);
    expect((await add([{ company: "OldCo", contactName: "Person B", profileUrl: "https://www.linkedin.com/in/person-b" }])).data.created).toBe(1);
    expect((await add([{ company: "OldCo" }])).data.skipped).toBe(1);
    expect(rows).toHaveLength(2);
  });
  test("rejects non-LinkedIn URLs without partially inserting a batch", async () => {
    rows.length = 0;
    expect((await add([{ company: "Good", profileUrl: "https://www.linkedin.com/in/good" }, { company: "Bad", profileUrl: "https://evil.example/in/bad" }])).status).toBe(400);
    expect(rows).toHaveLength(0);
    expect(linkedinProfileKey("https://www.linkedin.com.evil.example/in/bad")).toBeNull();
  });
});
