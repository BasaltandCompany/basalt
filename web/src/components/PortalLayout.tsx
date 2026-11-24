
import { For, ParentComponent, Show, createEffect } from "solid-js";
import { useLocation } from "@solidjs/router";
import Toaster from "~/components/Toaster";
import { ConfirmHost } from "~/components/ConfirmDialog";
import Brand from "~/components/Brand";

const links = [
	{ href: "/portal", label: "Overview" },
	{ href: "/portal/value", label: "Value" },
	{ href: "/portal/security", label: "Security" },
	{ href: "/portal/documents", label: "Documents" },
	{ href: "/portal/quotes", label: "Quotes" },
	{ href: "/portal/invoices", label: "Invoices" },
	{ href: "/portal/api-keys", label: "API Keys" },
];

const PortalLayout: ParentComponent<{ user?: { id?: string; name?: string; email?: string } | null }> = (props) => {
	const loc = useLocation();
	// Identify user in PostHog once loaded
	createEffect(
		() => props.user,
		(u) => {
			if (u?.id) (window as any).posthog?.identify?.(u.id, { email: u.email });
		},
	);

	function handleLogoutForm(e: Event) {
		(window as any).posthog?.reset?.();
	}
	return (
		<div class="layout">
			<aside class="sidebar">
				<div class="sidebar-logo">
					<div class="sidebar-logo-text">
						<Brand suffix="Client Portal" />
					</div>
				</div>
				<nav class="sidebar-nav">
					<For each={links}>
						{(link) => (
							<a
							href={link.href}
							class={["nav-link", { active: link.href === "/portal" ? loc.pathname === "/portal" : loc.pathname.startsWith(link.href) }]}
							>
								{link.label}
							</a>
						)}
					</For>
				</nav>
				<div class="sidebar-footer">
					<Show when={props.user?.name}>
						<div style={{ "margin-bottom": "4px" }}>{props.user!.name}</div>
					</Show>
					<Show when={props.user?.email}>
						<div style={{ "font-size": "12px", opacity: "0.6", "margin-bottom": "8px" }}>
							{props.user!.email}
						</div>
					</Show>
					<form method="post" action="/portal/logout" style={{ display: "inline" }} onSubmit={handleLogoutForm}>
						<button type="submit">Sign out</button>
					</form>
				</div>
			</aside>
			<main class="content">{props.children}</main>
			<Toaster />
			<ConfirmHost />
		</div>
	);
};

export default PortalLayout;
