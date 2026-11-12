// /thesis — the company thesis. The homepage's "Why this metric" link
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


			<section>
				<h2 class="font-serif text-3xl leading-tight">We go first.</h2>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					Most agencies ask for trust up front: the call, the deck, the pilot proposal. We'd
					rather owe you than pitch you. So we build a working piece of your company's brain
					from public data — your industry's filings, deadlines, price movements, the questions
					your team asks every week — and give it to you before we've ever spoken. It keeps
					working whether or not you ever hire us.
				</p>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					The first email carries no ask. The ask comes later, smaller, and bounded: if your
					team isn't running what we built within ninety days, we keep working until they are.
					We'd rather stack the proof and let it pull than push.
				</p>
			</section>

			<section>
				<h2 class="font-serif text-3xl leading-tight">Why we work with companies that have no CTO.</h2>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					The companies we help best share a shape: owner-run, knowledge-heavy, and nobody
					technical in the building. The AI opportunity is real, the work is buried in inboxes
					and spreadsheets and heads, and there's no one whose job it is to grab it.
				</p>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					Above a certain size there's an IT director whose job is to say no. Below a certain
					size there isn't enough scatter to matter. In between is the owner who feels it
					personally — every hour their people spend hunting for the same answer. That's who
					we build for, because that's where the metric actually moves.
				</p>
			</section>

			<section>
				<h2 class="font-serif text-3xl leading-tight">Why Indiana.</h2>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					Because this is where the work is, and where the proof is. Indiana runs on
					owner-operated companies doing knowledge-heavy work — logistics, law, public
					affairs, insurance, staffing, construction — exactly the shapes the brains we've
					already built fit.
				</p>
				<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
					One room beats a hundred rooms. Every brain we give away in this state makes the
					next one better and the next introduction warmer. 2.75x at Indiana University
					wasn't a demo for a stranger; it was a neighbor. We'd rather be the obvious choice
					in one place than an option in every place.
				</p>
			</section>
        </div>
      </section>
    </Page>
  )
}
