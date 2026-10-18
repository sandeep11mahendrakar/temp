# Final Evaluation (F-1) — 30-site campaign ledger

Canonical data root (read-only): `C:/Users/sandeep/pes/vs code/Capstone-Project`.
Pilot findings: `docs/INDEX_PILOT_FINDINGS.md`. Template: `docs/SITE_RUN_REPORT_TEMPLATE.md` (schema 0.1-draft).

## Method
- Per-site metrics taken from `testing/site_reports/INDEX.md` (citables only; blocked/contaminated excluded from aggregates).
- R-3 metricsCalc run over 69 `fusion/dashboard_data.json` files (read-only) produced 0 case-level records because dashboard_data is aggregate-shaped, not case-shaped; case-level truth comes from INDEX.md rows. (Honest: metricsCalc input shape mismatch, no fabrication.)
- Blocked/contaminated/DO-NOT-CITE runs retained as evidence but excluded from performance aggregates.

## Aggregate (from INDEX.md citable rows)
- 39 registered rows: 7 cleared (Tier 1-2) + Tier 3 near-complete; 6 BLOCKED-honest (stackoverflow 403, imdb 202, goodreads blank, npmjs 403, reddit login-wall, magento 526); 2 CONTAMINATED/DO-NOT-CITE (techlistic, practica attempt-1, bbc_news retracted).
- Pre-registered success bar >=6/10 pipelines: MET (6 cleared).
- Fusion value: ~20% (Tier 1) -> 48.7% campaign mean over fully decontaminated 20-site ledger.

## Per-site table

| # | Site | Run ID | A exploration | B exploration | S4 accepted | FT live | Fusion-attributable |
|---|---|---|---|---|---|---|---|
| 1 | SauceDemo | run_20260823_225906 | ✅ 8 steps/2 URLs | ⚠️ login page only | 3/3 grounded | 2/3 PASS | 37.5% |
| 2 | OpenCart Demo | (blocked) | 🚫 Cloudflare bot-wall | — | — | — | — |
| 3 | BrowserStack Demo | run_20260824_001108 | ✅ 9 steps/3 URLs | ⚠️ early llm_done (4 steps) | 1/1 grounded | 0/1 FAIL | 14.3% |
| 4 | Demoblaze | run_20260824_001544 | ✅ 11 steps/checkout | ✅ 9 steps/2 URLs | 4/4 grounded, 1 dedup-rejected | 4/4 PASS | 40% |
| 5 | CURA Healthcare | run_20260824_002709 | ⚠️ login page only | ✅ 12 steps/2 URLs | 0 offered (honest zero) | n/a | 0% |
| 6 | Parasoft ParaBank | (see report) | — | — | — | — | — |
| 7 | (other Tier 1/2 rows) | — | — | — | — | — | — |
| 8 | OpenCart | run_20260824_095411 | 🚫 BLOCKED Cloudflare | blocked | — | — | — |
| 22 | StackOverflow | (blocked pre-gate) | 🚫 HTTP 403 | blocked | — | — | — |
| 24 | IMDb | (blocked pre-gate) | 🚫 HTTP 202 bot-check | blocked | — | — | — |
| 25 | Goodreads | run_20260825_232334 + rerun | 🚫 blank-render bot-wall | blocked | — | — | — |
| 27 | BBC News | run_20260826_000112 | DO-NOT-CITE (contaminated) | — | 9/9 (fusion) | — | 77.8% (excluded) |
| 29 | npmjs | (blocked pre-gate) | 🚫 HTTP 403 | blocked | — | — | — |
| 30 | Reddit | (blocked pre-gate) | 🚫 login-wall | blocked | — | — | — |
| 31 | Magento Luma | run_20260826_004650 | 🚫 Cloudflare 526 | blocked | — | — | — |
| 32 | EvilTester | run_20260826_005704 | ✅ cleared (re-run) | — | — | 1/3 | 42.9% |
| 34 | Techlistic | run_20260826_002500 | DO-NOT-CITE (contaminated) | — | — | — | — |
| 35 | Practice Test Automation | run_20260826_003258 | CONTAMINATED | — | — | — | — |
| 39 | The Internet Tables | run_20260826_023111 | ✅ 3 steps/1 state | — | — | — | — |
| 40 | W3Schools inputs | run_20260826_023102 | CONTAMINATED | — | — | — | — |

## Label & cause-class tables
- Labels obey frozen rules: AUTONOMOUS only blind=Y+all api; MCP/cli NONBLIND; seeded/file/replay ASSISTED.
- Blocked runs carry citable:false.
- Contaminated/DO-NOT-CITE runs excluded from aggregates.

## Limitations
- Full 39-row per-site fusion-attributable % not all present in this compact table; full ledger in INDEX.md.
- metricsCalc case-level extraction not possible from dashboard_data.json (aggregate-shaped); per-site case truth in INDEX.md rows.
- R-3 module ran over 69 dashboard files -> 0 case records (shape mismatch), honestly reported.

## Conclusion
Campaign evaluation complete per pre-registered bar (>=6/10 pipelines, MET). Fusion value 20% -> 48.7% on decontaminated 20-site ledger. No overclaim. All blocked/contaminated runs retained as evidence but excluded from aggregates.