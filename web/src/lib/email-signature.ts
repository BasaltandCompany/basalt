// Email signatures appended at send time (see docs/email-footer.html for the
// design reference). Two variants: `full` for regular 1:1 email, `plain` for
// cold outreach. The logo is hosted (not a data URI) because Gmail and
// Outlook strip data-URI images from received mail.
const siteUrl = () => process.env.PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://basalt.ac";

const DISCLAIMER =
	"This email and any attachments are confidential and intended solely for the use of the individual or entity to whom they are addressed. If you received it in error, please notify the sender and delete your copy. Any views or opinions expressed are solely those of the author and do not necessarily represent those of Basalt & Company.";

// Outbound identity: every app-sent email carries these. From is honored by
// Gmail only while cpfeifer@basalt.ac is configured as a "Send mail as"
// alias of the connected account (Gmail rewrites it to the account's real
// address otherwise); Reply-To applies regardless.
export const FROM_ADDRESS = 'Collin Pfeifer <cpfeifer@basalt.ac>';
export const REPLY_TO = "cpfeifer@basalt.ac";

export const SIGNATURES: Record<"full" | "plain", { html: string; plain: string }> = {
	full: {
		html: `<div style="margin-top:24px;">
<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;border-collapse:collapse;">
<tr><td style="padding:0;">
<img src="${siteUrl()}/logo-email.png" width="48" height="48" alt="Basalt" style="display:block;width:48px;height:48px;border-radius:2px;" />
<div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;font-weight:bold;color:#111111;margin-top:12px;">Collin Pfeifer</div>
<div style="font-size:12px;color:#6b6455;margin-top:3px;">Technology &middot; <a href="https://basalt.ac" style="color:#6b6455;text-decoration:underline;">Basalt &amp; Company</a></div>
<div style="font-size:12px;color:#6b6455;margin-top:3px;">cpfeifer@basalt.ac &middot; (317) 995-5114</div>
<hr style="border:none;border-top:1px solid #d8d2c4;margin:12px 0 10px;" />
<div style="font-size:11px;color:#8a8375;line-height:1.5;max-width:480px;">${DISCLAIMER}</div>
</td></tr>
</table>
</div>`,
		plain: `-- \nCollin Pfeifer\nTechnology \u00b7 Basalt & Company\ncpfeifer@basalt.ac \u00b7 (317) 995-5114\n\n${DISCLAIMER}`,
	},
	plain: {
		html: `<div style="margin-top:24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6b6455;">Collin</div>`,
		plain: `-- \nCollin`,
	},
};

/** Escape a plain-text email body for the HTML part: & < > escaped, line breaks kept. */
export function escapeBodyHtml(body: string): string {
	return body
		.replace(/\r\n/g, "\n")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\n/g, "<br>");
}
