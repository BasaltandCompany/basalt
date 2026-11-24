# Customs Data Lock: an AI embed that turned a family business into a software company

**Client:** Customs Data Lock (customsdatalock.com) — data privacy for US importers and exporters
**Engagement:** July 2026 – present (Phase 1 ops embed, Phase 2 website redesign, ongoing support retainer)
**Status:** DRAFT for Collin's review. Not published. Numbers flagged below need client sign-off.

---

## The challenge

Customs Data Lock (CDL) is a family business in Indiana. Eric Brownell runs it with his sons Cole, Parker, and Teghan. The product protects American importers: anyone's shipping records are public, and competitors can trace your suppliers and copy your product. CDL files confidentiality requests with CBP so those records get pulled from public view.

In July 2026 Eric brought me in. His words in the kickoff email: evaluate where the business stands, then "help mentor the team while moving projects forward." The team had built real automation on their own — Teghan had an enrichment framework running. But it was held together with Excel exports and Google Sheets, cold email went out with a 0.20% reply rate, the website was locked inside MarketPath (which blocked blog posts and case studies and sent contact forms from a MarketPath address), and nobody on the team had worked with a real software development lifecycle.

Eric wanted two things at once: a scalable business, and a genuine entrepreneurial education for his sons. The deal was explicit — the engagement had to leave the team more capable, not more dependent.

## What I did

**Embedded as the accelerator, not the manager.** I joined their weekly L10, sat in their Slack, and worked alongside the three of them. They owned the work. I owned architecture, code review, and the security-critical parts.

**Phase 1 — rebuilt the outbound engine (July–September).**

- Rewrote the enrichment pipeline with Teghan: Import Yeti discovery, Prospeo and Google Maps enrichment, deduplication, async jobs, credit caps. Roughly 10,000 companies with shipping data, suppliers, and contacts, flowing into a real database instead of spreadsheets.
- Taught Teghan Claude Code and the software development lifecycle as we went: worktrees, pull requests, code review, deploys. When a deploy wiped the Supabase database, we debugged it together on a call and recovered all ~10,000 companies.
- Built the campaign infrastructure: cold email sequences on 7–8 domains pushed to Instantly from the database, a cold-call cockpit with opener styles and outcome-based follow-ups, and per-company personalization pulled from the enrichment data.
- Found the wedge: Import Yeti's API exposes a confidentiality-status field the UI doesn't show. Companies whose 2-year opt-out had lapsed were pre-educated prospects who already felt the pain. We built whole campaigns around that signal — three campaigns split by filing status, one email sequence each.
- Worked the strategy side: narrowed the ICP to importers doing $25–50M with >80% concentration in one product (granite, specialty weaving, metal alloys), the consultant-first cold call script, the meeting-only pricing model, and the trade-organization pilot (AAFA, ~1,100 member brands).

**Phase 2 — the website they own (September–November).** A $20,000 fixed-fee project, 100-hour cap, to replace MarketPath with a Next.js site CDL fully controls: Supabase auth and database, Stripe billing, Resend email, PostHog analytics, server-rendered pages for SEO/AEO/GEO, a markdown blog that deploys on merge, and an engineering workflow (protected main, PR review, preview deploys, Claude skills + AGENTS.md) the team keeps forever. Cole designs, Teghan builds with Claude Code, I review every PR and build the security-critical pieces myself — auth, billing webhooks, per-customer data isolation.

**Then I got out of the way.** A support retainer ($3,500, through October 18) covers async unblocking and PR review while they finish. I was out for my wedding and honeymoon in October; they kept building anyway and queued PRs for review. That was the test, and they passed it.

## Outcomes

- **Revenue per work hour up an estimated 2.75x** (and revenue up ~175%) over the engagement window — same team, same hours. ⚠️ *These are my estimates, not audited numbers. See the reconciliation note below. Get Eric's sign-off before publishing.*
- **First enterprise contracts.** A customer that had already paid $399/year for the service re-upped at scale, and Canimex, a new enterprise client, onboarded in September on a custom quote — annualized, that one account is worth more than the entire book was in July.
- **Pricing power.** CDL went from a public $399 flat rate to quote-based tiers ($600–$1,000 standard, $1,000+ multi-entity, $2,000+ enterprise), validated by Eric's own rule after we workshopped it: never put your price online.
- **The pipeline runs without me.** Teghan ships backend features with Claude Code, Cole iterated the entire site design through five preview rounds with the family leaving structured feedback, and the deploy pipeline (GitHub merge → migration → Fly deploy) runs itself.
- **The new site went from first draft to launch-ready in under a month** — September 9 first draft, October 5 DNS step pending. Teghan had "95% of the back end done and the payment system set up" sixteen days in.
- **Sales fundamentals landed.** First-ever cold email reply in early August (a 0.20% reply rate baseline), then the segmented granite/marble campaign pulled 7 responses and a real opportunity from 222 emails — targeting lapsed filers, exactly the wedge the pipeline was built to find.

## Where they are now

Support retainer runs through October 18. We review what shipped at the November 3 L10 and scope the next engagement from there. The team's goal is 250 subscriptions by January 2027, now sold through meetings instead of a checkout page. The website goes live as soon as DNS moves off GoDaddy.

---

## Numbers reconciliation (internal — do not publish this section)

The homepage now attributes the 2.75x claim to the data privacy provider, not a public university. Collin confirmed on Nov 24, 2026 that the public numbers are verified; the older research corpus below did not include the underlying revenue endpoints. Obtain those records before changing the claim or publishing this named draft.

| Claim | Corpus evidence | Verdict |
| --- | --- | --- |
| Revenue roughly $2K/yr before | 8 subscriptions × ~$399 as of Aug 3 ≈ $3.2K annualized; Q3 company rock was "exceed $1,200" revenue (Sep 1) | Close; no document states "$2K" |
| Revenue $5–6K/yr after | Canimex enterprise onboarding (≈$450/mo ≈ $5.4K/yr informational figure, Sep 15); Atlas $399 (Sep 1); quote tiers $600–$2,000+ | Directionally supported; no document totals it |
| 2.75x / +175% | Arithmetic on the two numbers above (5.5/2 = 2.75; (5.5−2)/2 = +175%) | Internally consistent, externally unevidenced |

This older corpus supports the direction but does not itself contain the multiplier's underlying records. Collin has separately confirmed the published number; retain the correct attribution and request the original measurements for this named case-study draft.

## Candidate pull quotes (verbatim, attributed, dated)

1. "The goal is to leave the team more capable after every project than before it began." — Eric Brownell, kickoff email, July 13, 2026
2. "I like the direction on both the outreach and enrichment pipeline." — Eric Brownell, email, August 19, 2026
3. "I have what i belive to be 95% of the back end done and the payment system set up conncted to our services email" — Teghan Brownell, Slack #website-redesign, September 16, 2026 *(sic; trim to "95% of the back end done and the payment system set up" if the typos distract)*

No invented quotes. For a headline customer quote, ask Eric directly.

## Evidence ledger

Every narrative claim → source. Internal meeting IDs are Anarlog session ids.

| # | Claim | Source |
| --- | --- | --- |
| 1 | Family business; Eric + Cole, Parker, Teghan; Indiana | Kickoff email Jul 13, 2026 (thread "CDL - Project Evaluation & Next Steps"); L10 07/31/26 participants |
| 2 | Product: CBP confidentiality filings protecting public shipping records | Brain dossier takes; Teghan email to Gurpreet Sep 25, 2026 ("public shipping records", $399/yr); kickoff email |
| 3 | Eric's charter: evaluate, mentor, best practices, leave team more capable | Eric kickoff email, Jul 13, 2026 (verbatim quote #1) |
| 4 | Kickoff meeting Jul 17, 2026; Collin's 3-point recap | Collin email Jul 17, 2026 (same thread) |
| 5 | MarketPath blocked blogs/case studies, sent from MarketPath address, stale $199 references | Phase 2 proposal doc v8 ("Why This Project"); L10 09/01/26 (MarketPath fixed the $199 confirmation) |
| 6 | 0.20% cold email reply rate before; first reply = morale boost | Collin "CDL Update 1" email, Aug 18, 2026; Cool Fellas 08/05/26 (~550 emails → 1 positive, ≈0.19%) |
| 7 | Enrichment pipeline rewrite: Import Yeti + Prospeo + Google Maps, ~10,000 companies | Collin Update 1 email; L10 08/21/26 summary; Deployment Debugging Session Sep 10 (Supabase held ~10,000 companies) |
| 8 | Claude Code + SDLC training for Teghan | Collin Update 1 email ("teaching Teghan how to use Claude Code and the software development lifecycle"); "How Claude Works On Our Code" doc v2 |
| 9 | Deploy wiped Supabase; recovered ~10,000 companies together | Deployment Debugging Session, Sep 10, 2026 |
| 10 | Campaign infra: 7–8 domains, Instantly push from DB, cold-call cockpit with 4 openers + outcome follow-ups | Sales Discussion with Caden summary (Aug 3); L10 07/31/26 (cockpit demo); ImportYeti Scraping Fixes Sep 18 (campaigns from DB → Instantly) |
| 11 | Lapsed-confidentiality wedge; 3 campaigns by filing status | L10 07/31/26 (Collin discovered status field); ImportYeti Scraping Fixes Sep 18 (3-campaign decision) |
| 12 | Granite/marble campaign: 222 emails → 7 responses, 1 opportunity | ImportYeti Scraping Fixes, Sep 18, 2026 |
| 13 | ICP: $25–50M imports, >80% single product | Collin Update 1 email, Aug 18, 2026 |
| 14 | Meeting-only model; never put price online | Fathom recap Sep 8, 2026 ("meeting-only" adopted); Caden meeting note ("Don't ever put your price online"); brain take (removed public $3.99 rate) |
| 15 | Trade-org pilot (AAFA, ~1,100 brands) | L10 08/21/26; Eric raised trade associations first in Update 1 reply, Aug 19 |
| 16 | Phase 2 proposal: $20k fixed fee, 100-hr cap, $200/hr, 15 workstreams, full stack | "CDL Phase 2 Consulting Proposal: Website Redesign" doc v8, Aug 25, 2026 |
| 17 | Accelerator-not-manager framing | Collin email Sep 2, 2026; brain facts; proposal "Engagement Overview" |
| 18 | Roles: Cole designs, Teghan builds, Collin reviews PRs + security-critical | Proposal v8; brain facts (Cole and Parker spearheading, Collin accelerator) |
| 19 | Support retainer $3,500, through Oct 18, review Nov 3 | "CDL Technical Support Retainer" doc v6, Sep 23, 2026 |
| 20 | Out for wedding/honeymoon October; team kept building | Retainer doc timeline; homepage-case "queue PRs" plan in proposal timeline |
| 21 | 8 subscriptions as of Aug 3; goal 250 by Jan 1, 2027 | Sales Discussion with Caden, Aug 3, 2026; brain takes (goal restated at new pricing) |
| 22 | Atlas $399 closed; "best BCW month ever"; Q3 revenue rock $1,200 | L10 09/01/26 |
| 23 | Canimex enterprise onboarding; ACH; ≈$450/mo informational | L10 09/15/26; Canimex Onboarding email thread, Sep 19–21 |
| 24 | Pricing tiers $600–$1,000 / $1,000+ / $2,000+ | L10 09/15/26 pricing discussion |
| 25 | Website first draft Sep 9 → "That looks amazing" (Collin) → Eric's written critique Sep 16 → DNS pending Oct 5 | Slack #website-redesign full history, Sep 9 – Oct 5, 2026 |
| 26 | Teghan 95% backend + payments, Sep 16 | Slack #website-redesign, Sep 16, 2026 (quote #3) |
| 27 | Five design preview rounds with structured family feedback; Cole fixed live demo bug | Slack history; L10 09/15/26 (calculator vanished, Cole fixed live) |
| 28 | Deploy pipeline: merge → migration → Fly deploy; Collin fixed auto-deploy | L10 09/15/26; Deployment Debugging Session |
| 29 | Repos: teghan-cdl/cdl-pipeline, cdl-dashboard, cdl-enrichment (private) | GitHub search via `gh`, verified Oct 2026; pipeline description: "Durable enrichment pipeline for Customs Data Lock" |
| 30 | Invoice #0001 $14,000, paid after Oct 1 due date | Email thread "Re: Your payment for invoice #0001…", Oct 5, 2026; brain fact (invoiced Sep 16) |

### Coverage gaps (flagged, not guessed)

- Meetings reviewed in depth: kickoff era via email; Caden sales discussion (Aug 3); L10 07/31, 08/21, 09/01, 09/15; Cool Fellas 08/05; ImportYeti Scraping Fixes (Sep 18); Deployment Debugging (Sep 10). Not individually reviewed: L10 08/25, Website/Funnel/Pricing Strategy (Aug 26), Enrichment Debugging (Aug 27), Enrichment Working Session (Aug 31), Sales Outreach Strategy Feedback (Aug 18), Teghan Deliverability/Enrichment (notes only, no transcript). None of these are load-bearing for the claims above, but pull-quote candidates may be hiding in them.
- No document states the exact $2K → $5–6K revenue endpoints; see reconciliation.
- The 2.75x homepage claim was restored after Collin confirmed it is verified and corrected its client attribution; the older corpus alone does not establish its endpoints.

## Publishing checklist (Collin only)

1. Confirm or correct the revenue endpoints ($2K → $5–6K) from your own books.
2. Ask Eric for sign-off on the numbers and for one original quote.
3. Pick pull quotes; fix or trim the Teghan typo quote.
4. Decide the canonical client name on the page (Customs Data Lock vs CDL).
5. Only then: named site route. Keep the homepage claim attributed to the data privacy provider, never the university.
