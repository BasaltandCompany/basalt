import type { Component } from "solid-js";
import type { ComponentProps } from "@solidjs/web"
import { splitProps } from "../../solid2-compat"

import { cn } from "../../lib/utils"

// Ported from React shadcn v4 (registry had no input); same classes, Solid shape.
const Input: Component<ComponentProps<"input">> = (props) => {
  const [local, others] = splitProps(props, ["class", "type"])
  return (
    <input
      type={local.type ?? "text"}
      class={cn(
        "border-input placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        local.class
      )}
      {...others}
    />
  )
}

export { Input }
