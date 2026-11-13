# BCW-Lookalike ICP — importer / wholesale product companies

**Added Oct 2026.** Sub-ICP alongside the knowledge-heavy ICP (outreach/ICP.md). Different pain axis — **transaction volume**, not knowledge scatter — so the sell is process automation, not a radar brain. Anchor: **BCW Supplies, the gift-first play that converted** (bcw-hub-mcp → client). This doc exists because the current ICP.md "knowledge-heavy" filter would deprioritize exactly these companies, and one of them is now our best client.

## The anchor: BCW Supplies

- BCW Supplies (BCW Diversified Inc), **Middletown, IN** — founded 1981, ~45 years, still independent.
- **What they make/sell:** protective supplies for collectibles — trading-card sleeves & toploaders, comic bags/boards/boxes, gaming accessories, coin & currency supplies, vinyl-record storage, memorabilia displays. Roughly 900+ SKUs.
- **Channels:** D2C ecommerce (Magento, bcwsupplies.com) **+ B2B wholesale** to distributors and game/comic retailers; "Made in USA" line (~98 SKUs) alongside heavy **China imports** (public bills of lading show suppliers like Orituo Packaging Ltd).
- **Tech footprint:** Director of Ecommerce + offshore dev. 2 LinkedIn AI self-labels → `ai_signal` pass. CEO is tech-forward and explicitly wants to grow the AI footprint (first-hand).
- **Size — open question:** public estimates say ~$8-10M / ~26 employees (ZoomInfo/Kona). Collin's number: $70M. Verify on the next call — third-party estimates lag badly on private companies, but the lookalike band depends on which is right. The $10-70M ICP band covers both.
**BCW similarity profile (Nov 2026 — the lookalike axes, after the 2026-11-03 ImportYeti finding):** BCW's own ImportYeti record shows **2 lifetime sea shipments, last spotted 06/08/2024** — the best client is nearly INVISIBLE on ImportYeti (manifest confidentiality + consolidator/forwarder routing). Consequence: **heavy ImportYeti visibility anti-correlates with the BCW shape** — the Bendix/Dana-class heavy shippers have logistics departments, not the scatter. So shipment volume is a WEAK-TO-INVERTED similarity axis: use "light-but-present (1-300 lifetime)" as a positive, treat 10k+ as deprioritize, never as the target.
- **Funnel v2 axes (similarity, not location-first):** headcount **15-60** (BCW ~26 LinkedIn actives); revenue **$8-70M** (public est. $8-10M vs Collin's $70M — band stays wide until verified); tech team **≤6, ideally 1-3** (BCW: ecommerce director + offshore dev); **ecommerce + wholesale site evidence** (storefront + wholesale page — the site scan stage); **ai_signal** (the stage IS the "AI signal field" — employee self-labels via Prospeo roster, already working). Location: Midwest region preference at discovery, never a gate — Indiana alone starves the funnel. **Shipment band (Collin's rule, Nov 2026): NO volume = neutral, never a signal** (many simply haven't filed confidentiality); **volume present → below ~1k = BCW-like** (cap is a calibration knob, not settled); heavy (10k+) = deprioritize.
- **Discovery for v2:** Prospeo /search-company (rail B pattern): industry = wholesale/distribution + headcount 11-200 + Midwest geo — NOT ImportYeti-first (visibility bias). ImportYeti (API + UI) stays as enrichment/insight (suppliers, slug, deep scrape) on qualified companies, and the UI address-harvest stays the free Indiana-specific rail.

**Engagement structure (from Eric's emails, Oct 2026):** BCW runs on **EOS** — weekly 90-min **AI L10** meeting (Eric, Gabe Gurman, Ben, Luke) sets priorities and assigns work. **Gabe Gurman (KnowledgeNet) is the fractional CTO** — owns architecture, agent strategy, roadmap; Collin is the technical-execution-and-judgment layer (≤20 hrs/wk, $120/hr, weekly invoices). Eric's stated buying preference: proposals with **"scope, deliverables, timeline, and fixed project price"** — use that structure for any defined workstream. First "additional workload" meeting: Nov 3, 2026 (Teams).

## Lookalike definition (score like ICP.md — nothing drops on a single fail)

| Filter | Test |
| --- | --- |
| Geography | Indiana HQ first tier; OH / IL / MI / KY / WI second tier |
| Shape | Importer or wholesale distributor of physical goods, or manufacturer with its own ecommerce storefront; Asia/China sourcing; large SKU catalog (100+) |
| Size | $10-70M revenue, 11-200 employees, rev/employee $150-500k sanity check |
| Owner-operated | Founder/CEO still running it — family-held legacy companies dominate this vertical (BCW: 45 years) |
| No real tech team | Same 5-min check (outreach/ICP.md): ≤6 tech titles in LinkedIn people search |
| Ecommerce evidence | Magento / Shopify / BigCommerce storefront; Amazon / eBay presence |
| Customs evidence | Consignee in public bills-of-lading data (free — see rails) |
| ai_signal | **Unchanged — still the only promotion gate** (outreach/ICP.md) |
| Ops layer | CFO / controller / ecommerce director / ops manager visible (`ops_trigger`) |

**Adjacent verticals, not BCW competitors:** same shape, different product category — pet supplies, promotional products, party supplies, hobby, automotive aftermarket, industrial consumables. Competitors (Ultra PRO etc.) are the fallback, not the target: they watch each other and are the most clued-in buyers. Collin's call, Oct 2026.

## Where to find them (ranked by credits-per-discovery)

| Rail | Source | Cost | Notes |
| --- | --- | --- | --- |
| 1. Address search (UI) | ImportYeti website via Orca browser tab (logged in): `/search/addresses?q=<city>` per city, harvest rows labeled **Company** (name, slug, shipments, address) — orca-eval DOM harvest loop | 0 API credits | **Proven Nov 2026: 246 IN companies from 30 city queries, imported to the funnel.** The API has NO state filter and phrase/HS scans returned ~zero Midwest (coastal DC bias in BOL addresses); this rail replaced them. Cookie is httpOnly — scraper IMPORTYETI_COOKIE must be pasted by hand. |
| 2. Gen Con Indianapolis | Exhibitor lists (annual, public) | 0 | Largest tabletop-games event in North America, in BCW's backyard; BCW exhibits there. Exhibitors = game & accessory manufacturers, many Midwest — the exact ecosystem. |
| 3. Buzzfile free tier | IN + Wholesale/Distribution + 11-100 employees | 0 | Bulk pre-filter, same as main ICP. |
| 4. IBJ Book of Lists | Largest Private Companies, Fast 25 | paid | Already in the stack; importers/distributors appear here. |
| 5. Trade associations | GAMA (game manufacturers), PPAI (promotional products), Toy Association, pet-products distributor associations | 0–cheap | Member/exhibitor directories = curated lists. |
| 6. Prospeo rail B | IN + industry enum + 11-200 headcount | ~1 credit/25 cos | Fill-in, not primary discovery. |

Verification: the ICP.md 5-minute tech-gap check unchanged, plus a BuiltWith/Wappalyzer spot-check for the storefront platform.

## Pain map (what they actually buy — transaction volume)

Ranked by urgency in 2025-26:

1. **Tariff & customs ops** — HS classification, duty-exposure mapping, landed-cost models, re-quoting after tariff changes. Every China-importing product company is bleeding on this right now; BCW lives it. This is the wedge.
2. **Product content ops** — hundreds of SKUs of titles/copy/attributes across Magento + Amazon + eBay + wholesale PDF catalogs.
3. **B2B order ops** — order entry, quotes, invoices, AR follow-up, EDI for retail chains.
4. **Inventory ops** — forecasting, reorder points, clearance pricing.
5. **Customer service** — order status and returns across D2C + wholesale accounts.

Sell the outcome per ICP.md: lead with THEIR number (duty dollars, catalog hours, late AR), never with "AI."

## The gift that fits this niche

koola-brain's public-BOL radar copies almost verbatim — same data source, different output: **a tariff/landed-cost map of THEIR imports, built from their public bills of lading.** Personal, demo-able, impossible to fake — the same shape of gift that closed BCW (zchangd: a personalized demo makes the sale ~10× easier; Hormozi give-first: over-deliver, stack the IOU).

## Lead magnet note

The niche gift above is the lead magnet. The "3 months of Claude covered" idea can ride along as a book-the-call hook — Claude does support gifting (claude.ai/gift) — but it doesn't lead cold outreach: it solves the prospect's "I want Claude" problem, not an ops problem, and it reveals Anthropic's product rather than ours (Hormozi: a lead magnet is "a complete solution to a narrow problem… which reveals another problem solved by your core offer"). It also attracts freebie-seekers alongside real buyers. Fix the math before quoting a value: Max is $100/mo (5×) or $200/mo (20×) — three months is $300-600, not $1500. Skeptical operators discount inflated numbers (Ogilvy: "The customer isn't a moron. She's your wife.").

**The gift rule (Oct 2026, from the BCW discovery call):** the niche gift is a solved slice of something they ALREADY PAY FOR — a human, a contractor, a broker fee, a tool subscription. Munger's machine-tool line is the frame: "The man who needs a new machine tool and hasn't bought it is already paying for it." Tokens or generic AI capacity fail this test — nobody wakes up wanting tokens. Hand back 10 hours of the catalog contractor's invoice and the next problem (us) is sitting right there. The concrete gift comes out of the Oct 2026 discovery call, not from guessing.

**THE LEAD MAGNET (final v6, Nov 2026): "Your first AI employee, built free — running on my dime for its first $500 of work."** Reply 'build' → 15-min call to pick the job → ONE bounded agent built free, theirs to keep + $500 of free fuel (Collin's API key via llm-proxy, per-client hard spend cap, alerts at 50%/80%). When credit runs low → the conversion call: "what would you like to do?" — keep (move to your own key, 5 min, agent stays) or expand (paid scope). Pro-sub gift DROPPED — one clean prize.
- **Why tokens beat everything tried (book test):** the gift prepays the exact bill they'd otherwise pay (fuel for the agent), the stated value is $500 while actual burn at importer volumes is ~$30-75/mo (= 6-16 months free — perceived value at near-zero real cost, the Hormozi dial), and the running-out moment IS the sales call, taken voluntarily, about a system already running their ops. Keep-option preserves "yours to keep, no strings" literally.
- **Wording rule (judged against $100M Leads):** neither "agent" nor "automation" leads — "AI employee" maps to the payroll line they already pay. Name A/B: "first AI employee" vs "automate your team's worst workflow" — per-campaign LEARNING line picks the winner.
- **Guardrails:** ONE build per taker; cap "2 free builds/month" (real scarcity — BCW fills the calendar); ~4-6 hrs/build via niche skeletons; call + access self-selects; hard spend cap + 50/80% alerts (metering makes the follow-up legitimate — without usage numbers it's 'just checking in'). One-pager = call-prep (the three candidate jobs + the fuel math). Evidence: BCW = free working thing → client, n=1.
- **Ladder (v6):** rung 1 = findings email (their import numbers) + "reply 'build' and I'll build your first AI employee, free — its first $500 of work is on me" (A/B variant: "automate one of your team's worst workflows, free") → reply → 15-min call (walk the one-pager: the three candidate jobs + fuel math, pick one) → free build running on Collin's key with a $500 spend cap + 50/80% alerts → credit runs low → "what would you like to do?" (keep: own key, 5 min; expand: paid fixed-scope, risk-reversed — "doesn't save $X in 30 days, you don't pay" — $100M Offers line 3277). Cap: 2 free builds/month, stated.

**ImportYeti has an official API** (docs.importyeti.com — PowerQuery over US import/export BOLs, HS-code filters, free value-list calls, even MCP tools). Discovery rail = API client, no scraper, no agent. CDL's stack already integrated this API once — lift the client pattern from there before writing fresh.
