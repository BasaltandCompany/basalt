# Mad Cactus ICP

**Who:** Owner-operated Indiana companies, $10-70M revenue, knowledge-heavy work, with no CTO and no full-time developers. The AI opportunity is real but nobody technical is in the building.

**Why this band:** Above $70M most have at least a small dev team or an IT director who becomes the gatekeeper (and says no). Below $10M there's often no ops pain worth a brain. $10-70M with owner-led decisions = the CEO *is* the buyer and feels the scatter personally. (Revised Sept 2026: $30M floor dropped after the freight pull showed the in-band no-tech intersection is nearly empty — and 2 of 3 shipped targets, Flora $12.2M and MO Strategies $6.1M, sit below $30M. Revealed filter: visible success + owner access, not revenue.)

## Hard filters (must pass all)

| Filter | Test | Fail → |
| --- | --- | --- |
| Indiana HQ | Address/city, not name tokens (Franklin, Anderson etc. exist nationwide) | drop |
| $10-70M revenue | IBJ/Inc/Buzzfile/ZoomInfo estimate; sanity-check rev/employee $150-500k | drop |
| Owner-operated | Founder/CEO still running it, not PE roll-up with shared corporate IT | drop |
| No real tech team | LinkedIn people search: ≤6 hits for CTO/VP Engineering/IT Director/"software engineer"/"developer" | drop |
| Knowledge-heavy | Their product is judgment, relationships, data-wrangling, compliance — not physical goods or software | deprioritize |

**Two pain axes (Oct 2026, Flowscope study):** knowledge scatter (what our brains fix) and transaction volume (what process agents fix — invoices, AP/AR, month-end close, hiring). Score both; a company with both axes is a top target. Transaction-only companies are process-automation wins (Flowscope's game), not brain wins.

## Industries, ranked by brain-reuse

The three shipped brains are templates. A new target in the same industry = swap the data sources, keep the skeleton.

1. **Freight brokerage / 3PL / logistics** — koola-brain (Shipper Radar: public bills of lading + FMCSA vetting) copies almost verbatim to any IN freight broker or carrier.
2. **Mid-size law firms** — flora-brain (regulatory radar: USCIS trends, Visa Bulletin, court/policy data) re-points per practice area: immigration → family → personal injury → business litigation.
3. **Government affairs / public affairs / political consulting** — mo-strategies-brain (Congress + FEC + Federal Register watch) copies verbatim to any lobbying or public-affairs firm.
4. **Insurance brokerage** — benefits/Medicare/Medicare-adjacent regulatory watch + rate data (ESG Insurance profile).
5. **Staffing firms** — labor-market + compliance data (NCW profile).
6. **Specialty construction / MEP & industrial-services contractors** — permits, tariffs, materials-price data. Promoted Oct 2026: 2 of Flowscope's 3 named customers are contractors (Rush Resources, Trace Services), both founder-led, zero tech staff — the archetype buys (n=2; re-test the brain-reuse assumption).

## Where to find the lists

Ranked by signal-per-hour. Everything below is free or cheap unless noted.

**Cross-industry, already paying off (keep using):**
- IBJ Data Center / Book of Lists (ibj.com/lists) — Largest Private Companies, Fast 25, Largest Law Firms, Largest Accounting Firms, Corporate 100. Paid but the single best IN filter; free snippets + annual features cover most.
- Inc. 5000 (filter: Indiana) — revenue + 3-yr growth, free.
- TechPoint Mira Awards, IBJ Forty Under 40 — owner-led success signals.

**Freight/logistics:**
- FMCSA company census (keyless) — carrier counts, authority status, fleet size per company.
- ImportYeti — public bills of lading; search `q="indiana"` gives 100% IN-precision consignees (filter countryCode US, match address not name). Same data source as koola-brain's radar.
- FreightWaves Ratings by state, Transport Topics top-100 segments.

**Legal:**
- IBJ Largest Indianapolis-Area Law Firms (annual PDF).
- Best Lawyers / Best Law Firms rankings, Indiana Lawyer publication.
- Court data itself: firms appearing repeatedly in high-value commercial dockets = successful + scattered.

**Government affairs / consulting:**
- Indiana lobbyist registry (free, state-published) — every firm registered to lobby in IN.
- IBJ "Lobbyists" topic coverage; The Manifest / Clutch Indianapolis public-affairs directories.

**Revenue/headcount fill-in for private companies (the $30-70M check):**
- Buzzfile (free tier: state + industry + employee-range filters — best bulk pre-filter).
- ZoomInfo / Mergr / CompWorth free profile pages for spot estimates.
- D&B free business profiles as tiebreaker.

## 5-minute tech-gap verification (per company)

1. LinkedIn company page → People tab → search titles: `CTO`, `VP Engineering`, `IT Director`, `software engineer`, `developer`, `data engineer`. **0-6 hits = qualify.** A real tech org has 5+ per 100 employees.
2. Check total headcount. 15-250 employees + $10-70M = right size.
3. Careers page / Indeed: no engineering postings = confirmed. **Postings saying "hiring first developer" = strongest possible timing signal.**
4. Website: no product/engineering pages, template vendor sites, no GitHub org.
5. Any dev-adjacent person found → check seniority. One sysadmin doing IT support ≠ a tech team.
6. Ops layer: does the People tab show a CFO/controller or recruiters? (the funnel's `ops_trigger` evidence — the buyer layer Flowscope's customers all had)

Score 5 min/company by hand; batch 20 in an hour. Automatable later via Clay/Apollo title-headcount filters — don't build until manual volume demands it.

## Scorecard (0-3 each, work anything ≥10)

| Signal | 3 | 0 |
| --- | --- | --- |
| Industry brain-reuse | Same as shipped brain | New skeleton needed |
| Visible success | Fast 25 / Inc 5000 / awards | Unknown |
| Visible scatter | Public chaos signals (growth, hiring, ops mess) | None visible |
| Owner access | Founder/CEO still running it, not a PE roll-up (funnel gate: `owner_led`) | Layered exec team / PE roll-up |
| Timing / AI signal | An employee self-labels AI on LinkedIn, any role (funnel gate: `ai_signal` — see below) | Nothing pressing; zero AI signal anywhere |
| Finance/ops layer | CFO/controller/business manager visible in roster (`ops_trigger` pass) | None visible |
| Hiring machine | High-volume recruiting run manually (recruiting titles, SMS hiring, always-on posts) | None |

## Weekly loop (feeds ASPTR-212)

1. Pull one list (rotate freight → legal → gov affairs → insurance).
2. Hard-filter to Indiana + $30-70M + owner-led (Buzzfile/Inc/IBJ).
3. 5-min tech-gap verification on survivors.
4. Score, take top 5.
5. Build brains on public data, Loom, send. Gift = the setup; business = everything after.

## AI signal — the locked promotion rule (funnel stage `ai_signal`)

**The only promotion signal is an employee who self-labels AI** — any role, in their current LinkedIn self-label: headline, current job title, or listed skills. A small technical team using AI is the expected good case (BCW: Director of Ecommerce + offshore dev, 2 matches), not a disqualifier. An employee who writes AI into their own LinkedIn chose to say it; companies that don't care write nothing anywhere (Koola: 0 matches, never viewed the brain). **Past AI job titles are note-only** (`past-AI:` in the stage note) — never a pass, still a signal they could be doing something here now.

**Second promotion path (added Oct 2026, Flowscope study):** an `ai_signal` FAIL no longer kills an item when the trigger path fired — `ops_trigger` pass (the finance/ops buyer layer: CFO/controller/COO/business manager, or ≥2 recruiting titles) AND `owner_led` pass. Implemented in `applyVerdictConsequences` (web/src/lib/funnels.ts); it never promotes before `ai_signal` has actually run, and `ai_interest` stays null on this path — observed behavior still owns ai_interest. Evidence: 2 of Flowscope's 3 named customers had zero employee AI self-labels.


The roster scan is full: `/search-person` paginates 25 people/page up to `maxRosterPages` (stage param, default 10 = 250 people ≥ the funnel's 250-headcount ceiling). Credit math: 1 credit per page that returns people (~3–4 pages for a typical ICP company), identical pages deduped free for 30 days, and the completed roster is cached on the item forever — every re-run, re-score, and later read costs 0. Rosters cached partial (legacy page-1 pulls, quota-cut pages) **auto-backfill on the next AI-signal stage run**: pagination completes, the item re-scores, latest verdict wins. The upstream `tech_team` gate (≤6 tech titles in its 25-person sample) is deliberately unchanged — it stays a calibrated sample, not a full-roster count.

| Evidence | Verdict | aiInterest |
| --- | --- | --- |
| ≥1 employee AI match + site corroboration | pass | high |
| ≥1 employee AI match, nothing else | pass | some |
| Site-only evidence (AI copy, widget, privacy clause) | fail — `tier2` note for manual rescue | — |
| Visible, zero signal | fail, `tier3` | — |
| No domain, no roster, no evidence | fail, `tier4` ("barely have a phone") | — |

**Vendor-hint is a separate, note-only signal** — a brand-matched outbound `.ai` product domain (finemark.ai) or AI-product marketing (Finemark, ShipSigma) lands in the note as `vendor-hint: …` for slot-time judgment and never changes a verdict. The website scan corroborates only: it upgrades recorded strength (`some`→`high`), never passes a company; privacy-clause and chat-widget hits are weak and don't corroborate either. Expected pass volume: tens, not hundreds — the study found 93% of the visible 1,367-company tail had no signal at all, and only 11 of 73 visible companies had raw matches.

## Sell the outcome, not the AI (business-lens, Oct 2026)

The Flowscope study (docs/case-studies/flowscope-customer-signals.md) and the corpus agree with Collin's reframe: buyers don't wake up wanting AI — they wake up with pain. We sell the outcome; AI is the delivery mechanism, almost never the message.

> **Source:** [BOOK] $100M Offers — Hormozi (loc 989) — "The pain is the pitch." If you can articulate the pain a prospect is feeling accurately, they will almost always buy what you are offering.
> **Source:** [VIDEO] AlexHormozi (transcript fr78adfAnuA, line 386) — "no one cares. They just care about the outcome."
> **Source:** [BOOK] Ogilvy on Advertising — Ogilvy (loc 3728) — "Advertising which promises no benefit to the consumer does not sell, yet the majority of campaigns contain no promise whatever. (That is the most important sentence in this book.)"
> **Source:** [BOOK] Ogilvy on Advertising — Ogilvy (loc 3730) — benefit-promise headlines are read by 4× more people.
> **Source:** [BOOK] The Mom Test — Fitzpatrick (ch. 2) — "Talk about their life instead of your idea"; mentioning your idea too soon is the big mistake.

Rules this forces:

1. Every email, teaser, and Loom leads with THEIR number (invoices matched, bank lines reconciled, hiring hours back) — never with "AI." AI words in the pitch are a jargon tax; in the delivery they're fine. The dispatcher's frozen templates stay verbatim — this rule governs anything written NEW (Loom scripts, brain docs, subject lines).
2. The gift is the proof: a brain full of their numbers demonstrates the outcome before anyone says "artificial intelligence."
3. AI self-label ≠ buyer readiness — hence the second promotion path above. Flowscope's buyers weren't AI-enthusiasts; they had ops pain and a trigger event.
4. The dispatcher hard rule stands: `ai_interest` is filled only from observed behavior. This section changes the PITCH, not the measurement.
