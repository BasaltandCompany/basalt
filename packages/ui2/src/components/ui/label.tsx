import type { Component } from "solid-js";
import type { ComponentProps } from "@solidjs/web"
import { splitProps } from "../../solid2-compat"

import { cn } from "../../lib/utils"

const Label: Component<ComponentProps<"label">> = (props) => {
  const [local, others] = splitProps(props, ["class"])
  return (
    <label
      class={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        local.class
      )}
      {...others}
    />
  )
}

export { Label }
