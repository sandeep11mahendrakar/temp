# Claims matrix (R-5)

Claim -> evidence path -> label -> limitation (what is NOT proven).
Labels: AUTONOMOUS (blind-Y only), NONBLIND (MCP/CLI), ASSISTED (file/mock/replay/seeded), OBSERVED (no oracle), BLOCKED (citable:false).

| # | Claim | Evidence path | Label | Limitation (NOT proven) |
|---|---|---|---|---|
| 1 | Arch A (web/DOM) generates selector-grounded tests | web/src/*, web/test/* | ASSISTED | Offline suites only; no live value oracles |
| 2 | Arch B (vision/YOLO+OCR) sees ~19x more elements/run than A | testing/CAMPAIGN_EVALUATION.md, site_reports | ASSISTED | Campaign n=18 clean; site subset, not all 50 |
| 3 | Fusion value ~48.7% campaign mean (decontaminated) | testing/CAMPAIGN_EVALUATION.md, testing/site_reports/INDEX.md | ASSISTED | Derived from FT pass rate, not value correctness (no value oracle exists) |
| 4 | System verifies actions-work, not values-correct | mutation/results/ANALYSIS.md | OBSERVED | Negative finding; no assertion/value oracles exist (V2 item, deferred) |
| 5 | G2 zoo conformance 19/21 (>=90% gate) | vision/storage/outputs/g2z_results.json, docs/TASK_BOARD.md | ASSISTED | iframe + infinite-scroll still FAIL (no tuning); controls 29/29 NOT-pass |
| 6 | Batch3 holdout 5/5 PASS | docs/TASK_BOARD.md, git bc4be63 | ASSISTED | Scored once, no tuning before paste; single run |
| 7 | GL1 live-generate schema_validity=1, truth_coverage=0.833 | docs/TASK_BOARD.md, R3_RESULTS | NONBLIND | api=6, 401/invalid-key resolved only after human placed key; AUTONOMY_NONBLIND (generate, not blind-Y) |
| 8 | MCP perceive/act/assert/memory/report/library tools (11) | vision/mcp/server.js, server.test.js (41/41) | NONBLIND | No raw key/secret in replies; readback is probe-based, not DOM read-back for all fields |
| 9 | Blind-fire classes 1/2/3 (pointer/value/key) | vision/test Q4 classes, K5 matrix | ASSISTED | Mock/offline unit tests; live precision unverified for some classes |
| 10 | Shadow-pierce resolves >>> selectors | vision/src/executeTests.js, shadowPierce.test.js | ASSISTED | Unit-tested with fakes; live shadow-DOM sites not exercised in campaign |
| 11 | A-7 truth probes: 6 sites, all access=ok | sites/*/truth.json (tier=playwright-direct) | ASSISTED | Facts probed not asserted from memory; single pass, no re-verification |
| 12 | Suites: Vision 496/496 + MCP 41/41 green | node --test output (this session) | ASSISTED | Worker-reported; verifier must re-run independently |
| 13 | No secrets in repo (AIza[35] scan 0) | git grep across HEAD + history | ASSISTED | Scan covers tracked files only; untracked .env never committed (gitignored) |
| 14 | Site library validates + refuses third_party unpermitted | vision/src/siteLibrary.js + tests 9/9 | ASSISTED | Unit-tested; no live site onboarding at scale yet |
| 15 | Report schema v1 carries brain.role/tc_source/label/evid_paths/block | vision/src/reportSchema.js + docs/report.schema.json | ASSISTED | Additive fields; old reports still validate (backward compat) |

## What is NOT claimed (explicit non-claims)

- No value-correctness oracles exist anywhere (mutation/results/ANALYSIS.md).
- No production deployment or 30-site final eval yet (F-1 gated on USER-INDEX).
- No autonomous (blind-Y) claim for any live run except where brain blind=Y is recorded.
- No push to any remote (no remotes configured; local-only).

Prepared by W3, 2026-10-18. api_calls=0.
