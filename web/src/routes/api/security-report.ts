import type { APIEvent } from "filesystem-routing/api";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { clientCompanyMembers } from "~/db/schema";
import { getClient } from "~/lib/client-session";
import { supabaseService } from "~/lib/supabase";
import { reportPathAllowed } from "~/lib/security-reports";

/** Signed URLs for weekly security reports in the private `security-reports`
 *  bucket. Auth: portal client session only, scoped by path prefix to the
 *  member's own companies (same app-level model as every portal query).
 *  ?download=1 forces a PDF download instead of inline view. */
export async function GET(event: APIEvent) {
	const url = new URL(event.request.url);
	const path = url.searchParams.get("path");
	const download = url.searchParams.get("download");
	if (!path) return new Response("Missing path", { status: 400 });

	const member = await getClient();
	if (!member) return new Response("Unauthorized", { status: 401 });

	const memberships = await db
		.select({ companyId: clientCompanyMembers.companyId })
		.from(clientCompanyMembers)
		.where(eq(clientCompanyMembers.memberId, member.id));

	if (!reportPathAllowed(path, memberships.map((m) => m.companyId))) {
		return new Response("Unauthorized", { status: 401 });
	}

	const svc = supabaseService();
	const { data, error } = await svc.storage.from("security-reports").createSignedUrl(
		path,
		3600,
		download ? { download: `security-report-${path.split("/")[1]}.pdf` } : undefined,
	);
	if (error || !data?.signedUrl) return new Response("Report not found", { status: 404 });

	return new Response(null, { status: 302, headers: { Location: data.signedUrl } });
}
