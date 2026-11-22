// Runtime email HTML for client notifications — string-rendered like
// publish-core's issue emails. Deliberately NOT importing emails/kit.tsx:
// it's Solid JSX, which bun test can't evaluate outside vite. The palette
// mirrors the kit; kit itself inlines SIGNAL_RED for the same reason.
export const SITE_URL = (process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://basalt.ac") as string;

const BRAND = {
	red: "#C8102E",
	ink: "#111111",
	muted: "#6b6455",
	faint: "#8a8375",
	hairline: "#d8d2c4",
	bg: "#f6f6f6",
	serif: "Georgia,'Times New Roman',serif",
	sans: "Arial,Helvetica,sans-serif",
	logo: `${SITE_URL}/logo-email.png`,
	calendarUrl: "https://cal.com/cpfeifer/info-meeting",
};

const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(inner: string): string {
	return [
		`<html>`,
		`<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>`,
		`<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BRAND.sans};">`,
		`<table style="width:100%;border-collapse:collapse;background:${BRAND.bg};padding:48px 24px;"><tr><td align="center">`,
		`<table style="width:520px;border-collapse:collapse;background:#ffffff;border-top:1px solid #111111;border-bottom:1px solid #111111;">`,
		inner,
		`</table>`,
		`</td></tr></table>`,
		`</body></html>`,
	].join("");
}

const logo = `<tr><td align="center" style="padding:40px 40px 0;"><img src="${BRAND.logo}" alt="Basalt" width="56" height="56" style="display:block;margin:0 auto;border-radius:2px;" /></td></tr>`;
const heading = (text: string) =>
	`<tr><td style="padding:32px 40px 0;font-family:${BRAND.serif};font-size:24px;line-height:1.2;text-align:center;color:${BRAND.ink};">${text}</td></tr>`;
const text = (html: string, style = "") =>
	`<tr><td style="padding:16px 40px 0;font-family:${BRAND.serif};font-size:15px;line-height:1.5;color:${BRAND.ink};${style}">${html}</td></tr>`;
const button = (href: string, label: string) =>
	`<tr><td align="center" style="padding:32px 40px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 28px;background:${BRAND.red};color:#ffffff;font-family:${BRAND.sans};font-size:13px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;">${label}</a></td></tr>`;
const fallbackLink = (href: string) =>
	`<tr><td style="padding:0 40px 32px;font-family:${BRAND.serif};font-size:12px;line-height:1.4;color:${BRAND.faint};font-style:italic;text-align:center;">Or paste this link into your browser:<br /><span style="word-break:break-all;color:#999999;">${esc(href)}</span></td></tr>`;
const signoff = (ps: string) =>
	`<tr><td style="padding:0 40px 24px;font-family:${BRAND.serif};font-size:15px;color:${BRAND.ink};">Best,<br />Collin</td></tr>` +
	`<tr><td style="padding:0 40px 32px;font-family:${BRAND.serif};font-size:15px;line-height:1.5;color:${BRAND.ink};">P.S. ${ps}</td></tr>`;
const footer = `<tr><td style="padding:24px 40px 32px;border-top:1px solid ${BRAND.hairline};"><p style="margin:0;font-size:11px;color:${BRAND.faint};line-height:1.5;font-family:${BRAND.sans};">Basalt &amp; Company &middot; <a href="mailto:cpfeifer@basalt.ac" style="color:${BRAND.faint};text-decoration:none;">Email</a> &middot; <a href="${BRAND.calendarUrl}" style="color:${BRAND.faint};text-decoration:none;">Calendar</a></p></td></tr>`;

/** Status-update broadcast: preview + this-week digest + portal CTA. */
export function renderStatusUpdateEmail(props: {
	heading: string;
	projectName: string;
	preview: string;
	digest?: string | null;
	portalUrl: string;
}): string {
	const inner =
		logo +
		heading(esc(props.heading)) +
		text(`An update on ${esc(props.projectName)}`, `font-family:${BRAND.sans};font-size:13px;color:${BRAND.faint};`) +
		text(esc(props.preview).replace(/\n/g, "<br />")) +
		(props.digest
			? text(esc(props.digest), `font-family:${BRAND.sans};font-size:13px;color:${BRAND.muted};font-style:italic;border-top:1px solid ${BRAND.hairline};`)
			: "") +
		button(props.portalUrl, "Read the full update") +
		fallbackLink(props.portalUrl) +
		signoff("Reply with any questions — I read every reply.") +
		footer;
	return layout(inner);
}

/** Quote ready-for-review: title, total, line counts, review-and-sign CTA. */
export function renderQuoteReadyEmail(props: {
	title: string;
	company: string;
	total: string;
	lines: string;
	quoteUrl: string;
}): string {
	const inner =
		logo +
		heading("A new quote is ready for your review") +
		text(
			`<b>${esc(props.title)}</b> for ${esc(props.company)} — ${esc(props.total)} (${esc(props.lines)}) is ready to review and sign in your Basalt portal.`,
		) +
		button(props.quoteUrl, "Review &amp; sign") +
		fallbackLink(props.quoteUrl) +
		signoff("Reply with any questions — I read every reply.") +
		footer;
	return layout(inner);
}
