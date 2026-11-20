// No-JS form endpoint for the deliverable "add update" form (native POST).
// The JS path uses addDeliverableUpdateAction instead.
import { eq } from "drizzle-orm";
import type { APIEvent, APIHandler } from "filesystem-routing/api";
import { redirect } from "@solidjs/web";
import { db } from "~/db";
import { deliverableUpdates, deliverables } from "~/db/schema";
import { requireAdmin } from "~/lib/admin-queries";

export const POST: APIHandler = async ({ request }: APIEvent) => {
	await requireAdmin();
	const fd = await request.formData();
	const deliverableId = String(fd.get("deliverable_id"));
	const body = String(fd.get("body"));
	if (!body.trim()) return Response.json({ error: "Update cannot be empty" }, { status: 400 });
	await db.insert(deliverableUpdates).values({ deliverableId, body });
	await db
		.update(deliverables)
		.set({ updatedAt: new Date() })
		.where(eq(deliverables.id, deliverableId));
	const ref = fd.get("_referer");
	throw redirect(ref ? String(ref) : "/admin/projects");
};
