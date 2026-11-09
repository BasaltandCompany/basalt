// /thesis — the company thesis. The homepage links here ("why revenue per
// work-hour"). Collin writes the real thesis here — the metric section is a
// working draft, the rest is scaffolding to fill in.
import { Page } from "@/components/site"

export default function Thesis() {
  return (
    <Page
      title="The Thesis | Basalt & Company"
      description="Why we build company brains, and why revenue per work-hour is the only number we optimize."
    >
      <section class="mx-auto max-w-2xl px-6 pb-24 pt-14">
        <h1 class="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">The Thesis</h1>
        <p class="mt-4 font-serif text-base italic text-muted-foreground">
          What we believe about AI and small companies, and why we bet on this.
        </p>

        <div class="mt-12 space-y-10">
          <section>
            <h2 class="font-serif text-3xl leading-tight">Revenue per work-hour</h2>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              Revenue is the scoreboard. Hours are the input. Divide one by the other and you get the
              only number that tells the truth about a small company: how much outcome each hour of
              human work actually produces.
            </p>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              We chose it because it can't be faked. Revenue alone grows when you hire more hours —
              that's just buying growth with payroll. Hours saved alone is a cost story that never
              reaches the P&amp;L. Revenue per work-hour only moves when the same people produce more,
              which is exactly what embedding AI into real workflows does.
            </p>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              "A team of five operating like a team of twenty-five" is not a metaphor. It's five times
              the revenue per work-hour, and it's the bar every engagement has to clear.
            </p>
          </section>

          {/* TODO(collin): the rest of the thesis — the give-first philosophy,
              why no-CTO companies, why Indiana. Keep the same section shape. */}
          <section>
            <h2 class="font-serif text-3xl leading-tight text-muted-foreground">
              The rest, as I write it.
            </h2>
            <p class="mt-4 font-sans text-sm leading-relaxed text-muted-foreground/60">
              This page is where the full company thesis lives. Edit{" "}
              <code class="font-mono text-xs">web/src/routes/thesis.tsx</code>.
            </p>
          </section>
        </div>
      </section>
    </Page>
  )
}
