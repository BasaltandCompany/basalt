// No-JS form endpoint: the project page posts toggle-member forms natively.
// start re-exported the action as the handler; filesystem-routing needs an
// explicit APIHandler. The JS path uses toggleMemberActiveAction instead.
import { eq } from "drizzle-orm";
import type { APIEvent, APIHandler } from "filesystem-routing/api";
import { redirect } from "@solidjs/web";
import { db } from "~/db";
import { clientMembers } from "~/db/schema";
import { requireAdmin } from "~/lib/admin-queries";

export const POST: APIHandler = async ({ request }: APIEvent) => {
	await requireAdmin();
	const fd = await request.formData();
	const id = String(fd.get("id"));
	const isActive = fd.get("is_active") === "true";
	await db
		.update(clientMembers)
		.set({ isActive: !isActive })
		.where(eq(clientMembers.id, id));
	throw redirect("/admin/companies");
};
