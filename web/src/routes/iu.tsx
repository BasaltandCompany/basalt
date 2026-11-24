// /iu moved to /case-study when the client was anonymized; sent outreach
// emails still link here, so redirect instead of 404ing.
// A thrown redirect("/case-study") SSRs as a 500 on the prod server (the
// thrown Response never becomes a 302), so this is a native meta refresh
// page — renders 200 and follows to /case-study in the browser.
import { Meta, Title } from "@solidjs/meta"

export default function IuRedirect() {
	return (
		<main class="mx-auto max-w-3xl px-6 pb-24 pt-14">
			<Title>Redirecting… | Basalt &amp; Company</Title>
			<Meta http-equiv="refresh" content="0;url=/case-study" />
			<p>
				This page moved. <a href="/case-study">Read the case study</a>.
			</p>
		</main>
	)
}
