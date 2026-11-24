// /gift — applications for a free 12-week workflow pilot.
// Posts to the existing request pipeline; applications do not guarantee a slot.
import { DASHBOARD } from "@/lib/dashboard"
import { createSignal, Show } from "solid-js"
import { Page } from "@/components/site"
import { Button } from "@basaltac/ui"
import { Input } from "@basaltac/ui"
import { Label } from "@basaltac/ui"
import { Textarea } from "@basaltac/ui"

function Field(props: { id: string; label: string; required?: boolean; children: unknown }) {
	return (
		<div class="space-y-1.5">
			<Label for={props.id}>
				{props.label}
				{props.required ? " *" : ""}
			</Label>
			{props.children as never}
		</div>
	)
}

export default function GiftLanding() {
	const [sending, setSending] = createSignal(false)
	const [done, setDone] = createSignal(false)
	const [error, setError] = createSignal("")
	let formStarted = false

	const submit = async (e: SubmitEvent) => {
		e.preventDefault()
		const form = e.currentTarget as HTMLFormElement
		const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>
		// issue attribution — issue CTAs link here with ?ref=<docId>
		data.ref = new URLSearchParams(window.location.search).get("ref") ?? ""
		window.posthog?.capture("gift_submit", { ref: data.ref, heardAbout: data.heardAbout })
		setSending(true)
		setError("")
		try {
			const res = await fetch(`${DASHBOARD}/api/gift-request`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			})
			if (res.ok) {
				window.posthog?.capture("gift_viewed", { ref: data.ref })
				setDone(true)
			} else {
				const body = (await res.json().catch(() => ({}))) as { error?: string }
				setError(body.error ?? "Something broke. Try again.")
			}
		} catch {
			setError("Could not send your request. Please try again.")
		} finally {
			setSending(false)
		}
	}

	return (
		<Page
			title="Free AI Workflow Pilot | Basalt & Company"
			description="Apply for a free 12-week pilot. Basalt finds where AI can do the most work for your business, builds a working trial, and hands it over to your team."
		>
			<section class="mx-auto max-w-2xl px-6 pb-24 pt-10">
				<h1 class="font-serif text-4xl leading-tight md:text-5xl">
					Apply for a free 12-week AI pilot
				</h1>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					We'll find where AI could do the most work for your business, build a working trial,
					and hand it over so your team can easily operate it.
				</p>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					We accept two companies at a time. Each pilot covers one workflow and up to two hours of my time per week.
					Applying doesn't reserve a slot. If selected, we'll agree on the scope and any outside software costs before we start.
				</p>

				<Show
					when={!done()}
					fallback={
						<p class="mt-10 font-serif text-lg leading-relaxed">
							I'll read your request and reply personally within a couple of days. Applying does not reserve a pilot slot. — Collin
						</p>
					}
				>
					<form
						onSubmit={submit}
						class="mt-10 space-y-6"
						novalidate={false}
						ref={(el) => {
							// focusin isn't in solid's event map — attach natively.
							el.addEventListener("focusin", () => {
								if (!formStarted) {
									formStarted = true;
									window.posthog?.capture("gift_form_start");
								}
							});
						}}
					>
						{/* honeypot — hidden from humans, bots fill it and get a silent ok */}
						<div class="absolute -left-[9999px]" aria-hidden="true">
							<label for="website">Website</label>
							<Input id="website" name="website" type="text" tabindex={-1} autocomplete="off" />
						</div>

						<div class="grid gap-6 sm:grid-cols-2">
							<Field id="gift-name" label="Full name" required>
								<Input id="gift-name" name="name" type="text" required autocomplete="name" />
							</Field>
							<Field id="gift-email" label="Work email" required>
								<Input
									id="gift-email"
									name="email"
									type="email"
									required
									autocomplete="email"
									spellcheck={false}
								/>
							</Field>
							<Field id="gift-title" label="Job title">
								<Input id="gift-title" name="jobTitle" type="text" autocomplete="organization-title" />
							</Field>
							<Field id="gift-company" label="Company name" required>
								<Input id="gift-company" name="company" type="text" required autocomplete="organization" />
							</Field>
							<Field id="gift-phone" label="Phone number">
								<Input id="gift-phone" name="phone" type="tel" autocomplete="tel" />
							</Field>
							<Field id="gift-heard" label="How did you hear about us?">
								<Input id="gift-heard" name="heardAbout" type="text" />
							</Field>
						</div>
						<Field id="gift-industry" label="Industry" required>
							<Input id="gift-industry" name="industry" required />
						</Field>

						<Field id="gift-tech" label="Who handles technology and software at your company?" required>
							<Textarea id="gift-tech" name="techFootprint" rows={2} required placeholder="Team size, tools you use, and any outside help" />
						</Field>
						<div class="space-y-6">
							<Field id="gift-about" label="What does your business do?" required>
								<Textarea id="gift-about" name="about" rows={3} required />
							</Field>
							<Field id="gift-workflow" label="Where does work pile up? (If you're unsure, we'll find it together.)">
								<Textarea id="gift-workflow" name="workflow" rows={3} />
							</Field>
						</div>
						<label class="flex items-start gap-2"><input type="checkbox" name="contactConsent" value="yes" required /> Basalt &amp; Company may contact me about this application. *</label>

						<p class="min-h-5 font-sans text-sm text-destructive" role="alert">
							{error()}
						</p>
						<Button type="submit" size="lg" disabled={sending()}>
							{sending() ? "{ SENDING }" : "{ SEND MY REQUEST }"}
						</Button>
					</form>
				</Show>
			</section>
		</Page>
	)
}
