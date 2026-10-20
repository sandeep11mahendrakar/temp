# P59 -> R3 atomic execution crosswalk (all hosted results NOT_RUN)

All 35 assertion IDs match the accepted P59 source names and order.
Runnable statements are frozen in src/case_catalog.py; JSON is **not** read by the executor.
Four persisted synthetic fixture IDs (transactional only): `ocdb_tv1_20261019_eligible`, `ocdb_tv1_20261019_trial`, `ocdb_tv1_20261019_excluded`, `ocdb_tv1_20261019_pending`.
Six distinct NEG-05 attempted write IDs (never expected to persist): `ocdb_tv1_20261019_bad_schema`, `ocdb_tv1_20261019_bad_eligibility`, `ocdb_tv1_20261019_nonresearch_eligible`, `ocdb_tv1_20261019_missing_ids`, `ocdb_tv1_20261019_self_supersedes`, `ocdb_tv1_20261019_trial_pending`.
The preflight refuses ANY row with the reserved `ocdb_tv1_20261019_` prefix,
and the fresh cleanup tests that the entire prefix has zero residual rows.

**P59 naming caveat:** `NEG-05/TRIAL-ELIGIBLE` preserves the original 35-case ID
but is implemented as `PENDING_VALIDATION + ELIGIBLE` to isolate
`r3_runs_eligible_research_ids_ck`; literal `TRIAL + ELIGIBLE` breaks both
`r3_runs_trial_excluded_ck` and `r3_runs_eligible_research_ids_ck`.
The original literal combination is **not** claimed as independently proven.
AUD must explicitly review this change of test predicate and case semantics.

| # | P59 ID | role | expected outcome | target synthetic ID / note |
|---:|---|---|---|---|
| 1 | `PREFLIGHT/OWNER` | `owner` | True | `SQL catalog only` |
| 2 | `PREFLIGHT/ROLES` | `owner` | True | `SQL catalog only` |
| 3 | `PREFLIGHT/TRIGGER` | `owner` | True | `SQL catalog only` |
| 4 | `PREFLIGHT/BASELINE` | `owner` | baseline count exact | `SQL catalog only` |
| 5 | `CAT/RLS` | `owner` | True | `SQL catalog only` |
| 6 | `CAT/SECURITY-INVOKER` | `owner` | True | `SQL catalog only` |
| 7 | `POS-INSERT` | `service_role` | 4 inserted | `SQL catalog only` |
| 8 | `NEG-01/SELECT` | `anon` | SQLSTATE 42501 | `SQL catalog only` |
| 9 | `NEG-01/INSERT` | `anon` | SQLSTATE 42501 | `SQL catalog only` |
| 10 | `NEG-01/UPDATE` | `anon` | SQLSTATE 42501 | `SQL catalog only` |
| 11 | `NEG-01/DELETE` | `anon` | SQLSTATE 42501 | `SQL catalog only` |
| 12 | `NEG-01/ELIGIBLE-VIEW` | `anon` | SQLSTATE 42501 | `SQL catalog only` |
| 13 | `NEG-01/READBACK-VIEW` | `anon` | SQLSTATE 42501 | `SQL catalog only` |
| 14 | `NEG-02/SELECT` | `authenticated` | SQLSTATE 42501 | `SQL catalog only` |
| 15 | `NEG-02/INSERT` | `authenticated` | SQLSTATE 42501 | `SQL catalog only` |
| 16 | `NEG-02/UPDATE` | `authenticated` | SQLSTATE 42501 | `SQL catalog only` |
| 17 | `NEG-02/DELETE` | `authenticated` | SQLSTATE 42501 | `SQL catalog only` |
| 18 | `NEG-02/ELIGIBLE-VIEW` | `authenticated` | SQLSTATE 42501 | `SQL catalog only` |
| 19 | `NEG-02/READBACK-VIEW` | `authenticated` | SQLSTATE 42501 | `SQL catalog only` |
| 20 | `NEG-03-SERVICE/UPDATE` | `service_role` | SQLSTATE 42501 | `SQL catalog only` |
| 21 | `NEG-03-SERVICE/DELETE` | `service_role` | SQLSTATE 42501 | `SQL catalog only` |
| 22 | `POS-RETRY` | `service_role` | 0 inserted; row 1; digest unchanged | `SQL catalog only` |
| 23 | `NEG-04/HASH-CONFLICT` | `service_role` | SQLSTATE 23505 / r3_runs_pkey | `SQL catalog only` |
| 24 | `NEG-05/BAD-SCHEMA` | `service_role` | SQLSTATE 23514 / r3_runs_schema_version_ck | `ocdb_tv1_20261019_bad_schema` |
| 25 | `NEG-05/BAD-ELIGIBILITY` | `service_role` | SQLSTATE 23514 / r3_runs_aggregate_eligibility_ck | `ocdb_tv1_20261019_bad_eligibility` |
| 26 | `NEG-05/TRIAL-ELIGIBLE` | `service_role` | SQLSTATE 23514 / r3_runs_eligible_research_ids_ck | `ocdb_tv1_20261019_nonresearch_eligible` |
| 27 | `NEG-05/MISSING-IDS` | `service_role` | SQLSTATE 23514 / r3_runs_eligible_research_ids_ck | `ocdb_tv1_20261019_missing_ids` |
| 28 | `NEG-05/SELF-SUPERSEDES` | `service_role` | SQLSTATE 23514 / r3_runs_supersedes_ck | `ocdb_tv1_20261019_self_supersedes` |
| 29 | `NEG-05/TRIAL-PENDING` | `service_role` | SQLSTATE 23514 / r3_runs_trial_excluded_ck | `ocdb_tv1_20261019_trial_pending` |
| 30 | `NEG-06` | `service_role` | eligible ID only; readback 4 | `SQL catalog only` |
| 31 | `NEG-03-OWNER-PREFLIGHT` | `owner` | True | `SQL catalog only` |
| 32 | `NEG-03-OWNER-TRIGGER/UPDATE` | `owner` | SQLSTATE 55000 | `SQL catalog only` |
| 33 | `NEG-03-OWNER-TRIGGER/DELETE` | `owner` | SQLSTATE 55000 | `SQL catalog only` |
| 34 | `FINAL-IN-TX` | `owner` | 4 | `SQL catalog only` |
| 35 | `POST-ROLLBACK` | `owner` | 0 | `fresh read-only session; reserved-prefix count=0; baseline unchanged; PID gone` |

Every NEG-05 statement uses INSERT SELECT with a unique NEW run_id,
rewrites manifest.run_id and report.run.id to that new ID, and changes
only the intended CHECK predicate from an eligible RESEARCH source row.
Expected SQLSTATE `23514` and exact constraint are validated at runtime,
but **not validated here in actual PostgreSQL/PGlite**.

POST-ROLLBACK runs only on the independently opened cleanup session.
Transport retry/hash and stored-byte digest recomputation are separate OUT OF SCOPE checks.
No hosted adapter, credentials or migration action are bundled.
