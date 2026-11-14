# Basalt as an auth provider (OAuth 2.1)

Basalt is the identity provider for small apps (bcw-ada-scanner, basalt-interviewer, …).
Users sign in on the hosted Basalt page (`https://basalt.ac/oauth/consent`) with the
same Supabase account pool as the portal and admin. Apps never hold the Supabase
anon key — only a `client_id`.

Under the hood this is **Supabase's OAuth 2.1 server** (authorization code + PKCE,
OIDC discovery, JWKS). Basalt hosts the consent UI; Supabase issues the tokens.

## Endpoints

| Endpoint | URL |
| --- | --- |
| Authorize | `https://<project-ref>.supabase.co/auth/v1/oauth/authorize` |
| Token | `https://<project-ref>.supabase.co/auth/v1/oauth/token` |
| Userinfo | from discovery below |
| JWKS | `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| OIDC discovery | `https://<project-ref>.supabase.co/auth/v1/.well-known/openid-configuration` |

Request scopes `openid email profile` — the ID token / userinfo then carries the
user's `sub`, `email`, `email_verified`, and profile claims.

## Flow (public client — PKCE, no secret)

1. Register the app in Basalt admin (`/admin/oauth`): name + exact redirect URI(s),
   token auth `none` (public). You get a `client_id`.
2. App redirects the user to the authorize endpoint with `response_type=code`,
   `client_id`, `redirect_uri` (exact match), `scope=openid email profile`,
   `state` (random, verify it on callback), and `code_challenge` (S256 of your
   `code_verifier`).
3. Supabase validates and bounces to `https://basalt.ac/oauth/consent?authorization_id=…`
   — the hosted Basalt login page. The user signs in (or continues if already
   signed in) and clicks **Continue**. If the user granted this app before,
   Supabase may skip the consent step entirely and redirect straight back to
   the app with a code — the consent page detects that and auto-continues.
4. Supabase redirects to your `redirect_uri` with `?code=…&state=…`. On cancel
   it redirects with `error=access_denied&state=…`.
5. App exchanges the code server-side (or client-side for SPAs): POST
   `token` with `grant_type=authorization_code`, `code`, `code_verifier`,
   `client_id`, `redirect_uri`.
6. Response: `access_token`, `id_token` (when `openid` requested), `refresh_token`,
   `expires_in`, `scope`. Decode the ID token claims (or call userinfo) for user
   data; `client_id` is also a claim in the access token.
7. Later, refresh with `grant_type=refresh_token`. Or keep your own local session
   (e.g. bcw-ada-scanner's HMAC cookie) and re-run the authorize redirect when the
   access token expires — if the user still has a Basalt session, consent is one
   click.

Token verification: verify the JWT signature against JWKS, `iss` = your project
URL, `exp` not passed, `aud`/`client_id` match. For first-party apps that receive
tokens via a server-side code exchange over HTTPS, decoding without signature
verification is a accepted shortcut — do full JWKS verification if the token ever
crosses a trust boundary.

## Errors

| Error | Meaning |
| --- | --- |
| `access_denied` | User clicked Cancel on the consent page |
| `invalid_grant` | Code expired (10 min) / already used / wrong `code_verifier` |
| `invalid_request` | Missing/invalid parameter |
| `unauthorized_client` | `client_id` wrong or client not allowed this grant |
| `unsupported_redirect_uri` | URI not registered exactly |

## Copy-paste client (Bun / Node 18+, ~50 lines)

```ts
// basalt-auth.ts — drop-in for small apps; only needs BASALT_CLIENT_ID.
const AUTH = process.env.SUPABASE_URL!; // public project URL, not a secret
const CLIENT_ID = process.env.BASALT_CLIENT_ID!;
const REDIRECT_URI = `${process.env.PUBLIC_URL}/auth/callback`;
const SCOPES = "openid email profile";

export type BasaltUser = { sub: string; email: string; name?: string };

const b64url = (b: ArrayBuffer) =>
	btoa(String.fromCharCode(...new Uint8Array(b)))
		.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = (s: string) => b64url(crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// Per sign-in: build the redirect URL + stash the verifier (cookie/session).
export async function startLogin() {
	const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer);
	const state = b64url(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
	const url = `${AUTH}/auth/v1/oauth/authorize?${new URLSearchParams({
		response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
		scope: SCOPES, state, code_challenge: await sha256(verifier), code_challenge_method: "S256",
	})}`;
	return { url, verifier, state }; // persist verifier+state server-side per browser
}

// On GET /auth/callback?code=…&state=…: verify state, then:
export async function exchangeCode(code: string, verifier: string): Promise<BasaltUser> {
	const res = await fetch(`${AUTH}/auth/v1/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code", code, code_verifier: verifier,
			client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
		}),
	});
	if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
	const tokens = (await res.json()) as { id_token?: string };
	if (!tokens.id_token) throw new Error("no id_token — request the openid scope");
	const claims = JSON.parse(atob(tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
	return { sub: claims.sub, email: claims.email, name: claims.name };
}

// Later: grant_type=refresh_token&refresh_token=…&client_id=… for new access tokens.
```

Mint your own app session from the returned user (bcw-ada-scanner keeps its
`ada_session` HMAC cookie). Then remove `SUPABASE_ANON_KEY` and the per-app
login form — sign-in now starts with `startLogin()`.

## Operating the provider (Basalt side)

- Register/revoke apps: `/admin/oauth` (list, create, delete; secrets shown once).
- Local dev: `supabase/config.toml` has `[auth.oauth_server] enabled = true` —
  `supabase start` exposes the endpoints on `http://127.0.0.1:54321`.
- Production: enable in Supabase Dashboard → Authentication → OAuth Server, set
  Authorization Path to `/oauth/consent`, and make sure Site URL is
  `https://basalt.ac` (that's where the consent page must live).
- Sign-ins through this flow count as Supabase MAUs.
