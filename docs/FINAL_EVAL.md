# Final Evaluation (F-1 / FX-2) - 30-site campaign ledger

Canonical data root (read-only): `C:/Users/sandeep/pes/vs code/Capstone-Project`.
Machine-reproducible source: `tools/campaignTable.js` (parses `testing/site_reports/INDEX.md`).
Pilot field map: `docs/INDEX_PILOT_FINDINGS.md`. Template: `docs/SITE_RUN_REPORT_TEMPLATE.md` (schema 0.1).

> **Definition (binding):** "fusion value" here = **campaign share** (fraction of the final test set attributable to the fusion stage), NOT success-vs-truth of this engine. Success-vs-truth requires a business-value oracle, which does not exist (see limitation below).

## Method
- Per-site rows parsed from `testing/site_reports/INDEX.md` (39 registered rows).
- Citable = row has a numeric fusion% AND is not contaminated/do-not-cite. Blocked and contaminated rows are retained as evidence but excluded from aggregate means.
- Means are unweighted arithmetic mean of per-site fusion% with explicit n and summed numerator (shown so the reader can reproduce by hand). The displayed tier means are exactly those emitted by `tools/campaignTable.js` over `INDEX.md` (Tiers 1-3 and combined Tier 1+2); this method does NOT use R-3 `metricsCalc.js`.
- `tools/campaignTable.js` emits no Tier 4 mean. The five citable Tier 4 rows below remain in the 27-row citable total but enter none of the displayed means.
- HISTORY (R-3/F-1 run, 2026-10-18 morning): `vision/src/metricsCalc.js` was run read-only over the fusion dashboards and returned 0 case records because `fusion/dashboard_data.json` is not report-v1 shaped (no `cases[]`). Kept as historical; it never changed the INDEX-derived numbers.
- NOW (PX-1 dashboard adapter, W-A, DONE 2026-10-18; commits b3d86e4 + b2ea3c5): `vision/src/dashboardAdapter.js` parses the REAL dashboard shape offline and `metricsCalc.aggregateCaseRecords()` yields per-site case records with a REAL n over the 69 canon dashboards: n=243 = 154 PASS + 89 FAIL (35 weak PASS_WEAK), rate 154/(154+89)=0.634; final tests 439 / executed 243 / not_executed 196; api_calls 0 (recorded); tokens/usd/brain.blind/dom_assist NOT_RECORDED (never zeroed). These are UI-state execution records from the dashboards and use a DIFFERENT source/denominator from the FX-2 INDEX campaign share below: they do NOT replace, alter, or aggregate with the 39-row campaign table or its tier means. Reproduce: `node tools/px1CaseRecords.js` or `node tools/campaignTable.js --case-records true` (flag-off output is byte-identical to pre-PX-1).

## Per-site table (all 39 registered rows; every star matches a row)

| # | Site | Tier | Run ID | FT live | Fusion% | Class |
|---:|---|---:|---|---|---:|---|
| 1 | SauceDemo | 1 | run_20260823_225906 | 2/3 PASS | 37.5% | citable |
| 3 | BrowserStack Demo | 1 | run_20260824_001108 | 0/1 FAIL (label_mismatch) | 14.3% | citable |
| 4 | Demoblaze | 1 | run_20260824_001544 | **4/4 PASS** | 40% | citable |
| 5 | CURA Healthcare | 1 | run_20260824_002709 | n/a | 0% | citable |
| 6 | Parasoft ParaBank | 1 | run_20260824_015222 | n/a (honest zero) | 0% | citable |
| 7 | Automation Exercise | 1 | run_20260824_094432 | n/a | 0% | citable |
| 8 | OpenCart Demo | 1 | run_20260824_095411 | — | — | BLOCKED |
| 9 | The Internet (Heroku) | 1 | run_20260824_101451 | n/a | 0% | citable |
| 10 | OWASP Juice Shop | 1 | run_20260824_102041 | 0/1 honest fail (proves idempotency) | 16.7% | citable |
| 11 | Books to Scrape | 2 | run_20260825_131135 | 4/5 PASS | 71.4% | citable |
| 12 | Quotes to Scrape | 2 | run_20260825_131756 | 4/5 PASS | 83.3% | citable |
| 13 | LambdaTest Playground | 2 | run_20260825_133122 | 4/5 PASS | 100% | citable |
| 14 | Python.org Docs | 2 | run_20260825_163448 | 1/8 PASS | 88.9% | citable |
| 15 | Project Gutenberg | 2 | run_20260825_165819 | 4/4 PASS | 80% | citable |
| 16 | WeatherSpark | 2 | run_20260825_173233 | 5/8 PASS | 100% | citable |
| 17 | SahiTest Demo | 2 | run_20260826_010716 (supersedes voided run_20260825_194511) | 3/3 PASS | 60% | citable |
| 18 | The Internet (status codes) | 2 | run_20260825_195406 | 4/4 PASS | 80% | citable |
| 19 | PHPTravels Demo | 2 | run_20260825_201027 | 5/6 PASS | 60% | citable |
| 20 | Open Library | 2 | run_20260825_203014 | 0/7 PASS | 87.5% | citable |
| 21 | Wikipedia (Web testing) | 3 | run_20260825_230647 | 3/7 PASS (steps 6/14) | 87.5% | citable |
| 22 | StackOverflow Questions | 3 | none - BLOCKED pre-gate | — | — | BLOCKED |
| 23 | GitHub Trending | 3 | run_20260825_232415 | 3/5 PASS (steps 10/12) | 83.3% | citable |
| 24 | IMDb Chart Top | 3 | none - BLOCKED pre-gate | — | — | BLOCKED |
| 25 | Goodreads Lists | 3 | run_20260825_232334 + run_20260825_235717 | — | — | BLOCKED |
| 26 | Hacker News | 3 | run_20260825_234052 | 1/8 PASS (7× selector_not_found on bare /item - honest) | 100% | citable |
| 27 | BBC News | 3 | run_20260826_000112 | - | — | CONTAMINATED |
| 28 | Archive.org (Internet Archive) | 3 | run_20260825_235819 | ➖ not executable (no fusion tests) | 0% | citable |
| 29 | npmjs Packages | 3 | none - BLOCKED pre-gate | — | — | BLOCKED |
| 30 | Reddit Public (old.reddit) | 3 | none - BLOCKED pre-gate | — | — | BLOCKED |
| 31 | Magento Luma (softwaretestingboard) | 4 | run_20260826_004650 | — | — | BLOCKED |
| 32 | EvilTester Test Pages | 4 | run_20260826_005704 (supersedes contaminated run_20260826_000247) | **1/3 PASS** (2× no_post_action_change on live-probe-passing buttons - verifier gap, not site defect) | 42.9% | CONTAMINATED |
| 33 | TodoMVC React (TS) | 4 | run_20260826_002227 | **3/3 PASS** ⚠️ incl. off-domain nav (github.com/remojansen, petehuntsposts.quora.com via on-page links; read-only) — audit F4-01 disclosure | 30% | citable |
| 34 | Techlistic (Selenium practice) | 4 | run_20260826_002500 DO-NOT-CITE | - | — | CONTAMINATED |
| 35 | Practice Test Automation | 4 | run_20260826_003258 DO-NOT-CITE | — | — | CONTAMINATED |
| 36 | Guru99 Bank demo | 4 | run_20260826_020711 | 4/8 PASS (15/19 steps) | 66.7% | citable |
| 37 | GlobalSQA Example Pages Hub | 4 | run_20260826_023441 | **7/8 PASS** live, purity PURE | 66.7% | citable |
| 38 | Dynamic Loading Example 2 | 4 | run_20260826_022742 | **1/1 PASS** | 14.3% | citable |
| 39 | The Internet: Tables | 4 | run_20260826_023111 | **1/1 PASS** | 14.3% | citable |
| 40 | W3Schools <input> reference | 4 | run_20260826_023102 DO-NOT-CITE | - | — | CONTAMINATED |

## Tier means (arithmetic shown, n explicit)

- **Tier 1:** n=8; sum=108.5; mean=13.56%  ([37.5, 14.3, 40, 0, 0, 0, 0, 16.7] / 8)
- **Tier 2:** n=10; sum=811.1; mean=81.11%  ([71.4, 83.3, 100, 88.9, 80, 100, 60, 80, 60, 87.5] / 10)
- **Tier 3:** n=4; sum=270.8; mean=67.70%  ([87.5, 83.3, 100, 0] / 4)
- **Tier 1+2 (decontaminated 20-site ledger):** n=18; sum=919.6; mean=51.09%.

### Citable rows outside every displayed tier mean

| # | Site | Tier | Why not in a displayed mean |
|---:|---|---:|---|
| 33 | TodoMVC React (TS) | 4 | `campaignTable.js` reports Tiers 1-3 and combined Tier 1+2 only. |
| 36 | Guru99 Bank demo | 4 | `campaignTable.js` reports Tiers 1-3 and combined Tier 1+2 only. |
| 37 | GlobalSQA Example Pages Hub | 4 | `campaignTable.js` reports Tiers 1-3 and combined Tier 1+2 only. |
| 38 | Dynamic Loading Example 2 | 4 | `campaignTable.js` reports Tiers 1-3 and combined Tier 1+2 only. |
| 39 | The Internet: Tables | 4 | `campaignTable.js` reports Tiers 1-3 and combined Tier 1+2 only. |

### Headline reconciliation
- Earlier close-out cited **~20% (Tier 1)** and **48.7% (decontaminated 20-site ledger)**. Neither is reproducible from INDEX.md: computed Tier 1 = 13.56% (n=8) and Tier 1+2 = 51.09% (n=18).
- Per FX-2 the cited numbers are **replaced** by the computed values above (honest correction, append-only in `docs/AUDIT.jsonl`).
- The Tier 1 vs Tier 2 gap is confounded by toolchain evolution and site mix; it is not evidence of improvement.

## 39-row breakdown (reconciliation)
- Total registered rows: **39**
- Citable (in aggregate): **27**
- BLOCKED (excluded): **7** -> #8 OpenCart Demo; #22 StackOverflow Questions; #24 IMDb Chart Top; #25 Goodreads Lists; #29 npmjs Packages; #30 Reddit Public (old.reddit); #31 Magento Luma (softwaretestingboard)
- CONTAMINATED / DO-NOT-CITE (excluded): **5** -> #27 BBC News; #32 EvilTester Test Pages; #34 Techlistic (Selenium practice); #35 Practice Test Automation; #40 W3Schools <input> reference
- Check: 27 + 7 + 5 = 39 = 39. ✔

### 6-vs-7 cleared reconciliation
- "Cleared" = site whose pipeline completed without block/contamination. In Tier 1 the completed pipeline rows are SauceDemo, BrowserStack, Demoblaze, CURA, ParaBank, Automation Exercise, The Internet (Heroku), OWASP Juice Shop = **8 completed**; of these, sites with a nonzero fusion contribution = SauceDemo, BrowserStack, Demoblaze, OWASP Juice Shop = **4**.
- The close-out "6 cleared" counted the >=6/10 pre-registered bar against named pipeline successes; the INDEX completed-row count is 8 (7 if OpenCart's pre-gate success is excluded). The residual 6-vs-7 discrepancy is a **count-definition** difference (bar tally vs INDEX completion), not missing data; both figures are stated here so no single number is asserted alone.

## Excluded rows + reason

| # | Site | Reason |
|---:|---|---|
| 8 | OpenCart Demo | Bot-wall / pre-gate block (stop-list; never evaded) |
| 22 | StackOverflow Questions | Bot-wall / pre-gate block (stop-list; never evaded) |
| 24 | IMDb Chart Top | Bot-wall / pre-gate block (stop-list; never evaded) |
| 25 | Goodreads Lists | Bot-wall / pre-gate block (stop-list; never evaded) |
| 27 | BBC News | Contamination marker (purity FAIL; excluded from aggregates) |
| 29 | npmjs Packages | Bot-wall / pre-gate block (stop-list; never evaded) |
| 30 | Reddit Public (old.reddit) | Bot-wall / pre-gate block (stop-list; never evaded) |
| 31 | Magento Luma (softwaretestingboard) | Bot-wall / pre-gate block (stop-list; never evaded) |
| 32 | EvilTester Test Pages | Contamination marker (purity FAIL; excluded from aggregates) |
| 34 | Techlistic (Selenium practice) | Contamination marker (purity FAIL; excluded from aggregates) |
| 35 | Practice Test Automation | Contamination marker (purity FAIL; excluded from aggregates) |
| 40 | W3Schools <input> reference | Contamination marker (purity FAIL; excluded from aggregates) |

## Label + cause-class tables

| Label | Meaning | Applies to |
|---|---|---|
| AUTONOMOUS | blind-Y, all-API select-only run as recorded | Q12 select-only; `docs/R3_RESULTS.jsonl:167`; report JSON not retained |
| NONBLIND | keyed API / MCP / CLI generate | GL1, MCP tools |
| ASSISTED | file/mock/replay/seeded | unit suites, holdouts, control tests
| OBSERVED | no oracle | mutation run (no business-value oracle)
| BLOCKED | citable:false | 7 blocked sites above

| Cause class | Rows |
|---|---|
| Bot-wall / bot-check (403/202/blank) | OpenCart, StackOverflow, IMDb, Goodreads, npmjs, Reddit, Magento |
| Catalog contamination (foreign page_keys) | BBC News, Techlistic, Practice Test Automation, W3Schools inputs, EvilTester |
| Completed, zero fusion contribution | CURA, ParaBank, Automation Exercise, The Internet (Heroku), Archive.org |

### Label source records

- Q12: `docs/R3_RESULTS.jsonl:167` records GEM0 HTTP 200, GEM1/2/3 clean (all API stages), tokenCap Y, and `blind-Y AUTONOMOUS`; the report JSON is not retained. Q12 is select-only (selection among archetype/target candidates), so its recorded class is AUTONOMOUS.
- GL1: `docs/R3_RESULTS.jsonl:225` records `AUTONOMY_NONBLIND(generate)`; the report JSON is not retained. The claims-matrix classification is NONBLIND.

## Limitations (what is NOT proven)
- Fusion% is a campaign share of generated tests, not a success-vs-truth measure; no business-value (price/total) oracle exists. UI-state oracle kinds DO exist.
- PX-1 dashboard case records are UI-state execution outcomes (per-test PASS/FAIL from `execution.steps`), not business-value correctness; they are reported separately from the FX-2 campaign share.
- Per-site FT hits vs the site truth files are not asserted here; only INDEX-reported aggregates are reproduced.
- HISTORY: R-3 metricsCalc produced 0 case records on the fusion dashboards (schema mismatch, 2026-10-18 morning). NOW DELIVERED as PX-1 (DONE): the adapter yields 243 case records over 69 dashboards (154 PASS / 89 FAIL, rate 0.634). tokens/usd remain NOT_RECORDED (the dashboards do not record them).

_Generated read-only from INDEX.md by FX-2 tools/campaignTable.js; W1, 2026-10-18._
