// /brain — the ONE lead magnet: "answer a few questions about your company,
// get your Company Brain Blueprint instantly" — the test renders the blueprint
// on screen from the POST response (no wait), the DIY guide gives away the
// build recipe, and the CTAs are help (email) or done-for-you install (cal).
// Free-brain-build stays as the middle promise. Posts to the dashboard's
// /api/brain-request (same-origin today; CORS makes it survive the domain flip).
import type { JSX } from "solid-js"
import { DASHBOARD } from "@/lib/dashboard"
import { createSignal, For, Show } from "solid-js"
import { Page } from "@/components/site"
import { Button } from "@basalt/ui"
import { Input } from "@basalt/ui"
import { Label } from "@basalt/ui"
import { Textarea } from "@basalt/ui"
import { Select,
  SelectContent,
  SelectHiddenSelect,
  SelectItem,
  SelectTrigger,
  SelectValue, } from "@basalt/ui"
import type { Blueprint } from "~/lib/blueprint"

const STACK_OPTIONS = ["Microsoft 365", "Google Workspace", "Slack", "Line-of-business tools", "Not sure"]
const CAL_LINK = "https://cal.com/cpfeifer/info-meeting"
const DIY_URL = "/company-brain-diy.md"
const HELP_EMAIL = "cpfeifer@basalt.ac"

function Field(props: { id: string; label: string; required?: boolean; children: JSX.Element }) {
  return (
    <div class="space-y-1.5">
      <Label for={props.id}>
        {props.label}
        {props.required ? " *" : ""}
      </Label>
      {props.children}
    </div>
  )
}

// Kobalte Select needs its option list up front; HiddenSelect keeps
// new FormData(form) working (the form serializes it like a native select).
function SelectField(props: {
  id: string
  label: string
  name: string
  options: string[]
  value: () => string
  onChange: (v: string) => void
}) {
  return (
    <Field id={props.id} label={props.label}>
      <Select
        options={props.options}
        value={props.value() || null}
        onChange={(v) => props.onChange(v ?? "")}
        placeholder="Select…"
        itemComponent={(p) => <SelectItem item={p.item}>{p.item.rawValue}</SelectItem>}
        class="w-full"
      >
        <SelectHiddenSelect name={props.name} id={props.id} />
        <SelectTrigger id={props.id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent />
      </Select>
    </Field>
  )
}

export default function BrainLanding() {
  const [headcount, setHeadcount] = createSignal("")
  const [techTeam, setTechTeam] = createSignal("")
  const [heardAbout, setHeardAbout] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [done, setDone] = createSignal(false)
  const [error, setError] = createSignal("")
  const [blueprint, setBlueprint] = createSignal<Blueprint | null>(null)
  const [diyMd, setDiyMd] = createSignal("")
  const [copied, setCopied] = createSignal(false)
  let formStarted = false

  const submit = async (e: SubmitEvent) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    const fd = new FormData(form)
    const data = Object.fromEntries(fd.entries()) as Record<string, string>
    data.stack = fd.getAll("stack") as unknown as string // checkboxes → array
    // issue attribution — issue CTAs link here with ?ref=<docId>
    data.ref = new URLSearchParams(window.location.search).get("ref") ?? ""
    window.posthog?.capture("brain_submit", { ref: data.ref, stack: data.stack, headcount: data.headcount })
    setSending(true)
    setError("")
    const res = await fetch(`${DASHBOARD}/api/brain-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    setSending(false)
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { blueprint?: Blueprint }
      setBlueprint(body.blueprint ?? null)
      window.posthog?.capture("blueprint_viewed", { ref: data.ref })
      fetch(DIY_URL)
        .then((r) => (r.ok ? r.text() : ""))
        .then(setDiyMd)
        .catch(() => setDiyMd(""))
      setDone(true)
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? "Something broke — try again.")
    }
  }

  const copyDiy = async () => {
    try {
      await navigator.clipboard.writeText(diyMd())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the download link below still works */
    }
  }

  const bp = () => blueprint()

  return (
    <Page
      title="Get Your Company Brain Blueprint | Basalt & Company"
      description="Answer a few questions about your company and get your Company Brain Blueprint instantly: your connectors, your first workflows, your 30-day picture — plus the complete recipe to build it yourself."
    >
      <section class="mx-auto max-w-2xl px-6 pb-24 pt-10">
        <h1 class="font-serif text-4xl leading-tight md:text-5xl">
          What would an AI brain do inside <em>your</em> company?
        </h1>
        <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
          Answer below — three minutes. Your <strong>Company Brain Blueprint</strong> renders instantly:
          the exact connectors for your stack, the first three workflows for your industry, and your
          30-day picture. Then, if you want, the complete recipe to build it yourself — or I'll build it
          with your team, free.
        </p>

        <Show
          when={!done()}
          fallback={
            <div class="mt-10 space-y-10">
              {/* ── The Blueprint ─────────────────────────────────── */}
              <Show when={bp()}>
                <div class="rounded-lg border border-border bg-card p-6">
                  <h2 class="font-serif text-2xl leading-tight">{bp()!.tagline}</h2>

                  <h3 class="mt-6 font-sans text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    What it ingests
                  </h3>
                  <ul class="mt-3 space-y-2">
                    <For each={bp()!.connectors}>
                      {(c) => (
                        <li class="font-sans text-sm leading-relaxed">
                          <strong>{c.name}</strong> — {c.whatItGives}
                        </li>
                      )}
                    </For>
                  </ul>

                  <h3 class="mt-6 font-sans text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Your first three workflows
                  </h3>
                  <ul class="mt-3 space-y-2">
                    <For each={bp()!.workflows}>
                      {(w) => (
                        <li class="font-sans text-sm leading-relaxed">
                          <strong>{w.name}</strong> — {w.whatHappens}
                        </li>
                      )}
                    </For>
                  </ul>

                  <h3 class="mt-6 font-sans text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Your 30-day picture
                  </h3>
                  <p class="mt-3 font-sans text-sm leading-relaxed">{bp()!.timeline.free}</p>
                  <p class="mt-2 font-sans text-sm leading-relaxed">{bp()!.timeline.install}</p>
                </div>
              </Show>

              {/* ── Urgency: the cost of waiting ───────────────────── */}
              <div class="border-l-2 border-border pl-5">
                <p class="font-serif text-lg leading-relaxed">
                  Every month this waits, the gap compounds. The businesses I've worked with tripled
                  revenue per work hour and grew market share while competitors stood still — AI-native
                  companies do more with less, and the ones who wait are competing against that.
                </p>
              </div>

              {/* ── DIY guide: the recipe, given away ───────────────── */}
              <div>
                <h2 class="font-serif text-2xl leading-tight">
                  Build it yourself — the complete recipe
                </h2>
                <p class="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
                  Everything we do on an install, as one markdown file. Hand it to your own AI agent
                  (Claude Code, Copilot, Cursor) and it can build the whole thing with your team.
                </p>
                <div class="mt-4 flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyDiy}
                    data-ph-event="diy_copy"
                    disabled={!diyMd()}
                  >
                    {copied() ? "{ COPIED }" : "{ COPY THE RECIPE }"}
                  </Button>
                  <Button as="a" variant="outline" size="sm" href={DIY_URL} download="company-brain-diy.md" data-ph-event="diy_download">
                    { "{ DOWNLOAD .MD }" }
                  </Button>
                </div>
                <details class="mt-4">
                  <summary class="cursor-pointer font-sans text-sm text-muted-foreground">
                    Read it here instead
                  </summary>
                  <pre class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
                    {diyMd() || "Loading…"}
                  </pre>
                </details>
              </div>

              {/* ── CTAs ───────────────────────────────────────────── */}
              <div class="space-y-4">
                <h2 class="font-serif text-2xl leading-tight">Want it done for you?</h2>
                <p class="font-sans text-sm leading-relaxed text-muted-foreground">
                  I install one company brain a month, free — connectors wired into your Microsoft or
                  Google, your team trained, first workflow live in week one. Hit a wall building it
                  yourself instead? Email me, I'll get you unstuck — also free.
                </p>
                <div class="flex flex-wrap gap-3">
                  <Button as="a" size="lg" href={CAL_LINK} target="_blank">
                    { "{ BOOK YOUR INSTALL }" }
                  </Button>
                  <Button as="a" variant="outline" size="lg" href={`mailto:${HELP_EMAIL}`}>
                    { "{ GET HELP FREE }" }
                  </Button>
                </div>
                <p class="font-serif text-sm italic text-muted-foreground">
                  Your free brain build is still coming, too — in the order requests arrived.
                </p>
              </div>
            </div>
          }
        >
          <form
            onSubmit={submit}
            class="mt-10 space-y-6"
            noValidate={false}
            onFocusIn={() => {
              if (!formStarted) {
                formStarted = true
                window.posthog?.capture("brain_form_start")
              }
            }}
          >
            {/* honeypot — hidden from humans, bots fill it and get a silent ok */}
            <div class="absolute -left-[9999px]" aria-hidden="true">
              <label for="website">Website</label>
              <Input id="website" name="website" type="text" tabindex={-1} autocomplete="off" />
            </div>

            <div class="grid gap-6 sm:grid-cols-2">
              <Field id="brain-name" label="Full name" required>
                <Input id="brain-name" name="name" type="text" required autocomplete="name" />
              </Field>
              <Field id="brain-email" label="Work email" required>
                <Input
                  id="brain-email"
                  name="email"
                  type="email"
                  required
                  autocomplete="email"
                  spellcheck={false}
                />
              </Field>
              <Field id="brain-title" label="Job title">
                <Input id="brain-title" name="jobTitle" type="text" autocomplete="organization-title" />
              </Field>
              <Field id="brain-company" label="Company name" required>
                <Input id="brain-company" name="company" type="text" required autocomplete="organization" />
              </Field>
              <Field id="brain-industry" label="Industry">
                <Input id="brain-industry" name="industry" type="text" />
              </Field>
              <SelectField
                id="brain-headcount"
                label="Company size"
                name="headcount"
                options={["Just me", "2–5", "6–10", "11–25", "26–50", "50+"]}
                value={headcount}
                onChange={setHeadcount}
              />
            </div>

            <Field id="brain-what" label="What does your company do?">
              <Textarea id="brain-what" name="whatTheyDo" rows={2} />
            </Field>

            <SelectField
              id="brain-tech"
              label="How big is your technical team?"
              name="techTeam"
              options={["None", "1–3", "4–10", "10+"]}
              value={techTeam}
              onChange={setTechTeam}
            />

            {/* stack checkboxes drive the blueprint's connector mapping */}
            <fieldset class="space-y-2">
              <legend class="text-sm font-medium">What does your company run on? (check all that apply)</legend>
              <div class="grid gap-2 sm:grid-cols-2">
                <For each={STACK_OPTIONS}>
                  {(opt) => (
                    <label class="flex items-center gap-2 font-sans text-sm">
                      <input type="checkbox" name="stack" value={opt} class="size-4 accent-current" />
                      {opt}
                    </label>
                  )}
                </For>
              </div>
            </fieldset>

            <Field id="brain-bottleneck" label="What's the biggest bottleneck in the business right now?">
              <Textarea id="brain-bottleneck" name="bottleneck" rows={3} />
            </Field>

            <SelectField
              id="brain-heard"
              label="How did you hear about us?"
              name="heardAbout"
              options={["LinkedIn post", "The Cactus Dispatch newsletter", "Referral", "Other"]}
              value={heardAbout}
              onChange={setHeardAbout}
            />

            <p class="min-h-5 font-sans text-sm text-destructive" role="alert">
              {error()}
            </p>
            <Button type="submit" size="lg" disabled={sending()}>
              {sending() ? "{ BUILDING YOUR BLUEPRINT }" : "{ GET MY BLUEPRINT }"}
            </Button>
          </form>
        </Show>
      </section>
    </Page>
  )
}
