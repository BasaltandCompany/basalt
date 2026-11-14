import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { Badge } from "@basaltac/ui"
import { Button } from "@basaltac/ui"
import { Card } from "@basaltac/ui"
import { Input } from "@basaltac/ui"
import { Label } from "@basaltac/ui"
import { Separator } from "@basaltac/ui"

type Clip = {
  title: string
  url: string
  poster?: string
  mb: number
  mime: string
}

const TOPICS = [
  "lava flow",
  "volcano eruption",
  "ocean waves",
  "stormy sea",
  "clouds timelapse",
  "foggy forest",
  "geyser eruption",
  "glacier ice",
]

const KEY = "basalt.heroVideo"

/**
 * Footage picker: scrolls Wikimedia Commons' free (CC) video library.
 * Pick a clip, preview it looping full-bleed, set it as the hero background.
 * ponytail: Commons = zero keys and stable URLs; swap in Pexels/Coverr later
 * if the quality bar demands it.
 */
export function VideoPicker(props: {
  heroVideo: string | null
  onSetHero: (url: string | null) => void
  onBack: () => void
}) {
  const [query, setQuery] = createSignal("lava flow")
  const [clips, setClips] = createSignal<Clip[]>([])
  const [loading, setLoading] = createSignal(false)
  const [preview, setPreview] = createSignal<Clip | null>(null)

  createEffect(() => {
    const q = query()
    const ctrl = new AbortController()
    setLoading(true)
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      origin: "*",
      generator: "search",
      gsrsearch: `filetype:video ${q}`,
      gsrnamespace: "6",
      gsrlimit: "24",
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "480",
    })
    fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data) => {
        const pages: object = data.query?.pages ?? {}
        const found: Clip[] = Object.values(pages)
          .map((p): Clip | null => {
            const info = (p as { imageinfo?: Array<Record<string, unknown>> }).imageinfo?.[0]
            if (!info) return null
            const mime = String(info.mime ?? "")
            if (mime !== "video/webm" && mime !== "video/mp4") return null
            return {
              title: String((p as { title: string }).title).replace(/^File:/, ""),
              url: String(info.url),
              poster: (info.thumburl as string) ?? undefined,
              mb: Math.round(Number(info.size ?? 0) / 1e6),
              mime,
            }
          })
          .filter((c): c is Clip => c !== null)
        setClips(found)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    onCleanup(() => ctrl.abort())
  })

  const setHero = (url: string | null) => {
    if (url) localStorage.setItem(KEY, url)
    else localStorage.removeItem(KEY)
    props.onSetHero(url)
    setPreview(null)
  }

  return (
    <div class="min-h-svh">
      <header class="border-b border-border">
        <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <p class="font-serif text-xl">Footage library</p>
          <Button
            variant="link"
            size="link"
            as="a"
            href="#"
            class="text-muted-foreground"
            onClick={(e) => {
              e.preventDefault()
              props.onBack()
            }}
          >
            ← Back to site
          </Button>
        </div>
      </header>

      <div class="mx-auto max-w-5xl px-6 py-10">
        <p class="max-w-xl font-sans text-sm leading-relaxed text-muted-foreground">
          Free, licensed stock video from Wikimedia Commons. Click any clip to preview it
          looping full-bleed, then set it as the hero background. Files under ~15 MB loop
          best on first load.
        </p>

        <Separator class="my-8" />

        <div class="flex max-w-sm flex-col gap-2">
          <Label for="footage-search" class="text-muted-foreground">
            Search Commons
          </Label>
          <Input
            id="footage-search"
            placeholder="e.g. lava flow"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <Button
              variant="outline"
              size="sm"
              data-active={query() === t}
              onClick={() => setQuery(t)}
              class="text-muted-foreground hover:bg-transparent data-[active=true]:bg-foreground data-[active=true]:text-background data-[active=true]:hover:bg-foreground data-[active=true]:hover:text-background"
            >
              {t}
            </Button>
          ))}
        </div>

        <Show when={props.heroVideo}>
          <div class="mt-6 flex items-center gap-3 font-sans text-xs text-muted-foreground">
            <Badge variant="outline">hero set</Badge>
            <span>A Commons clip is the current hero background.</span>
            <Button
              variant="link"
              size="link"
              as="a"
              href="#"
              class="text-signal"
              onClick={(e) => {
                e.preventDefault()
                setHero(null)
              }}
            >
              Remove it
            </Button>
          </div>
        </Show>

        <Show
          when={!loading()}
          fallback={
            <p class="mt-10 font-sans text-sm text-muted-foreground">Searching…</p>
          }
        >
          <div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {clips().map((c) => (
              <button class="group text-left" onClick={() => setPreview(c)}>
                <Card class="overflow-hidden border-0 bg-transparent p-0 shadow-none">
                  <div class="aspect-video w-full bg-card">
                    <Show when={c.poster}>
                      <img
                        src={c.poster}
                        alt=""
                        class="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                      />
                    </Show>
                  </div>
                </Card>
                <p class="mt-2 truncate font-sans text-xs text-muted-foreground">{c.title}</p>
                <p class="font-sans text-[10px] text-muted-foreground/60">{c.mb} MB</p>
              </button>
            ))}
            {clips().length === 0 && (
              <p class="col-span-full font-sans text-sm text-muted-foreground">
                Nothing found for “{query()}”. Try another topic.
              </p>
            )}
          </div>
        </Show>
      </div>

      <Show when={preview()} keyed>
        {(clip) => (
          <div class="fixed inset-0 z-50 bg-background/95">
            <video
              ref={(el) => {
                el.muted = true
              }}
              src={clip.url}
              poster={clip.poster}
              autoplay
              loop
              playsinline
              class="h-full w-full object-cover opacity-80"
            />
            <div class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-background to-transparent p-8">
              <div class="min-w-0 pr-4">
                <p class="truncate font-sans text-sm">{clip.title}</p>
                <p class="font-sans text-xs text-muted-foreground">
                  {clip.mb} MB · {clip.mime}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-6">
                <Button
                  variant="link"
                  size="link"
                  as="a"
                  href="#"
                  class="text-signal"
                  onClick={(e) => {
                    e.preventDefault()
                    setHero(clip.url)
                  }}
                >
                  Use in hero
                </Button>
                <Button
                  variant="link"
                  size="link"
                  as="a"
                  href="#"
                  class="text-muted-foreground"
                  onClick={(e) => {
                    e.preventDefault()
                    setPreview(null)
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
