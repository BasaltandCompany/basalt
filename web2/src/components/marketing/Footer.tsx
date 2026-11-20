import Brand from "~/components/Brand";

export function Footer() {
	return (
		<footer class="site-footer">
			<div class="footer-inner">
				<div class="footer-brand">
					<div class="footer-wordmark"><Brand /></div>
				</div>
				<div class="footer-meta">
					<small>&copy; 2026 Basalt</small>
					<div class="footer-links">
						<a href="/newsletter">Newsletter</a>
						<a href="mailto:cpfeifer@basalt.ac">Email</a>
						<a href="https://cal.com/cpfeifer/info-meeting" target="_blank">
							Calendar
						</a>
					</div>
				</div>
			</div>
		</footer>
	);
}
