import type { JSX } from "solid-js"
import { cn } from "@basaltac/ui"

/**
 * Basalt brand marks. One geometry: three basalt pillars, staggered tops.
 * Ink on paper, paper on ink. The middle pillar may take the signal red —
 * that is the only color the brand gets.
 */

const SIGNAL_RED = "#C8102E"

export function BasaltMark(props: {
  size?: number
  redBar?: boolean
  class?: string
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={props.size ?? 28}
      height={props.size ?? 28}
      fill="currentColor"
      class={props.class}
      aria-hidden="true"
    >
      <rect x="3" y="9" width="7" height="23" />
      <rect x="12.5" y="2" width="7" height="30" fill={props.redBar ? SIGNAL_RED : undefined} />
      <rect x="22" y="12" width="7" height="20" />
    </svg>
  )
}

export function Wordmark(props: {
  suffix?: string
  redDot?: boolean
  class?: string
}) {
  return (
    <span class={cn("flex flex-col items-start leading-none", props.class)}>
      <span class="serif-display font-serif text-[1.6em] tracking-[-0.01em]">
        Basalt{props.redDot && <span class="text-signal">.</span>}
      </span>
      {props.suffix && (
        <span class="mt-[0.35em] font-sans text-[0.32em] font-medium uppercase tracking-[0.34em] text-muted-foreground">
          {props.suffix}
        </span>
      )}
    </span>
  )
}

/**
 * Full lockup scales with `size` via em units — mark, word, and suffix all move together.
 */
export function Logo(props: {
  variant?: "mark" | "word" | "full"
  size?: number
  redBar?: boolean
  redDot?: boolean
  suffix?: string
  class?: string
  children?: JSX.Element
}): JSX.Element {
  if (props.variant === "mark")
    return <BasaltMark size={props.size} redBar={props.redBar} class={props.class} />

  if (props.variant === "word")
    return <Wordmark suffix={props.suffix} redDot={props.redDot} class={cn("text-[1em]", props.class)} />

  return (
    <span
      class={cn("inline-flex items-center gap-[0.55em] leading-none", props.class)}
      style={{ "font-size": `${props.size ?? 28}px` }}
    >
      <BasaltMark size={props.size} redBar={props.redBar} />
      <Wordmark suffix={props.suffix} redDot={props.redDot} />
    </span>
  )
}
