import Brand from "~/components/Brand";

export function Header() {
	return (
		<header class="top-bar">
			<div class="top-bar-inner">
				<a href="/" class="logo-link">
					<span class="logo-wordmark"><Brand /></span>
				</a>
				<a href="/portal/login" class="top-bar-signin">
					Clients
				</a>
			</div>
		</header>
	);
}
