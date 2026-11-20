export async function POST() {
	const { signOut } = await import("~/lib/session");
	await signOut();
	return new Response(null, {
		status: 302,
		headers: { Location: "/admin/login" },
	});
}
