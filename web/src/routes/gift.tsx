// /gift — the ONE lead magnet: the free AI game plan. The problem it solves:
// AI-curious owners with no way in. They tell us what the business does and
// where work piles up; Collin reads it and sends a game plan manually (email
// alert): where AI pays off first, step-by-step how, the exact prompts and
// templates, plus 3 months of Claude. Real usage teaches them where AI goes
// slow and dumb without setup — that's the Basalt conversation. Posts to
// /api/gift-request (same-origin today; CORS makes it survive the domain flip).
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
			setError(body.error ?? "Something broke. Try again.")
		}
	}

	return (
		<Page
			title="Your AI Game Plan, Free | Basalt & Company"
			description="Tell us how your business runs. Collin sends back a free game plan: where AI pays off first, how to build it step by step, the exact prompts, and 3 months of Claude to run it."
		>
			<section class="mx-auto max-w-2xl px-6 pb-24 pt-10">
				<h1 class="font-serif text-4xl leading-tight md:text-5xl">
					Your AI game plan, <em>free</em>.
				</h1>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					Tell us what your business does and where the work piles up. Collin reads it
					and sends back your game plan:
				</p>
				<ul class="mt-4 list-disc space-y-3 pl-5 font-sans text-base leading-relaxed text-muted-foreground">
					<li>
						<strong class="font-medium text-foreground">Where to start.</strong> The two or
						three places AI pays off fastest in a business like yours (the inbox that eats
						your afternoons, the follow-ups nobody has time to send, the answers stuck in
						your head).
					</li>
					<li>
						<strong class="font-medium text-foreground">How to build it.</strong> Step by
						step, with the exact prompts and the templates, written so your team can run
						it without hiring anyone.
					</li>
					<li>
						<strong class="font-medium text-foreground">The subscription.</strong> 3 months
						of Claude, on us, so you can start the day it arrives.
					</li>
				</ul>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					No strings. If you'd rather we build it for you, we can talk about that too.
					If not, the plan is yours to keep.
				</p>

				<Show
					when={!done()}
					fallback={
						<p class="mt-10 font-serif text-lg leading-relaxed">
								You're in. I'll read what you sent and send your game plan within a couple of days. — Collin
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

					<div class="space-y-6">
						<Field id="gift-about" label="What does your business do?" required>
							<Textarea id="gift-about" name="about" rows={3} required />
						</Field>
						<Field id="gift-bottleneck" label="Where does work pile up or slow down?">
							<Textarea id="gift-bottleneck" name="bottleneck" rows={3} />
						</Field>
					</div>

						<p class="min-h-5 font-sans text-sm text-destructive" role="alert">
							{error()}
						</p>
						<Button type="submit" size="lg" disabled={sending()}>
							{sending() ? "{ SENDING }" : "{ CLAIM MY GAME PLAN }"}
						</Button>
					</form>
				</Show>
			</section>
		</Page>
	)
}
