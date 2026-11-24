import { createSignal, For } from "solid-js"
import { Page } from "@/components/site"
import { Button } from "@basaltac/ui"
import { Separator } from "@basaltac/ui"

// Monthly activity from the OmniSOC repository export (~/Downloads/omnisoc-commits).
// "prs" counts PRs by merge month; "commits" by commit month. The cut marks the
// Apr 30, 2026 agent-harness install. These measure Collin's contributions.
const MONTHS = ["2024-02", "2024-03", "2024-04", "2024-05", "2024-06", "2024-07", "2024-08", "2024-09", "2024-10", "2024-11", "2024-12", "2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]
const COMMITS = [8, 1, 2, 0, 0, 0, 0, 0, 0, 7, 22, 23, 17, 33, 15, 27, 18, 10, 13, 27, 17, 14, 6, 14, 8, 8, 5, 15, 7, 2, 18, 97, 16, 10]
const MERGED = [2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 3, 3, 11, 5, 11, 8, 5, 6, 10, 8, 7, 3, 5, 4, 5, 2, 7, 4, 1, 9, 17, 10, 7]
const CUT_INDEX = MONTHS.indexOf("2026-04")

const SERIES = {
  commits: { label: "Commits", data: COMMITS, perWeekBefore: 2.5, perWeekAfter: 5.6 },
  merged: { label: "Merged PRs", data: MERGED, perWeekBefore: 0.9, perWeekAfter: 1.9 },
} as const
type SeriesKey = keyof typeof SERIES

function monthLabel(m: string) {
  const [y, mo] = m.split("-")
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${names[Number(mo) - 1]} ${y}`
}

function CaseSection(props: { label: string; title: string; children: import("@solidjs/web").JSX.Element }) {
  return (
    <section class="mx-auto max-w-6xl px-6 py-20 md:py-28">
      <p class="font-sans text-xs uppercase tracking-[0.2em] text-signal">{props.label}</p>
      <h2 class="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">{props.title}</h2>
      <div class="mt-8">{props.children}</div>
    </section>
  )
}

export default function OmniSocCaseStudy() {
  const [series, setSeries] = createSignal<SeriesKey>("merged")
  const s = () => SERIES[series()]
  const max = () => Math.max(...s().data)
  const preTotal = () => s().data.slice(0, CUT_INDEX).reduce((a, b) => a + b, 0)
  const postTotal = () => s().data.slice(CUT_INDEX).reduce((a, b) => a + b, 0)

  return (
    <Page
      title="OmniSOC & REN-ISAC at Indiana University | Case Study | Basalt & Company"
      description="How a four-person engineering team at Indiana University's OmniSOC more than doubled merged PRs per week with a safely sandboxed AI agent harness for on-prem systems."
    >
      <article class="text-foreground">
        {/* hero */}
        <header class="mx-auto grid min-h-[70svh] max-w-6xl content-center gap-10 px-6 pb-20 pt-16 lg:grid-cols-[1.6fr_1fr] lg:items-end">
          <div>
            <p class="font-sans text-xs uppercase tracking-[0.25em] text-signal">Case study / OmniSOC + REN-ISAC · Indiana University</p>
            <h1 class="mt-8 font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              A four-person team.
              <br />
              Twice the <em>merged PRs</em>.
            </h1>
          </div>
          <p class="max-w-md font-sans text-base leading-relaxed text-muted-foreground">
            OmniSOC's engineers run data pipelines, on-prem systems, and networking for a security
            operations center that ingests about 56 TB a day. I was brought in to expand their
            output with AI, without loosening the controls that keep a SOC safe.
          </p>
        </header>

        {/* the constraint */}
        <CaseSection label="01 / The constraint" title="The work is distributed, and so is the truth about what broke.">
          <div class="grid gap-10 md:grid-cols-2">
            <div class="space-y-5 font-sans text-base leading-relaxed text-muted-foreground">
              <p>The team builds and maintains data pipelines, does sysadmin and systems engineering work, and keeps the network running. Four engineers, a very distributed system, and many services that call each other to get things done.</p>
              <p>That makes debugging slow. The evidence lives in different places: logs on one host, configs on another, context in a meeting nobody wrote down. There was no easy way to test a fix end-to-end, and no way for an AI agent to close the loop on its own.</p>
              <p>A chat window that can only suggest changes doesn't help much. The agent needed access to the systems where the work actually happens.</p>
            </div>
            <div class="border border-border bg-muted/20 p-8">
              <p class="font-serif text-2xl">Why an agent couldn't just be pointed at it</p>
              <ul class="mt-5 space-y-4 font-sans text-sm leading-relaxed text-muted-foreground">
                <li>Logs and traces sit on individual on-prem hosts, not in one place.</li>
                <li>Setups vary host to host, so nothing is uniformly testable end-to-end.</li>
                <li>A SOC cannot hand a frontier model unchecked shell access to production.</li>
              </ul>
            </div>
          </div>
        </CaseSection>

        {/* the intelligence layer */}
        <section class="border-y border-border bg-muted/20">
          <div class="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <p class="font-sans text-xs uppercase tracking-[0.2em] text-signal">02 / The intelligence layer</p>
            <h2 class="mt-4 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">Give the agent memory and ears before giving it hands.</h2>
            <p class="mt-5 max-w-2xl font-sans text-base leading-relaxed text-muted-foreground">An agent with no context asks humans to re-explain everything. The first win was a layer the whole team's agents can query, and it grows over time.</p>
            <div class="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
              <div class="bg-background p-8">
                <h3 class="font-serif text-2xl">Meeting memory with Anarlog</h3>
                <p class="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">We adopted an open-source meeting recorder (Anarlog) so the team's day-to-day decisions land in a searchable store. Agents query it for context instead of asking an engineer what was decided last week.</p>
              </div>
              <div class="bg-background p-8">
                <h3 class="font-serif text-2xl">ClickUp, as an MCP tool</h3>
                <p class="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">Their issue tracker became a tool the agent can read and write. The agent picks up ticket context, leaves comments as it works, and hands findings back to the humans who need them.</p>
              </div>
              <div class="bg-background p-8">
                <h3 class="font-serif text-2xl">SharePoint, searchable</h3>
                <p class="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">Documentation lives in SharePoint. A query tool lets agents pull the runbooks and docs they need, which matters when the environment differs from host to host.</p>
              </div>
              <div class="bg-background p-8">
                <h3 class="font-serif text-2xl">On-host access, with guardrails (LILY)</h3>
                <p class="mt-3 font-sans text-sm leading-relaxed text-muted-foreground">LILY is a small Go program installed as a guard hook. When an agent tries to SSH into a host or run a cloud CLI command, LILY rewrites it to a validated read-only run. A YAML allowlist defines, per host and per agent, which commands and tools are allowed. Destructive commands are hardcoded-blocked and can't be configured away, with rate limits and output caps on top.</p>
              </div>
            </div>
            <p class="mt-8 max-w-3xl font-sans text-sm leading-relaxed text-muted-foreground">Why Go: the guardrails compile into a binary. The agent can't open its own rulebook and edit it, which matters more as agents get better at modifying the tools meant to constrain them. LILY is open source at github.com/aspectrr/lily.</p>
          </div>
        </section>

        {/* the locked-down environment */}
        <CaseSection label="03 / The environment" title="A sandbox with hard walls, connected to the data.">
          <div class="grid gap-10 md:grid-cols-2">
            <div class="space-y-5 font-sans text-base leading-relaxed text-muted-foreground">
              <p>For the engineering work itself, we ran agents in Orca with its sandbox extension: Docker containers with restricted network access and an explicit file allowlist. Full visibility into what each agent can touch, and nothing more.</p>
              <p>The models run on an LLM provider supplied by the university, so work involving sensitive data stays inside the institution instead of going to an outside provider.</p>
              <p>The data platform is Elasticsearch and OpenSearch. I built an MCP server for it that connects as a monitor-only user: the agent can read cluster health, stats, and pipeline state, and run the read-only dev-tools console commands, across both the Logstash and Elasticsearch/OpenSearch clusters. That's what closes the loop. The agent can see the data flowing through every pipeline, spot what broke, and verify a hypothesis, all without a single write credential.</p>
              <p>When a fix needs testing, Deer (also open source) spins up an isolated sandbox VM with a copy of production data, lets the agent break things there, and turns the result into an Ansible playbook a human reviews before anything touches production.</p>
            </div>
            <div class="border border-border">
              <div class="border-b border-border bg-muted/20 px-7 py-5">
                <p class="font-sans text-xs uppercase tracking-[0.2em] text-muted-foreground">What an agent could and couldn't do</p>
              </div>
              <div class="grid gap-px bg-border sm:grid-cols-2">
                <div class="bg-background p-7">
                  <p class="font-sans text-xs uppercase tracking-[0.2em] text-signal">Allowed</p>
                  <ul class="mt-4 space-y-2.5 font-sans text-sm leading-relaxed text-muted-foreground">
                    <li>Read-only shell commands on hosts, from an allowlist</li>
                    <li>Cluster health, stats and shard state on ES/OpenSearch</li>
                    <li>Read-only dev-tools console queries</li>
                    <li>Read/write on ClickUp tickets, to leave its findings</li>
                    <li>Full control inside its own disposable sandbox</li>
                  </ul>
                </div>
                <div class="bg-background p-7">
                  <p class="font-sans text-xs uppercase tracking-[0.2em] text-signal">Blocked</p>
                  <ul class="mt-4 space-y-2.5 font-sans text-sm leading-relaxed text-muted-foreground">
                    <li>Writes, deletes, sudo, or service restarts on real hosts</li>
                    <li>Any destructive command, even by config</li>
                    <li>Network access outside its sandbox</li>
                    <li>Sending data to an outside model provider</li>
                    <li>Applying a change to production without human review</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CaseSection>

        {/* the evidence */}
        <section class="border-y border-border bg-foreground text-background">
          <div class="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <div class="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div>
                <p class="font-sans text-xs uppercase tracking-[0.2em] text-signal">04 / The evidence</p>
                <h2 class="mt-4 font-serif text-4xl md:text-5xl">Monthly output, before and after.</h2>
              </div>
              <div class="flex gap-2" role="group" aria-label="Choose a measure">
                <For each={Object.keys(SERIES) as SeriesKey[]}>{(key) => (
                  <button
                    type="button"
                    aria-pressed={series() === key ? "true" : "false"}
                    onClick={() => setSeries(key)}
                    class={`rounded-full border px-5 py-2 font-sans text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${series() === key ? "border-background bg-background text-foreground" : "border-background/30 hover:border-background"}`}
                  >{SERIES[key].label}</button>
                )}</For>
              </div>
            </div>

            <div class="mt-12 flex h-64 items-end gap-[3px] md:h-80 md:gap-1.5" role="img" aria-label={`${s().label} per month, February 2024 through November 2026. The agent harness was installed in April 2026.`}>
              <For each={s().data}>{(value, i) => (
                <div
                  class="group relative h-full flex-1"
                  title={`${monthLabel(MONTHS[i()])}: ${value} ${s().label.toLowerCase()}`}
                >
                  <div
                    class={`absolute bottom-0 w-full rounded-t-sm transition-[height] duration-300 motion-reduce:transition-none ${i() >= CUT_INDEX ? "bg-signal" : "bg-background/35 group-hover:bg-background/55"}`}
                    style={{ height: `${value === 0 ? 2 : Math.max(3, (value / max()) * 100)}%` }}
                  />
                </div>
              )}</For>
            </div>
            <div class="relative mt-2 h-5">
              <div class="absolute flex flex-col items-center" style={{ left: `${((CUT_INDEX + 0.5) / MONTHS.length) * 100}%`, transform: "translateX(-50%)" }}>
                <span class="whitespace-nowrap font-sans text-xs text-signal">↑ agent harness installed · Apr 2026</span>
              </div>
            </div>
            <div class="mt-2 flex justify-between font-sans text-xs text-background/60">
              <span>Feb 2024</span>
              <span>2025</span>
              <span>Nov 2026</span>
            </div>

            <div class="mt-10 grid gap-8 border-t border-background/20 pt-10 sm:grid-cols-3">
              <div>
                <p class="font-serif text-4xl">2.2×</p>
                <p class="mt-2 font-sans text-sm leading-relaxed text-background/70">merged PRs per week after the install (0.9/wk before, 1.9/wk after), with the merge rate holding at 92% versus 95% before.</p>
              </div>
              <div>
                <p class="font-serif text-4xl">{preTotal()} → {postTotal()}</p>
                <p class="mt-2 font-sans text-sm leading-relaxed text-background/70">{s().label.toLowerCase()} totals. The before period runs 27 months; the after period, 7. Compare rates, not raw counts.</p>
              </div>
              <div>
                <p class="font-serif text-4xl">4</p>
                <p class="mt-2 font-sans text-sm leading-relaxed text-background/70">engineers kept the same on-call load and the same infrastructure, at about 56 TB ingested per day.</p>
              </div>
            </div>
            <p class="mt-8 max-w-3xl font-sans text-xs leading-relaxed text-background/60">Source: OmniSOC repository commit and PR export, Feb 2, 2024 to Nov 23, 2026, split at the April 30, 2026 agent install. The chart shows Collin's repository contributions, not the whole team's output, and an increase around the install doesn't by itself prove the harness caused all of it.</p>
          </div>
        </section>

        {/* what's next */}
        <CaseSection label="05 / What's next" title="The same guardrails, pointed at on-call.">
          <div class="grid gap-10 md:grid-cols-2">
            <p class="font-sans text-base leading-relaxed text-muted-foreground">The next step is an on-call agent. When a page fires, it would do a read-only sweep across the environment, the hosts, the pipelines, the cluster stats, and hand the on-call engineer a starting diagnosis. The sensitive digging stays with the human; the legwork doesn't.</p>
            <p class="font-sans text-base leading-relaxed text-muted-foreground">That's the pattern behind all of it: build the intelligence layer, put hard walls around execution, and let the agent close the loop inside them. It compounds, because every meeting, ticket, and pipeline it can see makes the next answer better.</p>
          </div>
        </CaseSection>

        {/* CTA */}
        <section class="border-t border-border">
          <div class="mx-auto max-w-2xl px-6 py-24 text-center">
            <h2 class="font-serif text-4xl leading-tight">
              Want this for
              <br />
              <em>your team?</em>
            </h2>
            <p class="mx-auto mt-4 max-w-md font-sans text-base text-muted-foreground">
              Apply for a free 12-week pilot. We'll find where AI can do the most work for your
              business, build a working trial, and hand it over for your team to operate.
            </p>
            <Button as="a" href="/gift" class="mt-8" size="lg">
              {"{ APPLY FOR THE FREE PILOT }"}
            </Button>
          </div>
        </section>
      </article>
    </Page>
  )
}
