# Client Onboarding Playbook

The repeatable path from "new client" to "value shown in their portal." Each
phase maps onto components that already exist — an onboarding engagement is
just a project whose deliverables are the phase checklists, and a post-mortem
is just a doc. No special tooling to remember; this doc is the checklist.

**The client-facing value page is proof-of-work, not dollar ROI.** `/portal/value`
leads with counts the system tracks automatically (deliverables completed,
updates posted, PRs reviewed, hours). Savings dollars appear only for tools the
admin marks client-visible — see "Telling the value story" below. Everything on
that page is a fact, never a claim.

---

## Phase 0 — Pre-kickoff (before any meeting)

- [ ] Company + contacts in the CRM (`/admin/companies`), aliases set for the meeting publisher.
- [ ] **SaaS audit**: list every tool being replaced → `tools` rows on the company (name, what it cost them monthly, cutover date blank while planned). This is the baseline the savings math accrues from — get the costs right.
- [ ] **GitHub App on the client's repos**: start from `/admin/github` → install the Basalt GitHub App on the client org/repos, then map the installation to the company (`companyId`, set by hand) and confirm the PR reviewer is enabled. PRs link to deliverables by the DEL-<n> key in the branch/PR title — give every deliverable its key at kickoff.
- [ ] Portal invites: add members to the company (Supabase invite email sends automatically from `admin-queries.ts`). Confirm each member lands on `/portal` and can set a password. Resend from the company page if the invite expires.
- [ ] Brain/workspace setup: brain entity page attached to the company; outreach/docs wiring if this grew out of a prospect.
- [ ] Engagement project created (hourly/project/retainer + rate or fixed price).

## Phase 1 — Kickoff

- [ ] Kickoff meeting → transcript lands in the dashboard as a doc.
- [ ] Create the engagement's deliverables from the agenda (see template below) — deliverable titles ARE the checklist the client sees.
- [ ] Confirm which SaaS tools get replaced first; move each `tools` row's notes → target cutover.
- [ ] **48-hour clock**: quote accepted → portal invites sent + first deliverable update posted within 48 hours. Value they didn't ask for, fast — that's the point.

### Kickoff agenda template

1. Current stack walk-through: which tools, what they cost, what hurts.
2. What "replaced" means for each tool (full retirement vs. partial).
3. Deliverable list sign-off — client agrees on names + order.
4. Cadence: weekly time entries, deliverable status updates, monthly invoice.
5. Access: what accounts/API keys we need, who owns them.

## Phase 2 — Build + cutover

- [ ] Log time entries against the project, tagging the deliverable when the hours map to one (the rollup shows `Xh logged` on each deliverable card).
- [ ] Post a deliverable update at every meaningful milestone (client sees it in the portal).
- [ ] **On each cutover: set the `tools` cutover date.** Savings start accruing that day, prorated daily. This one click is what turns the build into a visible money number.
- [ ] Monthly: invoice from time entries, mark deliverables completed, sanity-check `/portal/value` from the client's seat (proof counts always; savings dollars only for client-visible tools — never fees).

## Phase 3 — Post-mortem (within a week of the final deliverable)

- [ ] Retro doc on the project (template below), shared to the client if it's useful to them.
- [ ] Verify invoices reconcile with time entries (admin project page totals).
- [ ] Snapshot the numbers in the retro: gross saved, fees, net ROI (admin company page), hours by deliverable.
- [ ] Next steps: either a follow-on project or a clean close (project status, final invoice paid).

### Post-mortem question template

1. What did we replace, and did the replacement actually stick?
2. What went faster than expected? What dragged?
3. What would we cut from this onboarding next time?
4. Does the client want to keep working together — on what?
5. Numbers: saved-to-date, hours, net ROI, invoices vs. hours.

---

## Where everything lives

| Thing | Where |
| --- | --- |
| SaaS tool + cost + cutover | admin company page → Replaced SaaS Tools |
| Client's view of value | `/portal/value` (proof strip; savings only when client-visible) |
| GitHub App installs + PR reviews | `/admin/github` (map installation → company there) |
| Net ROI (admin-only) | admin company page stat strip |
| Hours + deliverable link | admin project page → Log Time |
| Onboarding checklist | deliverables on the engagement project |
| Portal access | admin company page → Members (invite/resend) |


## Telling the value story

The client page shows proof of work first; dollar savings are a supporting fact,
never the headline. The trap is real: BCW's Jotform subscription is $220/yr
(rising to $468 at renewal — Eric Brownell's own words, Nov 16), and Eric
rejected the first ~$26k quote because "the investment needs to make sense
beyond replacing that subscription." A "$220 saved" stat next to a five-figure
engagement re-arms that objection every time they log in.

- Enter EVERY replaced tool in the ledger (admin company page) so net ROI stays honest — your books, not theirs.
- Tick `clientVisible` on a tool only when the replaced subscription is material to the engagement (a client dropping a $800/mo SaaS: yes; Jotform at BCW: no).
- Risk-avoided value (e.g. ADA compliance vs. BCW's prior ~$30k violation) is a talking point from the company notes, never a dollar line on the client page — it's our claim about our worth, not their fact.
- The client ascribes value from the proof counters. Let them.

## Verification (run at every onboarding)

1. Admin: create company + contact → invite email arrives → member sets a password → lands on `/portal`.
2. Portal: click the project card → `/portal/projects/<id>` shows deliverables with status + updates + hours.
3. `/portal/value` shows the proof strip (deliverables completed, updates, PRs reviewed, hours); the savings section appears only when a client-visible tool has a past cutover date.
4. Admin: log a time entry + post a deliverable update → both show up in the portal.
5. Portal: open a sent quote and sign it → quote shows accepted.
## Invite email (rebranding note)

The client invite email is **generated**, not hand-edited: edit
`web/src/emails/InviteEmail.tsx`, run `bun run emails:build` in `web/`, commit
the regenerated `supabase/templates/invite-email.html` + `invite-subject.txt`,
then paste both into **Supabase dashboard → Auth → Emails → Invite** (the one
manual step — Supabase stores dashboard templates separately from config.toml,
which only covers local dev).
