// /writing — everything published, one index. The Dispatch archive plus the
// anonymized public-university case study. Same issues API as /newsletter.
import { createMemo } from "solid-js"
import { For, Show } from "solid-js"
import { Page } from "@/components/site"
import { getDispatchIssuesQuery } from "@/lib/dispatch-queries"

export default function Writing() {

  // Server query, not a relative fetch — relative fetch() throws "URL is invalid"
  // during SSR (500 on /writing in prod, fly logs 2026-11-24).
  const issues = createMemo(() => getDispatchIssuesQuery())

  return (
    <Page
      title="Writing | Basalt & Company"
      description="Essays and teardowns from real deployments."
    >
      <section class="mx-auto max-w-3xl px-6 pb-24 pt-14">
        <h1 class="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">Writing</h1>

        <div class="mt-12">
          <a href="/case-study" class="group block border-b border-border py-6">
            <p class="font-sans text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Case Study
            </p>
            <h2 class="mt-2 font-serif text-2xl transition-colors group-hover:text-foreground">
              A public <em>university</em>: the autonomous ticket agent
            </h2>
            <p class="mt-1 font-sans text-sm text-muted-foreground">
              45% productivity increase, measured across Q2—Q3.
            </p>
          </a>
        </div>

        <div class="divide-y divide-border">
          <Show when={issues()} fallback={<p class="py-6 font-sans text-sm text-muted-foreground">Loading…</p>} keyed>
            {(list) => (
              <For each={list}>
                {(i) => (
                  <a href={`/newsletter/${i.id}`} class="group block py-6">
                    <p class="font-sans text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      The Cactus Dispatch · Issue {String(i.issueNumber).padStart(2, "0")}
                    </p>
                    <h2 class="mt-2 font-serif text-2xl">{i.title}</h2>
                  </a>
                )}
              </For>
            )}
          </Show>
        </div>
      </section>
    </Page>
  )
}
