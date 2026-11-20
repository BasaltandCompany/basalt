// Solid 2 compat for shadcn-style call sites. splitProps is gone (omit
// replaced the "rest" half); this keeps the destructuring form working.
// local stays the full props object — reads of the picked keys inside JSX
// behave identically — and others is the omitted rest, as before.
import { omit } from "solid-js";
import type { ValidComponent } from "@solidjs/web";
import type { ComponentProps } from "@solidjs/web";

export function splitProps<T extends Record<string, any>, K extends keyof T>(
	props: T,
	keys: K[],
): [Pick<T, K>, Omit<T, K>] {
	return [props as Pick<T, K>, omit(props, ...keys) as unknown as Omit<T, K>];
}

export type { ComponentProps, ValidComponent };
