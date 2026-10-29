# Flowscope customer signals — reverse-engineering their buying triggers

**Date:** Oct 2026 · **Method:** ran our ICP.md hard filters + scorecard against every named Flowscope customer · **Confidence labels:** (H)igh / (M)edium / (L)ow · **Sample size warning:** n=3 named customers. Every finding is labeled n-supported vs single-company anecdote.

**Verdict up front: our current filters would have caught at most 1 of Flowscope's 3 named customers (Trace, and only barely — it's likely under our revenue floor). Rush Resources fails our `ai_signal` promotion gate outright (zero employee AI self-labels anywhere), and Momento fails the no-tech-team hard filter (in-house engineers, proprietary AI models). Flowscope is winning companies our funnel is built to skip. The gap is motion-driven, not list-driven — details in §4.**

## 1. Customer roster

Flowscope's entire public named roster is the 3 homepage testimonials. Their seed post claims "embedded in more than 10 companies" — all other customers are unnamed ([seed post](https://www.flowscope.com/blog/seed-round)). Raw-HTML sweep of the homepage found a logo wall of exactly two images (rush-resources.png, trace-services.png) plus SOC 2 / GDPR / HIPAA badges — no hidden roster.

| Company | Person | Their tag | Resolution |
| --- | --- | --- | --- |
| Rush Resources, LLC | John Rush Jr., Founder & CEO | industrial services | Resolved (H): [rushllc.com](https://rushllc.com/about/), Houston TX; the only "Rush Resources" with a CEO John Rush; court record ([Justia](https://law.justia.com/cases/federal/district-courts/texas/txedce/6:2020cv00005/194771/82/)) confirms John Rush as CEO |
| Momento (Momento Seguros) | Lois Rogel Vence, co-founder & CEO | "insurance group" | Resolved (H): [YC](https://www.ycombinator.com/companies/momento), [tumomento.com](https://www.tumomento.com/), Mexico City digital auto insurer; "group" is loose marketing — single CNSF-licensed carrier |
| Trace Services, LLC | Russ Phillips, Co-founder / Managing Member | mechanical and electrical contracting | Resolved (M-H): [TN license records via BuildZoom](https://www.buildzoom.com/contractor/trace-services-llc), Jackson TN; Phillips has no public LinkedIn, title rests on license records + testimonial |

Selection-bias caveat: all 3 showcased quotes are founder/CEO voices because that's what makes social proof. The unnamed 10+ may not match this profile.

## 2. Dossiers

### Rush Resources — Houston, TX (industrial services contractor)

- **What they do:** capital construction, shutdown/turnaround, maintenance for oil & gas, petrochem, power (incl. nuclear). Commissioning, I&E, rotating equipment, SIS/automation ([about](https://rushllc.com/about/)).
- **Revenue:** $8M–$100M across brokers, all conflicting, **confidence L** — treat as unverified ([RocketReach](https://rocketreach.co/rush-resources-profile_b55b7f91f68f5251) $8.3M/203 emp; [CompWorth](https://compworth.com/company/rush-resources) $62.3M/200+; [Connexy](https://connexy.com/us-company/rush-resources/9100624) $100M/161).
- **Headcount:** ~150–210 incl. per-project contract craft workforce (L). ~18 named core staff on the site.
- **Owner-operated:** YES (H) — founded 2007 by John Rush Jr. (CEO) + father John Rush Sr. (President). No PE found (M). Note: CFO Kush Mathur hired 2025 from Energy Capital Investors (PE, $5B portfolio) via Goldman — a hire, not an investment.
- **Tech team:** ~0 (M-H). No CTO/dev/engineering hits anywhere; IT+systems live with the Manager of Business Operations (who also owns procurement and AR/AP).
- **Employee AI self-labels:** 0 found (M). No AI copy on their site. The Flowscope engagement is the only AI anything.
- **Systems:** nothing public. One telling artifact: an in-house SMS "Employment Messaging Program" running the full recruiting loop by text ([SMS terms](https://rushllc.com/sms-terms/)).
- **Bought:** agents running "our entire hiring and onboarding processes" — matches craft-hiring at volume + 3 named recruiters/onboarding specialists.
- **Hiring/news:** active craft recruiting; 2025 CFO hire is the big corporate event; HBS Club of Houston sponsor 2026.
- **Plausible radar entry:** founder's personal brand (John Rush Jr., ~21K LinkedIn followers, "Industrial Services Leader") made them trivially targetable; secondarily the 2025 CFO arrival — new finance execs are a classic outbound trigger.

### Momento — Mexico City (digital auto insurer, YC W22)

- **What they do:** first 100% digital auto insurer in Mexico; licensed carrier that underwrites, prices, and settles its own policies ([site](https://www.tumomento.com/), [YC](https://www.ycombinator.com/companies/momento)).
- **Revenue:** unavailable. Scale proxy: >100,000 active drivers (Sep 2025), policies 3×'d in 2025 → derived low-to-mid tens of $M GWP, **confidence L, derived not sourced** ([Contxto](https://www.contxto.com/en/funding/momento-seguros-raises-us10-25-million-in-series-a/), [LatinoInsurance](https://boletines.latinoinsurance.com/momento-seguros-acelera-crecimiento-digital-en-mexico)).
- **Headcount:** 127 (Mar 2026, +21% YoY) (M) ([Revelio Labs](https://www.reveliolabs.com/companies/momento-5046439/employees)).
- **Owner-operated:** founder-led CEO (ex-McKinsey) but **VC-backed** — Series A $10.25M (2025, Hedosophia + American Family Ventures) — not PE, not owner-operated in our sense (H).
- **Tech team:** STRONG in-house engineering — proprietary AI pricing/risk models ("tecnología propia"), own iOS/Android apps. **Fails our no-tech-team filter** (M, indirect but strong).
- **AI signals:** explicit company-level AI marketing; employee-level labels unavailable (LinkedIn walled).
- **Systems:** fully proprietary stack; nothing named.
- **Bought:** AP/AR automation after a finance-bottleneck review ([testimonial](https://www.flowscope.com/)).
- **News:** Series A 2025, one of only two Mexican insurtech rounds that year; national claims coverage; breakeven-path commentary Sep 2026 ([El Heraldo](https://heraldodemexico.com.mx/edicion-impresa/2026/9/2/esta-en-momento-correcto-para-ir-hacia-lo-seguro-880757.html)).
- **Plausible radar entry:** YC graph overlap — both companies are YC (M, inferred; no direct statement found).

### Trace Services — Jackson, TN (commercial MEP contractor)

- **What they do:** HVAC, electrical, plumbing, process piping, design-build for schools/municipal/commercial in TN/MS ([who-we-are](https://www.traceservicesco.com/who-we-are)).
- **Revenue:** unavailable — no datapoint anywhere; any number would be guessing. Scale anchors: single Memphis permit at $363k (Sep 2026), founded Jul 2022, two offices ([BuildZoom](https://www.buildzoom.com/contractor/trace-services-llc)).
- **Headcount:** no published count; 8 named leadership, "family-owned atmosphere" → likely under ~50 (L).
- **Owner-operated:** YES (M-H) — Russ Phillips + Nathan Wells Managing Members per TN/MS license records; no PE signals.
- **Tech team:** 0 (H). Leadership is construction/ops/finance: President, division managers, GM, controller, business manager.
- **AI self-labels:** 0 found (M).
- **Systems:** unavailable.
- **Bought:** an AI-opportunity discovery engagement that converted into an ongoing "AI partner" relationship — i.e., they bought the *relationship*, no specific workflow named.
- **News:** essentially none — Memphis expansion 2024, permits, an anniversary post.
- **Plausible radar entry:** unclear (L). Most plausible: outbound to fast-growing SMB contractors with visible back-office load (in-house controller + business manager + two-office expansion), or referral.

## 3. Filter crosswalk (geography recorded, never scored)

Hard filters (ICP.md):

| Filter | Rush Resources | Momento | Trace Services |
| --- | --- | --- | --- |
| Indiana HQ | ✗ Houston TX | ✗ Mexico City | ✗ Jackson TN |
| $10–70M revenue | borderline — sources conflict $8–100M (L) | borderline — GWP derived, VC-scale (L) | likely below — <50 emp ⇒ est. <$20M (L) |
| Owner-operated | ✓ family founder (H) | ✗ VC-backed founder-led | ✓ managing members (M-H) |
| No real tech team | ✓ ~0 (M-H) | **✗ in-house engineering (M)** | ✓ 0 (H) |
| Knowledge-heavy | borderline — judgment/compliance-heavy craft work, physical ops | ✓ underwriting/data/compliance | borderline — same shape as Rush |

Scorecard rows:

| Row | Rush | Momento | Trace |
| --- | --- | --- | --- |
| Industry brain-reuse | low (closest: specialty construction, our #6) | medium (insurance = our #4, but carrier not brokerage) | low (construction) |
| Visible success | moderate (HBS sponsor, founder brand) | high (Series A, 3× growth) | low (permits only) |
| Visible scatter | **strong** — craft hiring at volume run on SMS + spreadsheets | strong — 3× policies, +21% headcount | moderate — expansion, back-office hires |
| Owner access | ✓ (21K-follower founder) | ✓ (active CEO on LinkedIn) | ✓ (local, no digital presence) |
| Timing / AI signal (`ai_signal` gate) | **✗ zero self-labels — our gate fails this company** | n/a (walled; company-level AI only) | **✗ zero self-labels — our gate fails this company** |

**Crosswalk verdict: 0–1 of 3 caught.** Trace passes the qualitative filters but likely misses the revenue floor; Rush passes 4/5 hard filters and then dies at our locked `ai_signal` promotion gate; Momento dies at the tech-team wall. Only Trace would have survived the full funnel, and barely.

## 4. Signal deltas — the payload

**(a) Our signals that Flowscope's roster validates** (n=3, small-n confidence):
1. **Founder/owner is the buyer** — 3/3 testimonials are CEO/co-founder quotes; all still founder-led. Our `owner_led` gate is right.
2. **No in-house tech team** — the 2 zero-tech customers (Rush, Trace) are the cleanest archetype matches: systems run by ops people, back office between QuickBooks-era tools. Their own words confirm: "no in-house technology function" ([customer-four post](https://www.flowscope.com/blog/customer-four-delivery-models-leave-behind)).
3. **Visible scatter precedes the buy** — hiring volume, growth, expansion show up in all 3 dossiers.

**(b) Signals Flowscope's buyers share that our filters don't track:**
1. **Finance-ops trigger events** (n=2, M): a new CFO/Controller (Rush 2025) and AP/AR/close pain (Momento's actual purchase; the entire horizontal half of Flowscope's blog is finance-ops: procure-to-pay, cash application, month-end close, AR collections, three-way match, payroll, sales tax). Our scorecard has **no finance-ops row at all** — we score industry, success, scatter, access, and AI labels, but never "did a finance decision-maker just arrive or is the back office visibly drowning in transactions."
2. **High-volume transactional back office** (n=3 indirect): their homepage ticker brags in transactions (214 invoices matched, 1,380 bank lines reconciled) and their sizing logic is transaction-heavy, thin-margin verticals. This is a *different* pain axis than our knowledge-heavy filter: we hunt scattered judgment work; they hunt repetitive volume. Companies with both axes are the best fits; transaction-only companies are Flowscope's natural win (they'd buy process automation, not a brain).
3. **Hiring machine run manually** (n=1 strong): Rush's sale was the whole hiring/onboarding loop — a craft workforce recruited by SMS with no ATS. Concrete version of our generic "visible scatter" row.
4. **AI self-labels predict nothing here** (n=2, M-H): the two companies we could check had **zero** employee AI self-labels. Our locked promotion rule (`ai_signal`: an employee must self-label AI) measures pre-existing AI enthusiasm. Flowscope's buyers weren't AI-enthusiasts — they had trigger events (CFO hire, 3× growth, expansion) and ops pain. The gate would have blocked 2 of 3 of Flowscope's actual wins.

**(c) Our signals showing zero correlation with their wins:**
1. **Geography** — TX, MX, TN. By design; no change.
2. **Industry brain-reuse** — 2 of 3 named customers are **contractors** (industrial turnaround; MEP). Contractors sit at the bottom of our industry list (#6 "specialty construction, lower brain-reuse, still valid"). Insurance overlaps only if you count a digital carrier as "insurance brokerage" (we don't). Flowscope's vertical map (insurance brokerage, freight/3PL, staffing, accounting, MSP, wholesale distribution, healthcare RCM) overlaps our top-6 only on insurance/staffing/freight. The real shared target is a *profile* (owner-led, no tech team, back-office pain), not an industry list.

**(d) The motion lesson (bigger than any single signal):** Flowscope barely does signals-based sourcing at all. Their stated channels are **warm intros** ("if you know CEOs/CFOs at mid-market enterprises or PE operating partners, we'd love an intro" — [YC launch](https://www.ycombinator.com/launches/QJe-flowscope-agentic-process-mining-and-automation)), the **PE operating-partner channel** ("we work with some of the largest private equity firms in the US" — [seed post](https://www.flowscope.com/blog/seed-round)), and SEO. One customer (Momento) plausibly came through the YC graph. Notably, their flagship channel — PE portfolios — is exactly what our owner-operated filter excludes. We run an outbound machine they don't have; they run a trust graph we don't have. What transfers is their *trigger-event* lens, not their channel.

## 5. ICP.md recommendations (not applied)

1. **Add a scorecard row: Finance-ops trigger.** 3 = new CFO/Controller/ops-exec hire or visible AP/AR/close pain (job postings for AP clerks, staff-accountant churn, transaction-heavy ops); 0 = nothing visible. Evidence source: LinkedIn job-change posts, Indeed postings — same 5-minute pass as the tech-gap check.
2. **Add a scorecard row: Manual hiring machine.** 3 = high-volume hiring run on SMS/email/spreadsheets with no ATS visible; 0 = no hiring or real tooling. This makes "visible scatter" concrete.
3. **Add a second promotion path to the `ai_signal` gate** (do not delete the locked rule — it fits the gift motion): a company with owner access + a qualifying trigger event (CFO hire / growth event / manual hiring machine) is promotable with `ai_interest` left as observed-behavior-only. Rationale: the gate blocked 2 of 3 Flowscope wins; AI self-labels measure enthusiasm, not readiness.
4. **Re-scope "knowledge-heavy"** from a hard-ish filter to one of two pain axes: knowledge-scatter (our brains) vs transaction-volume (their agents). Score both; companies with both are top targets.
5. **Promote specialty construction / contractors** up the industry list (from #6): 2 of 3 named Flowscope customers are contractors, both founder-led with zero tech staff (n=2, M confidence). Our "lower brain-reuse" note should be re-tested, not assumed.
6. **Do not copy the PE channel** — it's their volume motion and our explicit exclusion. The overlap risk cuts the other way: PE portfolio companies are Flowscope's, everyone else is contestable.

## 6. Flowscope's own targeting intel (their words)

- **Stated ICP:** mid-market, ~100–250+ employees, "running on QuickBooks or NetSuite or a legacy ERP installed in 2007… a CFO, a COO… a layer of people who do manual work between systems every Monday morning… no in-house technology function" ([customer-four](https://www.flowscope.com/blog/customer-four-delivery-models-leave-behind)); frames 100–249 employees as the adoption sweet spot ([adoption-gap post](https://www.flowscope.com/blog/ai-adoption-gap-by-company-size)).
- **Buyers:** CEO/CFO/COO + PE operating partners ([YC launch](https://www.ycombinator.com/launches/QJe-flowscope-agentic-process-mining-and-automation)).
- **Motion:** forward-deployed agents they *run for you*; discovery by opted-in employee capture software (observation, not interviews); priced against measured savings ("services pricing + software economics"); wedge = writing back to legacy systems at the desktop/UI layer when there's no API ([writing-back post](https://www.flowscope.com/blog/writing-back-legacy-systems-without-api)).
- **Verticals with dedicated content:** insurance brokerage, freight broker/3PL, industrial staffing, accounting, MSP, wholesale distribution, healthcare RCM — plus a PE portfolio-operations play.
- **Traction:** $3.8M seed (Sep 29, 2026; YC, Red Forest Capital, Anderson Growth Partners, Outbound Capital, Latitude, X26, angels; PitchBook adds Phoenix Court); "embedded in more than 10 companies"; 2-person founding team ([seed post](https://www.flowscope.com/blog/seed-round), [YC](https://www.ycombinator.com/companies/flowscope)).
- **Trust posture:** SOC 2 / GDPR / HIPAA badges on the homepage — table stakes for touching finance/health data, and a note for our own positioning later.

## Sources tried / dead ends

- YouTube START pod interview — fetch failed (title/date only).
- El Heraldo Sep 2026 article — 400s on direct fetch; content via search snippet.
- LinkedIn employee-level searches for Momento — walled; marked unavailable rather than estimated.
- Prospeo roster scans — **not run**: no PROSPEO_API_KEY in the local Keychain cache (lives on Fly; `./scripts/pull-env.sh --refresh` + flyctl auth needed). Tech-team and AI-label evidence above is public web/LinkedIn instead, per the plan's fallback. Re-run possible later for prospeo-grade counts.
