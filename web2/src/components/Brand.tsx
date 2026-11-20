import { ParentComponent } from "solid-js";

/**
 * Serif "Basalt." wordmark — the brand mark on every surface (sidebar, logins,
 * marketing header/footer). Red period is the brand's one color; markup matches dashboard/mockups
 * (ink.css .sidebar-logo-text / .login-brand). Sizes are set by the parent
 * class so sidebar (18px) and login (24px) share one component.
 */
const Brand: ParentComponent<{ suffix?: string }> = (props) => (
	<span class="brand">
		<span class="brand-word">
			Basalt<span class="brand-dot">.</span>
		</span>
		{props.suffix && <small class="brand-sub">{props.suffix}</small>}
	</span>
);

export default Brand;
