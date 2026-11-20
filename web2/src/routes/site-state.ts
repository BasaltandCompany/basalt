// One-time: early picker test-picks (the 30MB Commons original) clobbered
// the cut hero loop. Strip once; later picker choices stick.
const HERO_KEY = "basalt.heroVideo"

export function initHeroVideo(): string | null {
  if (!localStorage.getItem("basalt.heroVideoMigrated")) {
    localStorage.setItem("basalt.heroVideoMigrated", "1")
    localStorage.removeItem(HERO_KEY)
  }
  return localStorage.getItem(HERO_KEY) ?? "/hero-loop.webm"
}
