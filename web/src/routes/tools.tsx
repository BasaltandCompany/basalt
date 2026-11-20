// /tools — the free-tools goody bag. Three building blocks for turning a
// company AI-native, all claimed through the /gift game plan. Static JSX so
// the full content SSRs on first paint.
import { Page } from "@/components/site"
import { Button } from "@basaltac/ui"


export default function Tools() {
	return (
		<Page title="Free Tools | Basalt & Company" description="Three free tools to turn your company AI-native: the PR Reviewer, the security scanner, and the Software Factory.">
			<section class="mx-auto max-w-3xl px-6 pb-24 pt-14">
				<h1 class="font-serif text-5xl leading-[1.05] tracking-[-0.01em]">Free tools</h1>
				<p class="mt-4 font-serif text-base italic text-muted-foreground">
					The building blocks for turning your company AI-native. All free. All yours to keep.
				</p>

				<div class="mt-12 divide-y divide-border">
					<section class="py-8">
						<p class="font-sans text-xs uppercase tracking-[0.25em] text-muted-foreground">Building block 01</p>
						<h2 class="mt-2 font-serif text-3xl leading-tight">Basalt PR Reviewer</h2>
						<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
							Every pull request gets a code and security review before a human ever looks at it.
							Install the GitHub App once. Bad code gets caught early. So do security holes.
						</p>
						<p class="mt-4">
							<Button variant="link" size="link" as="a" href="/gift">Claim the goody bag</Button>
						</p>
					</section>

					<section class="py-8">
						<p class="font-sans text-xs uppercase tracking-[0.25em] text-muted-foreground">Building block 02</p>
						<h2 class="mt-2 font-serif text-3xl leading-tight">Basalt security scanner</h2>
						<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
							A weekly report on how safe your company is. Plain words, in your inbox.
							You see the risks before they become problems.
						</p>
						<p class="mt-2 font-sans text-sm text-muted-foreground">Coming soon.</p>
						<p class="mt-4">
							<Button variant="link" size="link" as="a" href="/gift">Claim the goody bag</Button>
						</p>
					</section>

					<section class="py-8">
						<p class="font-sans text-xs uppercase tracking-[0.25em] text-muted-foreground">Building block 03</p>
						<h2 class="mt-2 font-serif text-3xl leading-tight">Basalt Software Factory</h2>
						<p class="mt-4 font-sans text-base leading-relaxed text-muted-foreground">
							Build and ship your own software. One-stop deploys to Fly, Railway, or Render.
							No Basalt in the middle. It's yours.
						</p>
						<p class="mt-4">
							<Button variant="link" size="link" as="a" href="/gift">Claim the goody bag</Button>
						</p>
					</section>
				</div>

				<p class="mt-12 font-sans text-base leading-relaxed text-muted-foreground">
					A lot comes in the bag: the tools, the steps to set them up, 3 months of Claude, and your
					AI game plan. If that sounds like too much — good. You're not supposed to do it alone.{" "}
					<a href="mailto:cpfeifer@basalt.ac" class="underline underline-offset-4 hover:text-foreground">
						Write to us
					</a>{" "}
					and we'll set it up with you.
				</p>
			</section>
		</Page>
	)
}

