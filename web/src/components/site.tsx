// Shared chrome for the content pages (iu, brain, newsletter, contact,
// writing, careers). The landing page (/) has its own fixed-stage chrome and
// does NOT use these.
import { Meta, Title } from "@solidjs/meta"
import type { JSX } from "solid-js"
import { Logo } from "@/brand/logo"
import { Button } from "@basaltac/ui"

// The approved text-link look (same as the landing nav).
function NavLink(props: { href: string; children: string }) {
  return (
    <Button variant="link" size="link" as="a" href={props.href}>
      {props.children}
    </Button>
  )
}

export function Page(props: { title: string; description: string; children: JSX.Element }) {
  return (
    <div class="min-h-svh bg-background text-foreground">
      <Title>{props.title}</Title>
      <Meta name="description" content={props.description} />
      <SiteHeader />
      {props.children}
      <SiteFooter />
    </div>
  )
}

export function SiteHeader() {
  return (
    <header class="flex items-center justify-between px-6 py-5">
      <a href="/" aria-label="Basalt & Company home">
        <Logo variant="word" redDot suffix="& Company" class="text-[20px]" />
      </a>
      <nav class="flex items-center gap-6">
        <NavLink href="/contact">Contact</NavLink>
        <NavLink href="/writing">Writing</NavLink>
        <NavLink href="/careers">Careers</NavLink>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer class="border-t border-border px-6 py-10">
      <div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Logo variant="word" redDot class="text-[18px]" />
          <p class="mt-2 font-sans text-xs tracking-wide text-muted-foreground">
            © 2026 Basalt &amp; Company
          </p>
        </div>
        <div class="flex items-center gap-6">
          <NavLink href="/newsletter">Newsletter</NavLink>
          <Button variant="link" size="link" as="a" href="mailto:cpfeifer@basalt.ac">
            Email
          </Button>
          <Button
            variant="link"
            size="link"
            as="a"
            href="https://cal.com/cpfeifer/info-meeting"
            target="_blank"
          >
            Calendar
          </Button>
        </div>
      </div>
    </footer>
  )
}
