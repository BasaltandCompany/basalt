// Classic jsx-runtime shim over solid's runtime.
// @solidjs/web's ./jsx-runtime / ./jsx-dev-runtime entries point at files that
// export nothing JSX-like, so any dependency compiled by oxc/esbuild with
// automatic JSX (dev emits jsxDEV) dies at import time. tsconfig
// jsxImportSource points here for those files; the getter-based props that
// esbuild/oxc emit keep solid reactivity intact through createComponent.
import { createComponent } from "@solidjs/web";

type AnyProps = Record<string, unknown>;

export const Fragment = (props: AnyProps) => props.children;

function h(type: any, props: AnyProps) {
	if (type === Fragment) return props.children;
	return createComponent(type, props);
}

export const jsx = h;
export const jsxs = h;
export const jsxDEV = h;
