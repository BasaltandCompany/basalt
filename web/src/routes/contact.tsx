// /contact — the first real consumer of the form primitives outside the
// gallery. Posts to the dashboard's /api/contact (Resend deliverable email).
import { createSignal, Show } from "solid-js"
import { DASHBOARD } from "@/lib/dashboard"
import { Page } from "@/components/site"
import { Button } from "@basalt/ui"
import { Input } from "@basalt/ui"
import { Label } from "@basalt/ui"
import { Textarea } from "@basalt/ui"

export default function Contact() {
  const [sending, setSending] = createSignal(false)
  const [done, setDone] = createSignal(false)
  const [error, setError] = createSignal("")

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(e.currentTarget as HTMLFormElement).entries())
    setSending(true)
    setError("")
    const res = await fetch(`${DASHBOARD}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    setSending(false)
    if (res.ok) setDone(true)
    else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? "Something broke. Try again.")
    }
  }

  return (
    <Page
      title="Contact | Basalt & Company"
      description="Start a conversation with Basalt & Company."
    >
      <section class="mx-auto max-w-xl px-6 pb-24 pt-14">
        <h1 class="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">Start a conversation</h1>
        <p class="mt-5 font-sans text-base leading-relaxed text-muted-foreground">
          Tell us what your business is wrestling with. We read everything and reply within a
          couple of days.
        </p>

        <Show
          when={!done()}
          fallback={
            <p class="mt-10 font-serif text-lg leading-relaxed">
              Received. We'll reply shortly. — Collin
            </p>
          }
        >
          <form onSubmit={submit} class="mt-10 space-y-6">
            <div class="absolute -left-[9999px]" aria-hidden="true">
              <label for="website">Website</label>
              <Input id="website" name="website" type="text" tabindex={-1} autocomplete="off" />
            </div>
            <div class="space-y-1.5">
              <Label for="contact-name">Name *</Label>
              <Input id="contact-name" name="name" required autocomplete="name" />
            </div>
            <div class="space-y-1.5">
              <Label for="contact-email">Email *</Label>
              <Input id="contact-email" name="email" type="email" required autocomplete="email" spellcheck={false} />
            </div>
            <div class="space-y-1.5">
              <Label for="contact-message">What's on your mind? *</Label>
              <Textarea id="contact-message" name="message" rows={5} required />
            </div>
            <p class="min-h-5 font-sans text-sm text-destructive" role="alert">
              {error()}
            </p>
            <Button type="submit" size="lg" disabled={sending()}>
              {sending() ? "{ SENDING }" : "{ SEND }"}
            </Button>
          </form>
        </Show>
      </section>
    </Page>
  )
}
