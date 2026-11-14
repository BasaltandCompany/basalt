// /careers — honest page, no open roles yet. The firm is two people and a
// fleet of agents; when that changes, this page changes.
import { Page } from "@/components/site"
import { Button } from "@basaltac/ui"

export default function Careers() {
  return (
    <Page
      title="Careers | Basalt & Company"
      description="No open roles right now, but we hire the moment the work demands it."
    >
      <section class="mx-auto max-w-xl px-6 pb-24 pt-14">
        <h1 class="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">Careers</h1>
        <p class="mt-6 font-sans text-base leading-relaxed text-muted-foreground">
          No open roles right now. We stay deliberately small. The agents handle the volume, the
          humans handle the judgment. When that balance breaks, we hire.
        </p>
        <p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
          Think you'd be one of them? Say so before there's an opening.
        </p>
        <Button as="a" href="/contact" variant="outline" class="mt-8">
          {"{ SAY SO }"}
        </Button>
      </section>
    </Page>
  )
}
