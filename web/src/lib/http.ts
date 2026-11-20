// Solid 2 compat shim for @solidjs/start/http's getCookie/setCookie.
// Reads/writes ride the request event: cookies come off the incoming
// Request; writes append Set-Cookie to the outgoing response stub, so they
// survive redirects and streamed responses alike.
import { getRequestEvent, parseCookieHeader, serializeCookie, type RequestEvent, type ResponseStub } from "@solidjs/web";

function event(): RequestEvent & { response: ResponseStub } {
	const e = getRequestEvent();
	if (!e) throw new Error("cookie helper called outside a request event");
	return e as RequestEvent & { response: ResponseStub };
}

export function getCookie(key: string): string | undefined {
	const raw = event().request.headers.get("cookie");
	return raw ? parseCookieHeader(raw)[key] : undefined;
}

export function setCookie(
	key: string,
	value: string,
	opts?: { maxAge?: number; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" },
): void {
	const serialized = serializeCookie(key, value, {
		maxAge: opts?.maxAge,
		path: opts?.path,
		httpOnly: opts?.httpOnly,
		secure: opts?.secure,
		sameSite: opts?.sameSite,
	});
	event().response.headers.append("set-cookie", serialized);
}
