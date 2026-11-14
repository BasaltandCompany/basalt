import { query, action, revalidate } from "@solidjs/router";
import { setCookie } from "@solidjs/start/http";
import { getAuthedClient, COOKIE_OPTS } from "./session";
import { supabaseAdmin, supabaseService } from "./supabase";
import { requireAdmin } from "./admin-queries";

// ── Hosted OAuth consent page (/oauth/consent) ────────────────────
// Supabase's OAuth 2.1 server bounces third-party app sign-ins here with an
// authorization_id. This module backs the login form and Continue/Cancel.
// Session = the Supabase token cookies (getAuthedClient) — a portal member's
// mc-client-session is a DB id and can't call the consent API, so visitors may
// be asked to sign in even if they were already in the portal.

export type ConsentState =
	| { status: "invalid"; message: string }
	| { status: "signed-out" }
	| { status: "continue"; redirectUrl: string }
	| {
			status: "consent";
			appName: string;
			appUri: string;
			logoUri: string;
			scopes: string[];
			email: string;
	  };

/** Resolve the authorization request → login form | consent card | error card. */
export const getConsentQuery = query(async (authorizationId: string): Promise<ConsentState> => {
	"use server";
	if (!authorizationId)
		return {
			status: "invalid",
			message: "This sign-in request is missing its authorization ID. Go back to the app and try again.",
		};
	const supabase = await getAuthedClient();
	if (!supabase) return { status: "signed-out" };
	const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
	// Users who already granted this app get {redirect_url} back (server skips
	// consent and issues the code) — the page just continues the redirect.
	if (!error && data && "redirect_url" in data)
		return { status: "continue", redirectUrl: data.redirect_url };
	if (error || !data || !("client" in data))
		return {
			status: "invalid",
			message: "This sign-in request has expired or is no longer valid. Return to the app and try again.",
		};
	return {
		status: "consent",
		appName: data.client.name || "the app",
		appUri: data.client.uri || "",
		logoUri: data.client.logo_uri || "",
		scopes: data.scope.split(/\s+/).filter(Boolean),
		email: data.user.email ?? "",
	};
}, "oauth-consent");

/** Password sign-in for the consent page. Sets the Supabase token cookies but
 *  never mc_owner — OAuth visitors aren't the owner's browser. */
export const oauthLoginAction = action(async (formData: FormData) => {
	"use server";
	const email = String(formData.get("email") || "")
		.trim()
		.toLowerCase();
	const password = String(formData.get("password") || "");
	try {
		const { data, error } = await supabaseAdmin().auth.signInWithPassword({ email, password });
		if (error || !data.session) {
			if (error && /not confirmed|verify your email|invite/i.test(error.message))
				return { error: "Check your invite email to set your password, then sign in." };
			return { error: "Invalid credentials" };
		}
		setCookie("mc-access-token", data.session.access_token, COOKIE_OPTS);
		setCookie("mc-refresh-token", data.session.refresh_token, COOKIE_OPTS);
	} catch (e) {
		// Log infra detail server-side; never surface it to the client.
		console.error("oauth sign-in failed:", e);
		return { error: "Something went wrong. Please try again." };
	}
	revalidate(getConsentQuery.key);
	return { error: null };
}, "oauth-login");

type ConsentDecisionResult = { error?: string; redirectUrl?: string };

async function consentDecision(authorizationId: string, decision: "approve" | "deny"): Promise<ConsentDecisionResult> {
	const supabase = await getAuthedClient();
	if (!supabase) return { error: "Your session expired — sign in again." };
	const { data, error } =
		decision === "approve"
			? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
			: await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
	if (error || !data?.redirect_url)
		return { error: "This sign-in request has expired. Go back to the app and try again." };
	// The URL carries code+state (or error=access_denied for deny) back to the app.
	return { redirectUrl: data.redirect_url };
}

export const approveConsentAction = action(async (formData: FormData) => {
	"use server";
	return consentDecision(String(formData.get("authorization_id") || ""), "approve");
}, "oauth-approve");

export const denyConsentAction = action(async (formData: FormData) => {
	"use server";
	return consentDecision(String(formData.get("authorization_id") || ""), "deny");
}, "oauth-deny");

// ── Admin: manage OAuth client apps (bcw-ada-scanner, interviewer, …) ──
// Source of truth is Supabase Auth, not our Postgres — no drizzle table, no
// registry entry (same stance as auth users; mirrors the api_keys precedent).

export type OAuthApp = {
	clientId: string;
	name: string;
	redirectUris: string[];
	authMethod: string;
	createdAt: string;
};

export const getOAuthAppsQuery = query(async (): Promise<OAuthApp[]> => {
	"use server";
	await requireAdmin();
	const { data, error } = await supabaseService().auth.admin.oauth.listClients();
	if (error) throw new Error(error.message);
	return (data?.clients ?? []).map((c) => ({
		clientId: c.client_id,
		name: c.client_name,
		redirectUris: c.redirect_uris,
		authMethod: c.token_endpoint_auth_method,
		createdAt: c.created_at,
	}));
}, "admin-oauth-apps");

export const createOAuthAppAction = action(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const name = String(formData.get("name") || "").trim();
	const redirectUris = String(formData.get("redirect_uris") || "")
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	const authMethod = String(formData.get("auth_method") || "none");
	if (!name) return { error: "App name is required." };
	if (redirectUris.length === 0) return { error: "Add at least one redirect URI (one per line)." };
	for (const uri of redirectUris) {
		try {
			new URL(uri);
		} catch {
			return { error: `Invalid redirect URI: ${uri}` };
		}
	}
	const { data, error } = await supabaseService().auth.admin.oauth.createClient({
		client_name: name,
		redirect_uris: redirectUris,
		token_endpoint_auth_method: authMethod as "none" | "client_secret_basic" | "client_secret_post",
	});
	if (error || !data) return { error: error?.message ?? "Failed to create OAuth app." };
	revalidate(getOAuthAppsQuery.key);
	// client_secret is only ever returned at creation — surface it once
	return { clientId: data.client_id, clientSecret: data.client_secret ?? null };
}, "create-oauth-app");

export const deleteOAuthAppAction = action(async (formData: FormData) => {
	"use server";
	await requireAdmin();
	const clientId = String(formData.get("client_id") || "");
	if (!clientId) return { error: "Missing client_id." };
	const { error } = await supabaseService().auth.admin.oauth.deleteClient(clientId);
	if (error) return { error: error.message };
	revalidate(getOAuthAppsQuery.key);
	return { success: "App deleted." };
}, "delete-oauth-app");
