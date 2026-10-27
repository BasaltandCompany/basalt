import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { Logo } from "@/brand/logo"
import { Button } from "@basalt/ui"
import { initHeroVideo } from "@/routes/site-state"


/**
 * The scroll narrative. One message per 100vh screen; the bottom-left corner
 * swaps between them as you scroll. Edit copy here — nowhere else.
 * Order: what we do → proof → the free-brain CTA.
 */
const MESSAGES: Message[] = [
  {
    title: "We embed custom AI solutions into your business.",
    body: "We focus on revenue per work-hour, letting your team of five operate like a team of twenty-five with AI-driven systems and solutions built by our consultants. Learn more about why we focus on this metric",
    link: { href: "/thesis", label: "here." },
  },
  {
    title: "Proven in production.",
    proof: [
      {
        client: "Indiana University",
        stat: "2.75x",
        line: "revenue per work-hour, with AI agents running their outbound and a third of their time back.",
      },
      {
        client: "Customs Data Lock",
        stat: "+200%",
        line: "response rates from the cold-outreach dashboard, plus coding-agent training and prospect identification that grew sales and outreach.",
      },
    ],
  },
  {
    title: "Start with a free company brain.",
    body: "Take the three-minute test and your Company Brain Blueprint renders instantly: the exact connectors for your stack, your first three workflows, and the complete recipe to build it yourself. Or I'll build it with your team, free.",
    cta: { href: "/brain", label: "Take the brain test" },
  },
]

type Message = {
  title: string
  body?: string
  link?: { href: string; label: string }
  proof?: { client: string; stat: string; line: string }[]
  cta?: { href: string; label: string }
}


// The approved text-link look, now a Button variant. dim passes /40 instead of /60.
function LinkText(props: { dim?: boolean; href?: string; children: string; onClick?: (e: MouseEvent) => void }) {
  return (
    <Button
      variant="link"
      size="link"
      as="a"
      href={props.href ?? "#"}
      onClick={props.onClick}
      class={props.dim ? "text-foreground/40" : undefined}
    >
      {props.children}
    </Button>
  )
}

export function Site(props: { heroVideo: string | null }) {
  const [index, setIndex] = createSignal(0)
  const last = () => index() === MESSAGES.length - 1

  onMount(() => {
    const onScroll = () =>
      setIndex(
        Math.max(
          0,
          Math.min(
            MESSAGES.length - 1,
            Math.round(window.scrollY / window.innerHeight),
          ),
        ),
      )
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    onCleanup(() => window.removeEventListener("scroll", onScroll))
  })

  const step = () =>
    window.scrollTo({
      top: (last() ? 0 : index() + 1) * window.innerHeight,
      behavior: "smooth",
    })

  return (
    <div class="home-narrative bg-background text-foreground">
      {/* ── Fixed stage: the surface never scrolls away ─────────── */}
      <div class="fixed inset-0" aria-hidden="true">
        <Show when={props.heroVideo} keyed>
          {(src) => (
            <>
              {/* muted as attribute doesn't stick in Solid — property set makes autoplay work */}
              <video
                ref={(el) => {
                  el.muted = true
                }}
                src={src}
                autoplay
                loop
                playsinline
                class="absolute inset-0 h-full w-full object-cover opacity-40"
              />
              <div class="absolute inset-0 bg-gradient-to-b from-background/85 via-background/55 to-background" />
            </>
          )}
        </Show>
        <Show when={!props.heroVideo}>
          <div class="lava-glow absolute inset-x-0 bottom-0 h-72" aria-hidden="true" />
          <svg
            class="absolute bottom-0 left-0 h-40 w-full"
            viewBox="0 0 1200 160"
            preserveAspectRatio="none"
          >
            <g fill="#050505">
              <rect x="0" y="148" width="1200" height="12" />
              <rect x="170" y="66" width="170" height="94" />
              <rect x="515" y="14" width="190" height="146" />
              <rect x="880" y="92" width="165" height="68" />
            </g>
          </svg>
        </Show>
      </div>

      {/* ── Fixed chrome ────────────────────────────────────────── */}
      <div class="fixed inset-x-0 top-0 z-20 flex items-start justify-between px-6 py-5">
        <Logo variant="word" redDot suffix="& Company" class="text-[24px]" />
        <nav class="flex flex-col items-end gap-2 pt-2">
          <LinkText href="/contact">Contact</LinkText>
          <LinkText href="/writing">Writing</LinkText>
          <LinkText href="/careers">Careers</LinkText>
          <LinkText href="/portal/login">Clients</LinkText>
        </nav>
      </div>
      <div class="fixed right-0 bottom-0 z-20 px-6 pb-5 text-right">
        <p class="font-sans text-xs tracking-wide text-muted-foreground">
          © 2026 Basalt &amp; Company
        </p>
      </div>

      {/* ── Scroll track: invisible distance, four screens ──────── */}
      <div aria-hidden="true">
        {MESSAGES.map(() => (
          <div class="h-svh snap-start" />
        ))}
      </div>

      {/* ── Fixed corner narrative: only the words swap ────────── */}
      <div class="pointer-events-none fixed bottom-0 left-0 z-20 max-w-2xl px-6 pb-10">
        {/* keyed on the message object → remounts per screen, replaying .msg-in */}
        <Show when={MESSAGES[index()]} keyed>
          {(msg) => (
        <div class="msg-in">
          <Show
            when={index() === 0}
            fallback={
              <p class="font-serif text-4xl leading-[1.05] tracking-[-0.01em] md:text-5xl">
                {msg.title}
              </p>
            }
          >
            <h1 class="font-serif text-4xl leading-[1.05] tracking-[-0.01em] md:text-5xl">
              {msg.title}
            </h1>
          </Show>
          <Show
            when={msg.proof}
            fallback={
              <p class="mt-4 max-w-lg font-sans text-base leading-relaxed text-muted-foreground">
                {msg.body}{" "}
                <Show when={msg.link}>
                  {(l) => (
                    <a
                      class="text-foreground/80 underline underline-offset-4 hover:text-foreground"
                      href={l().href}
                    >
                      {l().label}
                    </a>
                  )}
                </Show>
              </p>
            }
          >
            {(proof) => (
              <div class="mt-5 space-y-7">
                <For each={proof()}>
                  {(p) => (
                    <div>
                      <p class="font-sans text-xs uppercase tracking-[0.25em] text-muted-foreground">
                        {p.client}
                      </p>
                      <p class="mt-1 font-serif text-5xl leading-none">{p.stat}</p>
                      <p class="mt-2 max-w-lg font-sans text-sm leading-relaxed text-muted-foreground">
                        {p.line}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            )}
          </Show>
          <div class="pointer-events-auto mt-6 flex items-center gap-8">
            <Show
              when={msg.cta}
              fallback={<LinkText href="/contact">Start a conversation</LinkText>}
            >
              {(cta) => <LinkText href={cta().href}>{cta().label}</LinkText>}
            </Show>
            <LinkText dim href="/thesis">Read the thesis</LinkText>
          </div>
        </div>
          )}
        </Show>
      </div>

      {/* ── Scroll control ──────────────────────────────────────── */}
      <button
        onClick={step}
        aria-label={last() ? "Back to top" : "Scroll down"}
        class="fixed bottom-5 left-1/2 z-20 -translate-x-1/2 text-foreground/60 transition-colors hover:text-foreground"
      >
        <svg
          viewBox="0 0 24 24"
          class={`h-7 w-7 ${last() ? "rotate-180" : ""} ${index() === 0 ? "chev-bob" : ""}`}
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  )
}

export default function Home() {
  // localStorage read must stay client-side — render-time access throws SSR.
  // The lava-glow fallback renders server-side; the video pops in after mount.
  const [heroVideo, setHeroVideo] = createSignal<string | null>(null)
  onMount(() => setHeroVideo(initHeroVideo()))
  return <Site heroVideo={heroVideo()} />
}
