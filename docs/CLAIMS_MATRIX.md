# Claims matrix (R-5)

Claim -> evidence path -> label -> limitation (what is NOT proven).
Labels: AUTONOMOUS (blind-Y only), NONBLIND (MCP/CLI), ASSISTED (file/mock/replay/seeded), OBSERVED (no oracle), BLOCKED (citable:false).

| # | Claim | Evidence path | Label | Limitation (NOT proven) |
|---|---|---|---|---|
| 1 | Arch A (web/DOM) generates selector-grounded tests | web/src/*, web/test/* | ASSISTED | Offline suites only; no live business-value oracle |
| 2 | Arch B (vision/YOLO+OCR) sees ~19x more elements/run than A | testing/CAMPAIGN_EVALUATION.md, site_reports | ASSISTED | Campaign n=18 clean; site subset, not all 50 |
| 3 | Fusion value T1 13.56%(n8), T2 81.11%(n10), T1+2 51.09%(n18) | INDEX.md, campaignTable.js | ASSISTED | Campaign share, not value correctness; old 20%/48.7% unreproducible. T1/T2 gap confounded by toolchain + site mix; no improvement inference. |
| 4 | System verifies actions-work, not values-correct | mutation/results/ANALYSIS.md | OBSERVED | Negative finding; no business-value (price/total) correctness oracle exists; UI-state oracle kinds do exist (V2 item for business value, deferred) |
| 5 | G2 zoo conformance 35/44 = 79.55% (<90% gate) | vision/storage/outputs/g2z_results_v2.json, docs/TASK_BOARD.md (FX-1) | ASSISTED | rate <90%, honest failure list; controls 45/45 NOT-pass (batch4 included) |
| 6 | Batch3 holdout 5/5 PASS | docs/TASK_BOARD.md, git bc4be63 | ASSISTED | Scored once, no tuning before paste; single run |
| 7 | GL1 live-generate schema_validity=1, truth_coverage=0.833, api_calls=6; ledger label AUTONOMY_NONBLIND(generate) | docs/R3_RESULTS.jsonl:225; report JSON not retained | NONBLIND | n=6 calls; recorded classification is NONBLIND. |
| 8 | MCP perceive/act/assert/memory/report/library tools (11) | vision/mcp/server.js, server.test.js (41/41) | NONBLIND | No raw key/secret in replies; readback is probe-based, not DOM read-back for all fields |
| 9 | Blind-fire classes 1/2/3 (pointer/value/key) | vision/test Q4 classes, K5 matrix | ASSISTED | Mock/offline unit tests; live precision unverified for some classes |
| 10 | Shadow-pierce resolves >>> selectors | vision/src/executeTests.js, shadowPierce.test.js | ASSISTED | Unit-tested with fakes; live shadow-DOM sites not exercised in campaign |
| 11 | A-7 truth probes: 6 sites, all access=ok | sites/*/truth.json (tier=playwright-direct) | ASSISTED | Facts probed not asserted from memory; single pass, no re-verification |
| 12 | Suites: Vision 539/539 + MCP 41/41 green | independent `node --test` rerun | ASSISTED | Vision 539 = 525 baseline + 14 tests added by `vision/test/dashboardAdapter.test.js`. |
| 13 | No secrets in repo (AIza[35] scan 0) | git grep across HEAD + history | ASSISTED | Scan covers tracked files only; untracked .env never committed (gitignored) |
| 14 | Site library validates + refuses third_party unpermitted | vision/src/siteLibrary.js + tests 9/9 | ASSISTED | Unit-tested; no live site onboarding at scale yet |
| 15 | Report schema v1 carries brain.role/tc_source/label/evid_paths/block | vision/src/reportSchema.js + docs/report.schema.json | ASSISTED | Additive fields; old reports still validate (backward compat) |
| 16 | Q12 select-only live run; ledger records GEM0 + GEM1/2/3 clean, tokenCap Y, blind-Y AUTONOMOUS | docs/R3_RESULTS.jsonl:167; report JSON not retained | AUTONOMOUS | Select-only: selects candidates from archetype/targets; one selected class; no campaign-scale claim. |
| 17 | Dashboard adapter: per-site UI-state case records over the canon fusion dashboards: 69 dashboards, n=243 = 154 PASS + 89 FAIL (35 weak PASS_WEAK), rate 154/(154+89)=0.634 | vision/src/dashboardAdapter.js, vision/src/metricsCalc.js, tools/px1CaseRecords.js (commits b3d86e4+b2ea3c5) | ASSISTED | UI-state execution records only (per-test PASS/FAIL from execution.steps); NOT a business-value correctness measure; separate from the FX-2 INDEX campaign share (claim 3) - different source and denominator; tokens_in/out, usd_estimated, brain.blind, dom_assist NOT_RECORDED (never zeroed) |

## What is NOT claimed (explicit non-claims)

- No business-value correctness oracles (price/total/business outcome). Oracle kinds DO exist for UI state (value-present, input_value, weak-verification flags).
- No production deployment.
- AUTONOMOUS requires a retained run record to establish blind-Y; when report JSON is not retained, use the cited runtime ledger line. GL1 remains classified NONBLIND.
- No push to any remote (no remotes configured; local-only).

Note: F-1 30-site final eval IS completed (USER-INDEX set); see docs/FINAL_EVAL.md + tools/campaignTable.js for computed figures.

Prepared by W1, 2026-10-18. api_calls=0.
Update (PX-1 close-out, W-A, 2026-10-18): added claim 17; dashboard case records added offline (api0). Claim 12 suite figure left as reported at FX time; the independent verifier re-ran Vision 539/539 + MCP 41/41 at B-19:56-TV (PX-1 added 14 offline tests).
