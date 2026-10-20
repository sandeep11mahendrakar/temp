# OC-DB / TV-1 hosted SQL subcase mapping — PROVISIONAL (NOT EXECUTED)

**Evidence boundary:** This table is transcribed from the available older R2 expected-case matrix, *not* the unprovided corrected SUB R2 or revised P59 sources. P59's local **16/16** is not the number of SQL subcases below and is **not** hosted proof. Audit must reconcile every row with exact P59 SQL, role, fixture run IDs, preflight and approved transport **before** producing a reviewed case-plan JSON.

The proposed separate runner emits `{case_id, role, expected, raw, status}` for each approved SQL subcase; `raw` has `sqlstate`, `constraint`, `rowcount` and/or allowlisted `rows`. SQLSTATE is captured from the driver exception (not parsed from a `NOTICE`); SAVEPOINT recovery permits further cases within the same transaction. Any mismatch aborts subsequent cases but still performs ROLLBACK → CLOSE → new read-only cleanup. The matrix below contains **expectations only**, never actual hosted results.

| SQL subcase | Expected SQL result / SQLSTATE | Required raw evidence fields | Current actual |
|---|---|---|---|
| `PREFLIGHT/OWNER-PRIVILEGE` | boolean privileged=true / has_update=true / has_delete=true | rows, SQLSTATE=00000 | NOT RUN |
| `PREFLIGHT/ROLE-SWITCH` | anon/authenticated/service_role can SET ROLE only as approved | per-role command outcome, SQLSTATE=00000 | NOT RUN |
| `CAT/R3-RLS` | r3_runs.relrowsecurity=true | rows, SQLSTATE=00000 | NOT RUN |
| `CAT/INVOKER/r3_research_eligible` | security_invoker=true | rows, SQLSTATE=00000 | NOT RUN |
| `CAT/INVOKER/r3_evidence_readback` | security_invoker=true | rows, SQLSTATE=00000 | NOT RUN |
| `POS/FOUR-FIXTURES` | fixture_count=4 | rows, SQLSTATE=00000 | NOT RUN |
| `NEG-01/ANON/SELECT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-01/ANON/INSERT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-01/ANON/UPDATE` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-01/ANON/DELETE` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-01/ANON/ELIGIBLE-VIEW-SELECT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-01/ANON/READBACK-VIEW-SELECT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-02/AUTHENTICATED/SELECT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-02/AUTHENTICATED/INSERT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-02/AUTHENTICATED/UPDATE` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-02/AUTHENTICATED/DELETE` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-02/AUTHENTICATED/ELIGIBLE-VIEW-SELECT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-02/AUTHENTICATED/READBACK-VIEW-SELECT` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-03/SERVICE-UPDATE` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-03/SERVICE-DELETE` | SQLSTATE=42501 | raw error SQLSTATE=42501; constraint=null | NOT RUN |
| `NEG-03/OWNER-UPDATE` | SQLSTATE=55000 | raw error SQLSTATE=55000; constraint=null | NOT RUN |
| `NEG-03/OWNER-DELETE` | SQLSTATE=55000 | raw error SQLSTATE=55000; constraint=null | NOT RUN |
| `POS-RETRY/IDENTICAL` | INSERT ... ON CONFLICT DO NOTHING, inserted=0 | rowcount=0; SQLSTATE=00000 | NOT RUN |
| `POS-RETRY/COUNT` | same run_id count=1 | rows; SQLSTATE=00000 | NOT RUN |
| `POS-RETRY/DIGEST` | stored payload_sha256 unchanged=true | rows; SQLSTATE=00000 | NOT RUN |
| `NEG-04/HASH-CONFLICT` | 23505; constraint=r3_runs_pkey | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-05/BAD-SCHEMA` | 23514; constraint=r3_runs_schema_version_ck | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-05/BAD-ELIGIBILITY` | 23514; constraint=r3_runs_aggregate_eligibility_ck | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-05/TRIAL-ELIGIBLE` | 23514; constraint=r3_runs_eligible_research_ids_ck | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-05/TRIAL-PENDING` | 23514; constraint=r3_runs_trial_excluded_ck | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-05/MISSING-IDS` | 23514; constraint=r3_runs_eligible_research_ids_ck | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-05/SELF-SUPERSEDES` | 23514; constraint=r3_runs_supersedes_ck | raw error SQLSTATE+constraint | NOT RUN |
| `NEG-06/ELIGIBLE-ID` | one exact eligible synthetic run_id, no other IDs | rows for exposed view columns only; SQLSTATE=00000 | NOT RUN |
| `NEG-06/READBACK-COUNT` | all four fixtures in readback_count=4 | rows; SQLSTATE=00000 | NOT RUN |
| `FINAL-IN-TX/FOUR-FIXTURES` | fixture_count=4 | rows; SQLSTATE=00000 | NOT RUN |
| `ROLLBACK/SAME-SESSION` | ROLLBACK acknowledged on same connection as BEGIN | connection journal, no SQLSTATE unless failure | NOT RUN |
| `CLOSE/OLD-SESSION` | close called; old PID absent in fresh pg_stat_activity | new-session boolean/count | NOT RUN |
| `POST/NO-FIXTURES` | fresh read-only count=0 for all four synthetic fixture IDs | rows; SQLSTATE=00000 | NOT RUN |
| `POST/BASELINE` | non-R3 public catalog fingerprint unchanged | SHA-256 fingerprint equality; SQLSTATE=00000 | NOT RUN |
| `POST/READONLY-CLOSE` | new session ROLLBACK and close acknowledged | connection journal | NOT RUN |

## Separate proof boundaries (not satisfied by these SQL cases)

- **Transport retry and hash comparison:** Must be performed with the independently approved uploader; primary-key conflict alone does not prove uploader idempotency. `NOT_COVERED`.
- **Stored-byte digest verification:** Fetch actual persisted envelope and recompute with accepted `tools/r3DbContract.js`; matching positive and altered/pinned negative are separate. `NOT_COVERED`.
- **Hosted TV-1 and approval:** No migration, hosted SQL, AUD review or TV-1 acceptance occurred in this preparation.
- **Transaction limits:** A successful mock run demonstrates logic, *not* real network/server guarantees. Fresh cleanup checks only the four synthetic fixture IDs and the schema fingerprint for non-R3 `public` relations; it does not certify other schemas or unrelated concurrent row changes. An unavailable PID check or cleanup connection causes FAIL/UNVERIFIED, never PASS.
- **Competing CHECK constraints:** `NEG-05/TRIAL-ELIGIBLE` expected name comes from older R2 and must be confirmed by independent review against P59's actual fixture and Postgres constraint-check ordering.
