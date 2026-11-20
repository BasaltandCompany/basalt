// Email-safe Solid primitives — the one source of truth for auth/email HTML
// (rendered at build time by scripts/build-emails.ts into supabase/templates/).
// NOT @basaltac/ui: email clients need table layouts + inline styles, so these
// primitives mirror the brand instead of reusing web components. Palette and
// identity match lib/email-signature.ts (Basalt & Company).
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";
const SIGNAL_RED = "#C8102E"; // ponytail: inlined until brand/ (phase 5) ports off solid 1; restore the ~/brand/logo import then

export const BRAND = {
	siteUrl: (process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://basalt.ac") as string,
	logoPath: "/logo-email.png",
	red: SIGNAL_RED,
	ink: "#111111",
	muted: "#6b6455",
	faint: "#8a8375",
	hairline: "#d8d2c4",
	bg: "#f6f6f6",
	serif: "Georgia,'Times New Roman',serif",
	sans: "Arial,Helvetica,sans-serif",
	calendarUrl: "https://cal.com/cpfeifer/info-meeting",
};

/** Full-bleed background → centered 520px white card with ink top/bottom rules. */
export function EmailLayout(props: { children: JSX.Element }) {
	return (
		<html>
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			</head>
			<body style={`margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.sans};`}>
				<table style={`width:100%;border-collapse:collapse;background:${BRAND.bg};padding:48px 24px;`}>
					<tr>
						<td align="center">
							<table style="width:520px;border-collapse:collapse;background:#ffffff;border-top:1px solid #111111;border-bottom:1px solid #111111;">
								{props.children}
							</table>
						</td>
					</tr>
				</table>
			</body>
		</html>
	);
}

/** Hosted logo row (data URIs get stripped by Gmail/Outlook). */
export function EmailLogo() {
	return (
		<tr>
			<td align="center" style="padding:40px 40px 0;">
				<img
					src={`${BRAND.siteUrl}${BRAND.logoPath}`}
					alt="Basalt"
					width="56"
					height="56"
					style="display:block;margin:0 auto;border-radius:2px;"
				/>
			</td>
		</tr>
	);
}

export function EmailHeading(props: { children: JSX.Element }) {
	return (
		<tr>
			<td style={`padding:32px 40px 0;font-family:${BRAND.serif};font-size:24px;line-height:1.2;text-align:center;color:${BRAND.ink};`}>
				{props.children}
			</td>
		</tr>
	);
}

export function EmailText(props: { children: JSX.Element; style?: string }) {
	return (
		<tr>
			<td style={`padding:16px 40px 0;font-family:${BRAND.serif};font-size:15px;line-height:1.5;color:${BRAND.ink};${props.style ?? ""}`}>
				{props.children}
			</td>
		</tr>
	);
}

/** Table-based CTA button — the only reliable clickable pill across clients. */
export function EmailButton(props: { href: string; children: JSX.Element }) {
	return (
		<tr>
			<td align="center" style="padding:32px 40px;">
				<a
					href={props.href}
					style={`display:inline-block;padding:12px 28px;background:${BRAND.red};color:#ffffff;font-family:${BRAND.sans};font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;`}
				>
					{props.children}
				</a>
			</td>
		</tr>
	);
}

/** Paste-link fallback for clients whose email client strips buttons. */
export function EmailFallbackLink(props: { href: string }) {
	return (
		<tr>
			<td style={`padding:0 40px 32px;font-family:${BRAND.serif};font-size:12px;line-height:1.4;color:${BRAND.faint};font-style:italic;text-align:center;`}>
				Or paste this link into your browser:<br />
				<span style="word-break:break-all;color:#999999;">{props.href}</span>
			</td>
		</tr>
	);
}

export function EmailSignoff(props: { name: string; ps?: string }) {
	return (
		<>
			<tr>
				<td style={`padding:0 40px 24px;font-family:${BRAND.serif};font-size:15px;color:${BRAND.ink};`}>
					Best,<br />
					{props.name}
				</td>
			</tr>
			<Show when={props.ps}>
				<tr>
					<td style={`padding:0 40px 32px;font-family:${BRAND.serif};font-size:15px;line-height:1.5;color:${BRAND.ink};`}>
						P.S. {props.ps}
					</td>
				</tr>
			</Show>
		</>
	);
}

export function EmailFooter() {
	return (
		<tr>
			<td style={`padding:24px 40px 32px;border-top:1px solid ${BRAND.hairline};`}>
				<p style={`margin:0;font-size:11px;color:${BRAND.faint};line-height:1.5;font-family:${BRAND.sans};`}>
					Basalt &amp; Company ·{" "}
					<a href="mailto:cpfeifer@basalt.ac" style={`color:${BRAND.faint};text-decoration:none;`}>
						Email
					</a>{" "}
					·{" "}
					<a href={BRAND.calendarUrl} style={`color:${BRAND.faint};text-decoration:none;`}>
						Calendar
					</a>
				</p>
			</td>
		</tr>
	);
}
