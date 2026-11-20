import { createSignal, onSettled } from "solid-js"
import { VideoPicker } from "@/brand/video-picker"
import { initHeroVideo } from "@/routes/site-state"

export default function Footage() {
  // localStorage read must stay client-side — render-time access throws SSR.
  const [heroVideo, setHeroVideo] = createSignal<string | null>(null)
  onSettled(() => setHeroVideo(initHeroVideo()))
  return (
    <VideoPicker
      heroVideo={heroVideo()}
      // Across routes localStorage is the source of truth; Site re-reads on mount.
      onSetHero={setHeroVideo}
      onBack={() => {
        window.location.href = "/"
      }}
    />
  )
}
