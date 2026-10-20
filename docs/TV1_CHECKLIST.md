# TV-1 hosted evidence checklist - corrected documentation
Status | DOCS-ONLY; independent checklist review pending; no hosted acceptance or apply release.
Target | capstone-r3-dev | ref=xvizjawcpafdqrygzvcx | org=qwgbhcakpfwytcrryuxd | region=ap-south-1 | dev shared=N.
Owners | DB-5 row=W2; prior apply operator=W-B; reviewer=AUD-2 or SUB-recorded independent replacement.
Release | Confirm the current owner-approved actor/tool/path and explicit SUB re-release; old CLI GO does not override the newer plugin-only hold.
Safety | A blocked tool approval must be resolved through its normal approval/access route; no bypass, SQL splitting or unauthorized retry.
Scope | This document prepares TV-1. It does not claim the auditor row, transfer H4, authorize DDL/DML/upload, or establish hosted PASS.

## Source custody and migration boundary
- Verify the five R6 supporting-file hashes and aggregate against the published receipt and both independent verdicts.
- R6 aggregate excludes database/r3_companion.sql; record its full SHA256 separately and link DB-2 acceptance/custody evidence or request fresh independent review if bytes differ.
- Record exact source revision, target identity/status, pre-apply R3 collisions, baseline object definitions/counts and authorized actor.
- Apply only the separately reviewed additive migration after release. Capture migration id/time/tool response and post-apply object readback.
- The migration has BEGIN/COMMIT; it is not an automatically rolled-back test. Test scripts have separate BEGIN/ROLLBACK boundaries.
- Negative/readback scripts are tests, not installation steps. The destructive rollback script is a plan only; explicit permission and ownership checks are required before executing it.

## Hosted assertions and evidence
- RLS enabled on every NEW R3 table, especially public.r3_runs. Report unrelated public-table findings separately; do not alter team objects.
- Verify both R3 views have security_invoker=true and intended grants; record service_role SELECT/INSERT and denied anon/authenticated operations.
- Prove schema_version=1.0, valid eligibility, research identity constraints, TRIAL exclusion and supersedes_report self-reference rejection.
- Retry identical run_id/payload through the approved transport: exactly one unchanged row. Different payload for the same id must be rejected, never overwritten.
- Verify UPDATE/DELETE denial, unchanged rows, eligible-view membership and stored-byte digest recomputation with positive and altered-payload controls.
- Retain sanitized command/query, actor role, case id, actual SQLSTATE or row result, expected result, exit/status and source references.
- An expected denial is a passing negative control; a syntax/connection/harness failure is not. A successful DO that swallowed an exception is not raw SQLSTATE proof.
- Where reviewed scripts catch exceptions, the reviewed diagnostic runner must emit GET STACKED DIAGNOSTICS RETURNED_SQLSTATE/constraint details; do not silently edit accepted SQL.

## Explicit case mapping for reviewer approval
This mapping names the previously unspecified six groups; it is a proposed diagnostic plan, not a claim that a hosted runner is approved or executed.
NEG-01 | anon table SELECT/INSERT/UPDATE/DELETE and both view SELECTs | expect 42501 | negative.sql anon block plus explicit view checks.
NEG-02 | authenticated same operations | expect 42501 | negative.sql authenticated block plus explicit view checks.
NEG-03 | service_role UPDATE/DELETE a known existing fixture row | expect 42501; owner-role trigger control expects 55000 without granting extra access | capture each separately.
NEG-04 | same-id changed-payload INSERT | expect 23505 for direct SQL; transport must reject hash conflict | pair with identical-payload retry count=1 and unchanged digest.
NEG-05 | invalid schema version/eligibility, TRIAL+ELIGIBLE, missing research IDs, self-superseding id | expect 23514 and actual constraint name for each subcase.
NEG-06 | eligible view must omit TRIAL, EXCLUDED and PENDING_VALIDATION fixtures | expected membership/count, not SQL error | legitimate RESEARCH+ELIGIBLE positive must remain visible.
DIGEST | recompute persisted rb-research envelope => match=true; rb-arbitrary altered payload with pinned digest => match=false. Hashes only; never publish payload secrets.
Sources | database/r3_companion_step0_negative.sql; database/r3_companion_step0_readback.sql; database/r3_companion.test.sql; tools/r3DbContract.js.
Runner gap | The existing scripts do not emit all named cases/SQLSTATEs. Review/prepare an explicit diagnostic runner before claiming 6/6 hosted evidence; no execution is authorized here.
Offline command grammar only | psql --no-psqlrc --set=ON_ERROR_STOP=1 --file=database/r3_companion_step0_negative.sql
Offline command grammar only | psql --no-psqlrc --set=ON_ERROR_STOP=1 --file=database/r3_companion_step0_readback.sql
Prerequisite | Isolated compatible test database with reviewed migration/roles. These examples are not a release to use psql/CLI against hosted dev.

## Transactions, cleanup and decision
- Synthetic test writes require a reviewed single-session BEGIN/ROLLBACK path and confirmed cleanup. Otherwise stop before inserts; no unapproved DELETE workaround.
- Post-test synthetic fixture counts must return to baseline. Retain in-transaction evidence before rollback. Later H8-authorized real trial uploads are a separate committed stage.
- Preserve baseline objects/rows and distinguish successful migration installation from rolled-back test rows.
- Scan logs/evidence for actual AIza keys, sb_secret_/other API tokens, JWTs, password assignments and authorization headers; counts only, never matching values.
- Record untested/failed checks explicitly. AUD returns ACCEPT/REJECT/UNVERIFIABLE for actual evidence; workers never self-issue TV-1 ACCEPT.
- Missing source custody, runner, access, release or hosted proof remains a blocker. Offline R6 acceptance does not close TV-1.
