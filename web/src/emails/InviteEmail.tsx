// Basalt client-portal invite — GoTrue template. Rendered to
// supabase/templates/invite-email.html by `bun run emails:build`; the
// {{ .ConfirmationURL }} placeholder is Supabase's and must survive as
// literal text (see EMAIL_PLACEHOLDER asserts in the build script).
import { EmailButton, EmailFallbackLink, EmailFooter, EmailHeading, EmailLayout, EmailLogo, EmailSignoff, EmailText } from "./kit";

export const INVITE_SUBJECT = "You're invited to the Basalt client portal";
export const EMAIL_PLACEHOLDER = "{{ .ConfirmationURL }}";

export default function InviteEmail() {
	return (
		<EmailLayout>
			<EmailLogo />
			<EmailHeading>You're invited</EmailHeading>
			<EmailText>
				I'd like to give you access to your Basalt client portal, where you can track deliverables, watch savings accrue as your old
				SaaS subscriptions are replaced, view documents, and check invoices.
			</EmailText>
			<EmailButton href={EMAIL_PLACEHOLDER}>Accept Invite</EmailButton>
			<EmailFallbackLink href={EMAIL_PLACEHOLDER} />
			<EmailSignoff name="Collin" ps="I read and reply to every email. If you have any questions or run into issues, just reply to this one." />
			<EmailFooter />
		</EmailLayout>
	);
}
