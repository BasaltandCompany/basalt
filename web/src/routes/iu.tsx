// /iu moved to /case-study when the client was anonymized; sent outreach
// emails still link here, so redirect instead of 404ing.
import { redirect } from "@solidjs/router"

export default function IuRedirect() {
	throw redirect("/case-study")
}
