# MadCactus LinkedIn companion

Plain MV3 extension, no build step. Puts the manual LinkedIn loop in one place:

- **Popup** — today's approved connect list (`GET /api/outreach/invite-queue`),
  click-to-mark-connected (`POST /api/outreach/invited`), header shows the
  server-enforced budget (≤20/run, 100/wk).
- **Profile button** — "＋ MadCactus" bottom-right on `linkedin.com/in/*` posts
  the person + current company as a `stage=candidate` row
  (`POST /api/outreach/candidates`). Fit review still happens by hand at
  `/admin/outreach`; if the company can't be read off the profile, the button
  disables with a tooltip.

## Install

1. `chrome://extensions` → Developer mode → **Load unpacked** → pick this folder.
2. Open the popup once: dashboard URL defaults to `https://basalt.ac`
   (use `http://localhost:3001` for local dev), paste an admin `mc_` key, Save.

Posts from profile pages relay through the tiny service worker
(`background.js`) — content scripts are bound by the page's CORS and the key
should never enter the LinkedIn page context.

New dashboards other than basalt.ac / localhost:3001 need a matching
`host_permissions` entry in `manifest.json`.
