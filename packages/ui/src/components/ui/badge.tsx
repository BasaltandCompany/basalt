import type { Component } from "solid-js";
import type { ComponentProps } from "@solidjs/web"
import { splitProps } from "../../solid2-compat"

import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "../../lib/utils"

// Variant set matches React shadcn (default/secondary/destructive/outline);
// the registry's extra success/warning/error colors aren't in our tokens.
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-white",
        outline: "text-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>

const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant"])
  return <span class={cn(badgeVariants({ variant: local.variant }), local.class)} {...others} />
}

export type { BadgeProps }
export { Badge, badgeVariants }
