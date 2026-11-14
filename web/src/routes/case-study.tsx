// Anonymized case study (public university) — ported from the dashboard's
// marketing route onto the ink theme + library primitives. Copy verbatim;
// FMR vellum css replaced by layout utilities.
import type { JSX } from "solid-js"
import { Page } from "@/components/site"
import { Button } from "@basaltac/ui"
import { Separator } from "@basaltac/ui"

function CaseSection(props: { label: string; children: JSX.Element }) {
  return (
    <section class="mx-auto max-w-6xl px-6 py-16">
      <div class="grid gap-10 md:grid-cols-12">
        <h2 class="font-serif text-4xl leading-tight md:col-span-4">
          The
          <br />
          <em>{props.label}</em>
        </h2>
        <div class="space-y-4 font-sans text-base leading-relaxed text-muted-foreground md:col-span-8">
          {props.children}
        </div>
      </div>
    </section>
  )
}

function Stat(props: { value: string; label: string }) {
  return (
    <div>
      <strong class="font-serif text-3xl">{props.value}</strong>
      <p class="mt-1 font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {props.label}
      </p>
    </div>
  )
}

export default function IuCaseStudy() {
  return (
    <Page
      title="Case Study | Basalt & Company"
      description="How we built an autonomous data engineering agent for a large public university that increased productivity by 45%."
    >
      {/* hero */}
      <section class="mx-auto max-w-6xl px-6 pb-16 pt-10">
        <div class="grid gap-10 md:grid-cols-2 md:items-end">
          <div>
            <p class="font-sans text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Case Study · Data Engineering
            </p>
            <h1 class="mt-4 font-serif text-5xl leading-[1.05] tracking-[-0.01em] md:text-6xl">
              A Public
              <br />
              <em>University</em>
            </h1>
          </div>
          <p class="max-w-md font-sans text-base leading-relaxed text-muted-foreground md:justify-self-end">
            A large public university's data engineering team runs the ticket queue for the whole
            university's data platform. Senior engineers triaged every ticket by hand: read it,
            guess the cause, route it. We built an AI agent that does that first pass for them.
            Over Q2 and Q3, team productivity rose 45%.
          </p>
        </div>
      </section>

      {/* stats */}
      <section class="border-y border-border">
        <div class="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 md:grid-cols-4">
          <Stat value="45%" label="Productivity Increase" />
          <Stat value="MTTR" label="Reduced Significantly" />
          <Stat value="Q2—Q3" label="Measured Impact Period" />
          <Stat value="24/7" label="Agent Uptime" />
        </div>
      </section>

      <CaseSection label="Problem">
        <p>
          A large public university's data engineering team manages a ticket queue for researchers,
          faculty, and staff across the university. As the data platform grew, so did the queue.
        </p>
        <p>
          Every ticket needed a human first pass: read it, figure out what's actually broken,
          decide who fixes it. That work landed on the most senior engineers, and it pulled them
          away from the work only they could do.
        </p>
      </CaseSection>

      <CaseSection label="Fix">
        <p>
          We built an agent that reads every incoming ticket and does the first pass:
          categorizes it, scores priority, identifies the likely root cause from their history
          of past tickets, and routes it to the right engineer with that context attached.
        </p>
        <p>
          It draws on their institutional knowledge base and years of ticket history, so the
          routing matches how the university's own senior engineers would have handled it. And it learns
          from how each ticket gets resolved.
        </p>
      </CaseSection>

      {/* process */}
      <section class="mx-auto max-w-6xl px-6 py-16">
        <h2 class="font-serif text-3xl">How We Built It</h2>
        <Separator class="my-6" />
        <div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["01", "Discovery", "We sat with their ticket data, workflows, and team structure until we knew where the time went."],
            ["02", "Intelligence Layer", "We turned their ticket history, runbooks, and internal docs into a knowledge base the agent could reason over."],
            ["03", "Agent Development", "Then we built the agent around their triage rules: categorize, prioritize, find the likely cause, route."],
            ["04", "Deployment", "It went live incrementally through Q2 and Q3, and we tuned it against real outcomes."],
          ].map(([num, title, body]) => (
            <div>
              <div class="font-serif text-2xl text-signal">{num}</div>
              <h4 class="mt-2 font-serif text-lg">{title}</h4>
              <p class="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <CaseSection label="Results">
        <p>
          Over Q2 and Q3, team productivity rose 45%. Engineers stopped doing manual triage:
          tickets now arrive sorted, prioritized, and already carrying the likely cause and a
          suggested fix.
        </p>
        <p>
          Mean time to resolution dropped because the first pass no longer waits for a senior
          engineer's calendar.
        </p>
      </CaseSection>

      {/* CTA */}
      <section class="mx-auto max-w-2xl px-6 py-24 text-center">
        <h2 class="font-serif text-4xl leading-tight">
          Want this for
          <br />
          <em>your team?</em>
        </h2>
        <p class="mx-auto mt-4 max-w-md font-sans text-base text-muted-foreground">
          Tell us how your business runs. We'll send you a free game plan for where AI pays off
          first, with the prompts and steps to build it yourself.
        </p>
        <Button as="a" href="/gift" class="mt-8" size="lg">
          {"{ CLAIM YOUR GAME PLAN }"}
        </Button>
      </section>
    </Page>
  )
}
