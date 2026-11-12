// /thesis — the company thesis. The homepage's "Why this metric?" link
// deep-links to the revenue-per-work-hour section anchor.
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
          <section id="revenue-per-work-hour">
            <h2 class="font-serif text-3xl leading-tight">Revenue per work-hour</h2>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              Revenue is the scoreboard. Hours are the input. Divide one by the other and you get
              the only number that tells the truth about a small company: how much outcome each
              hour of human work actually produces.
            </p>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              We chose it because it can't be faked. Revenue alone grows when you hire more hours,
              and that's just buying growth with payroll. Hours saved alone is a cost story that
              never reaches the P&amp;L. Revenue per work-hour only moves when the same people
              produce more, which is exactly what embedding AI into real workflows does.
            </p>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              "A team of five operating like a team of twenty-five" is five times the revenue per
              work-hour, and it's the bar every engagement has to clear.
            </p>
          </section>

          <section>
            <h2 class="font-serif text-3xl leading-tight">Why custom deployments.</h2>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              Small companies move first. They can decide on a Tuesday and have something running
              by Friday. Big companies have committees and procurement cycles, so they wait to see
              the movement before they move.
            </p>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              But the movement doesn't come off the shelf. A specialized team's value lives in its
              own data, its own judgment, and its own relationships. Generic tools can't reach any
              of that. Real gains take a custom deployment: custom training on the company's own
              data, custom renderings of information it already owns, and harnesses that let the
              whole team scale faster.
            </p>
            <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
              That's the work. We build AI into the jobs a team already does, using the company's
              own data and its own language, and then the number at the top of this page tells us
              whether it worked.
            </p>
          </section>
        </div>
      </section>
    </Page>
  )
}
