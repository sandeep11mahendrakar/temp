# R3 FIX RESULT | AUD review only

**R2 disposition:** REJECT preserved; R3 has NO ACCEPT. No hosted SQL or migration retry.

**Changed paths:** `src/executor_runtime.py`, `src/case_catalog.py`, `EXECUTABLE_CASE_PLAN.json`, `P59_ATOMIC_CASE_MAPPING.md`, `README_AUD_REVIEW.md`, `FILE_SHA256_MANIFEST.txt`, `FROZEN_PACKAGE_METADATA.json`.
**New paths:** `tests/test_r3_repairs.py`, `tests/neg05_pglite_local_only.cjs`, `src/offline_probe.py`, `R2_REJECT_HISTORY.md`, `R3_REPAIR_SUMMARY_AND_AUD_REQUEST.md`, and `artifacts/R3_*`.

## NEG-05 one-constraint candidate mapping

| Case ID | New attempted run_id | Expected SQLSTATE | Exact expected CHECK |
|---|---|---|---|
| `NEG-05/BAD-SCHEMA` | `ocdb_tv1_20261019_bad_schema` | `23514` | `r3_runs_schema_version_ck` |
| `NEG-05/BAD-ELIGIBILITY` | `ocdb_tv1_20261019_bad_eligibility` | `23514` | `r3_runs_aggregate_eligibility_ck` |
| `NEG-05/TRIAL-ELIGIBLE` | `ocdb_tv1_20261019_nonresearch_eligible` | `23514` | `r3_runs_eligible_research_ids_ck` |
| `NEG-05/MISSING-IDS` | `ocdb_tv1_20261019_missing_ids` | `23514` | `r3_runs_eligible_research_ids_ck` |
| `NEG-05/SELF-SUPERSEDES` | `ocdb_tv1_20261019_self_supersedes` | `23514` | `r3_runs_supersedes_ck` |
| `NEG-05/TRIAL-PENDING` | `ocdb_tv1_20261019_trial_pending` | `23514` | `r3_runs_trial_excluded_ck` |

**Important:** `NEG-05/TRIAL-ELIGIBLE` is deliberately isolated with PENDING_VALIDATION+ELIGIBLE, rather than the doubly violating literal TRIAL+ELIGIBLE. AUD must sign off the alias-to-predicate mismatch.

## Observed offline checks (all Linux)

| Command | Observed | Exit | Raw file |
|---|---|---:|---|
| `PYTHONPATH=src:. python -m unittest tests.test_frozen_executor tests.test_r3_repairs -v` | 46 tests, 45 pass, 1 native Windows skipped | 0 | `artifacts/R3_FULL_UNITTEST_RAW_LINUX.txt` |
| `PYTHONPATH=src:. python src/offline_review.py` | Source hashes 7/7, case IDs 35/35 | 0 | `artifacts/R3_SOURCE_INTEGRITY_RAW_LINUX.txt` |
| `PYTHONPATH=src:. python src/offline_probe.py` | Fake rollback and close ACK=1 each; fresh cleanup prefix=0; baseline preserved; PID absent (SIMULATED) | 0 | `artifacts/R3_FAKE_TRANSACTION_CLEANUP_RAW_LINUX.txt` |
| `node tests/neg05_pglite_local_only.cjs` | SKIPPED (pinned package unavailable), NOT DB SQLSTATE proof | 77 | `artifacts/R3_NEG05_PGLITE_ATTEMPT_RAW_LINUX.txt` |

Windows runtime and Windows native test: **NOT RUN (Windows unavailable)**.
Isolated PostgreSQL/PGlite NEG-05 execution: **NOT RUN (no local server/package available)**.
P59 sources: **UNCHANGED**. No credentials, hosted actions, uploads or alternative transport.

## AUD request

Please perform independent static review of this packet, review renamed test semantics, and request actual Windows/PGlite raw logs before accepting either fix. The prior platform safety block and hosted TV-1 both remain open.

## Integrity

Pinned P59 source revision: `87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9`.
Migration SHA-256: `b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6`.
Case catalog SHA-256: `037215b0a2cb5e8df50e99e7bd56c1c015883f04bf0c964a22b62c37789ff2e2`.
