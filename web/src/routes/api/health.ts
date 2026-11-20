import type { APIHandler } from "filesystem-routing/api";

export const GET: APIHandler = () => Response.json({ ok: true, ts: Date.now() });
