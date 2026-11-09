// /gift — the ONE lead magnet: "3 months of Claude, free ($60 value)."
// The problem it solves: AI-curious owners with no way in. They give their
// info, Collin sends the Claude gift manually (email alert), and real usage
// teaches them where AI goes slow and dumb without setup — that's the Basalt
// conversation. Posts to /api/gift-request (same-origin today; CORS makes it
// survive the domain flip).
import { DASHBOARD } from "@/lib/dashboard"
import { createSignal, Show } from "solid-js"
import { Page } from "@/components/site"
import { Button } from "@basalt/ui"
import { Input } from "@basalt/ui"
import { Label } from "@basalt/ui"
import { Textarea } from "@basalt/ui"

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
		const res = await fetch(`${DASHBOARD}/api/gift-request`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		})
		setSending(false)
		if (res.ok) {
			window.posthog?.capture("gift_viewed", { ref: data.ref })
			setDone(true)
		} else {
			const body = (await res.json().catch(() => ({}))) as { error?: string }
			setError(body.error ?? "Something broke — try again.")
		}
	}

	return (
		<Page
			title="Get 3 Months of Claude, Free | Basalt & Company"
			description="Claim 3 months of Claude free ($60 value). The fastest way to feel where AI actually helps your business, and where it goes slow without the right setup."
		>
			<section class="mx-auto max-w-2xl px-6 pb-24 pt-10">
				<h1 class="font-serif text-4xl leading-tight md:text-5xl">
					3 months of Claude, <em>free</em>.
				</h1>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					A $60 value, no strings. Most owners are AI-curious with no way in — this is the way in.
					Use it on your real work. And when you notice it going slow, cluttered, and dumb again
					because nothing around it is set up right… that's the problem we solve for a living.
				</p>

				<Show
					when={!done()}
					fallback={
						<p class="mt-10 font-serif text-lg leading-relaxed">
							You're in. I'll email your Claude gift within a day. — Collin
						</p>
					}
				>
					<form
						onSubmit={submit}
						class="mt-10 space-y-6"
						noValidate={false}
						onFocusIn={() => {
							if (!formStarted) {
								formStarted = true
								window.posthog?.capture("gift_form_start")
							}
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

						<p class="min-h-5 font-sans text-sm text-destructive" role="alert">
							{error()}
						</p>
						<Button type="submit" size="lg" disabled={sending()}>
							{sending() ? "{ SENDING }" : "{ CLAIM MY CLAUDE GIFT }"}
						</Button>
					</form>
				</Show>
			</section>
		</Page>
	)
}
