// No-JS form endpoint for the deliverable status <select> (native POST).
// The JS path uses updateDeliverableStatusAction instead.
import { eq } from "drizzle-orm";
import type { APIEvent, APIHandler } from "filesystem-routing/api";
import { redirect } from "@solidjs/web";
import { db } from "~/db";
import { deliverables } from "~/db/schema";
import { requireAdmin } from "~/lib/admin-queries";
import type { DeliverableStatus } from "~/db/schema";

export const POST: APIHandler = async ({ request }: APIEvent) => {
	await requireAdmin();
	const fd = await request.formData();
	const id = String(fd.get("id"));
	const status = String(fd.get("status")) as DeliverableStatus;
	await db
		.update(deliverables)
		.set({ status, updatedAt: new Date() })
		.where(eq(deliverables.id, id));
	const ref = fd.get("_referer");
	throw redirect(ref ? String(ref) : "/admin/projects");
};
