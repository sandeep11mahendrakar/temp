# OC-TRIAL: TV-1 diagnostics offline repair and executable self-verification

Authority | Owner explicitly assigns idle OC-TRIAL to finish diagnostics repairs and self-check before independent AUD review.
Scope | Existing DB-5 preparation / TV-1 diagnostic implementation sub-scope; no new task row or competing claim on auditor TV-1.
Identity | OC-TRIAL remains H4 holder but this assignment is OFFLINE ONLY. No browser/model/site/connector/remote SQL/upload/install action.
Coordinator | SUB records scope and integrates; AUD-1 independently reviews exact final revision. Self-test PASS is not AUD ACCEPT or hosted TV-1 DONE.

## Onboarding and frozen context
Read AGENTS.md, CODEX_PROJECT_MEMORY.md, worker/context/taskboard/intercom skills and current P58/P59 plus relevant Intercom.
Inspect git status and exact file ownership before edits; preserve all dirty/untracked work. Node fs UTF-8 for documentation; ASCII <=300-char lines; append history, never overwrite others' source.
Read database/r3_companion.sql, docs/TV1_CHECKLIST.md and accepted R6 references. R6 accepted sources and migration MUST remain unchanged.
Read current source inputs at C:/Users/sandeep/pes/temp/TV1_Diagnostics_R2.sql and C:/Users/sandeep/pes/temp/TV1_R2_EXPECTED_OUTPUT_MATRIX.md.
SQL SHA256 | 20ec3ddba19e9d57d73256bcccaf441ca67558f0622edb1208f2686c1acfa893 | 31881 bytes / 472 content lines.
Matrix SHA256 | 8472c59506f07a92edf1cf3045fcd54f6dd7caf527089d6df2f9459383482166.
Review | TV1D-V-AUD1-R2 rejects target fit: six pre-existing team objects are mandatory in R2, whereas the approved personal dev baseline was reported empty.
Accepted static shape | Preserve existing RLS/invoker assertions, role/action negatives, named constraints, exact eligible membership, duplicate assertions and rollback/postcheck design.
Unverified | SQL was never run; constraint ordering/version support, baseline survival and executor cleanup still need actual offline execution proof.
Existing environment | Earlier DB2/R6 replay used isolated PGlite0.5.10 / PostgreSQL18.6. SUB asked AUD-1 for its known runtime recipe. Reuse installed runtime; do not assume an import path or download packages silently.

## Exact write ownership (released prospectively by SUB)
- database/TV1_Diagnostics_R3.sql
- tools/tv1LocalRunner.js
- tools/tv1LocalRunner.test.js
- docs/TV1_R3_EXPECTED_OUTPUT_MATRIX.md
- docs/TV1_R3_OFFLINE_RUNBOOK.md
- docs/evidence/tv1-r3/<fresh-id>/ : source hashes, SQL/NOTICE/output, commands/exits, case matrix, cleanup and runtime proof.
If any allowed file already has another active author, stop that edit and ask SUB; do not overwrite. Preserve R2 as historical source; create R3 separately.
Outside scope | Original migration/R6 scripts, uploader/report/adapter code (OC-CODE owns), live runbook/browser code, team schema, remote access and authoritative row flips.
DB-5 row stays W2; AUD owns TV-1 review; OC-DB retains hosted preparation. OC-TRIAL alone writes the named R3 local diagnostic files to avoid duplicate work.

## Implement the actual repair
1. Replace hardcoded six-object assumption with an explicit expected-baseline input. Missing/malformed inventory must fail before fixtures; never silently define expected baseline from whatever the DB returns.
2. Distinguish zero pre-existing TEAM objects from an empty whole database: R3 migration objects and system/extensions can exist. Compare exact approved object scope/definitions; do not infer current hosted state from a dated report.
3. Support the primary isolated personal-dev fixture with zero pre-existing team objects. Also test an explicitly separate synthetic six-object compatibility fixture; those are test objects in a fresh local DB only.
4. Never create placeholder team objects on hosted dev to make checks pass. Hosted baseline must later come from owner-approved live read-only inventory; this local runner cannot provide it.
5. Preserve NEG01/02 anon/authenticated actions and views; NEG03 service privilege denial vs privileged trigger rejection; NEG04 conflict and identical retry; all NEG05 named constraint controls; NEG06 exact membership/readback count.
6. Observe SQLSTATE and CONSTRAINT_NAME on the local engine. Isolate overlapping TRIAL constraints where possible; verify any remaining ordering assumption against the actual tested version and record its compatibility limit.
7. Capture runtime/server version and role capabilities. If pg_has_role(...,'SET') is unavailable, fail with an explicit version/capability result; do not mislabel unsupported syntax as a passing denial.
8. Implement a LOCAL-ONLY executor using the available isolated PGlite/local-Postgres runtime. No remote URL, Supabase project, service key or network mode. Reject unknown/remote connection flags and never read credential files.
9. Prove a single controlled session and correct transaction boundaries: preflight baseline capture, explicit test BEGIN, fixture assertions, explicit ROLLBACK, postcheck. Do not naively split SQL on semicolons inside DO blocks.
10. Keep the preflight fingerprint both in the right session state and in external evidence. Do not accidentally wrap the whole script so rollback erases its baseline. Test the actual driver behavior; do not assume it.
11. On EVERY failure after opening a session, explicitly rollback as applicable and close in finally. If rollback itself fails, still attempt close and report both failures. Retain original error identity, SQLSTATE and case.
12. Verify cleanup after normal completion AND induced failure using a fresh view/session of the same disposable local database where supported. Prove no persisted synthetic rows and unchanged baseline; do not rely on a comment or discarded memory alone.
13. Capture raw NOTICEs plus SELECT results and command exits. Missing output case is a failure. Avoid raw credentials/payload secrets; output test IDs, codes/counts and safe fingerprints only.
14. Matrix must exactly describe emitted cases, tested role/version, metadata fingerprint scope and limitations. Table-row preservation is not proved by schema fingerprint alone; test separate local baseline fixture rows if claiming row preservation.
15. Keep transport-level hosted retry/hash behavior and R6 stored-envelope digest verification separate. SQL uniqueness alone is not uploader idempotency or payload integrity proof.

## Mandatory executable self-verification
Use genuine SQL execution in disposable local databases, not grep-only checks or a mock that returns canned rows.
POS-A | Zero-team-object baseline + unchanged reviewed migration/roles -> all named SQL cases pass -> rollback -> zero synthetic rows -> baseline unchanged.
POS-B | Explicit six-object LOCAL synthetic fixture -> same controls -> baseline schema and any seeded fixture rows preserved; never present this as hosted teammate proof.
NEG-A | Omitted/wrong expected baseline, including expecting six where actual is zero and expecting zero where actual has approved-fixture objects -> fail before writes.
NEG-B | Unexpected object/fingerprint drift or pre-existing diagnostic-prefix row -> refuse; preserve pre-existing data.
NEG-C | RLS off, wrong view invoker, disabled mutation trigger or insufficient execution role -> reject for the intended reason, not an unrelated setup error.
NEG-D | Inject error after synthetic INSERT -> observed exception -> rollback + close -> fresh cleanup check finds zero synthetic rows, baseline unchanged.
NEG-E | Inject notice-capture/runner failure and rollback failure separately -> close still attempted, no success verdict fabricated; retain actual cleanup outcome.
NEG-F | Attempt remote URL/project arguments -> fail before opening anything; no network or credential reads.
Observe all actual case outputs from R3. Add no arbitrary test-count target and never print expected results as observed results.
Implement these CLI commands and verify the documented grammar literally:
node --check tools/tv1LocalRunner.js
node --check tools/tv1LocalRunner.test.js
node --test tools/tv1LocalRunner.test.js
node tools/tv1LocalRunner.js --self-check --evidence-root docs/evidence/tv1-r3/<fresh-id>
The last path is a new evidence directory chosen by the runner/operator, not an existing retained archive. Document a concrete invocation from your actual run, not placeholder-only instructions.
If the local SQL runtime is missing, first use the known installed runtime recipe from AUD/SUB. If still unavailable, return exact import/command error and required component; continue runner/static work instead of retrying installation or claiming SQL PASS.

## Repair/self-check loop and independent handoff
A. Implement a bounded change, run affected tests and the actual SQL matrix.
B. For each failure: preserve raw output; distinguish expected negative from harness failure; fix cause within scope; rerun affected checks.
C. Once affected checks pass, run the complete local diagnostic self-check once to confirm interactions and cleanup.
D. Do not repeatedly ask AUD to discover defects your own required controls can catch. Do not repeat already passing unrelated suites without a new relevant change.
E. Repeated identical failure means reconsider the approach and report precise limitation; never loop forever, weaken assertions, generate fake output or change accepted migration to get green.
F. When all required offline controls pass, freeze files and emit one source hash manifest plus sorted relative-path|sha256hex aggregate (LF-join, no terminal LF).
G. Post DONE-PROOF and addressed VERIFY_REQUEST to AUD-1 with exact revision, commands/exits, runtime, observed case matrix, POS/NEG cleanup evidence, tests_added/file provenance and remaining hosted gates.
H. AUD independently reproduces/reviews; SUB integrates offline scope only. If AUD rejects, map each finding to a regression control, repair and self-check before submitting a new revision.
No automatic DONE, hosted ACCEPT, user-gate change or evidence fabrication. No new thread or scheduled heartbeat is needed for this implementation loop.

## Completion boundary
Deliver runnable, self-tested OFFLINE diagnostics and executor, with target-appropriate baseline handling. This clears implementation uncertainty, not hosted deployment permission.
Remain honest if a primitive/runtime property is unverified. Model/browser/DB access, H8 upload, real trial artifacts, actual hosted digest/readback and owner freeze stay separate.
Keep H4 and the preserved startup-only probe; do not repeat the probe or launch trials during this assignment.
Return | changed paths; frozen revision; exact commands/raw exits; measured case matrix; local cleanup proof; independent review request; unresolved owner-only gates.

## Runtime preflight update
SUB checked five known Node resolution roots: PGlite unresolved. npm cache ls @electric-sql/pglite returned no cached entry. These checks do not prove no runtime exists elsewhere.
AUD-1 could not provide a known-working import path. Recorded DB2 evidence names PGlite0.5.10/PostgreSQL18.6; no current runtime availability is inferred.
Owner decision pending: allow isolated pinned PGlite0.5.10 install, or provide an existing runtime path. Until then continue implementation/preparation; do not claim real SQL self-check PASS or download without approval.

## Runtime available - supersedes pending setup above
Owner approved isolated installation; installed and smoke-tested 2026-10-19 17:22 IST.
Package | tools/.tv1-runtime/package.json + package-lock.json; @electric-sql/pglite pinned exactly 0.5.10; install used --ignore-scripts --no-audit --no-fund.
Resolve from repo root | require.resolve('@electric-sql/pglite', { paths: [require('node:path').resolve('tools/.tv1-runtime')] })
Verified module | tools/.tv1-runtime/node_modules/@electric-sql/pglite/dist/index.cjs
Verified smoke | fresh in-memory SELECT version() AS engine_version, 1 AS smoke -> PostgreSQL18.6, smoke=1; db.close() completed; exit0.
Evidence | docs/evidence/tv1-runtime-setup/PGLITE_SMOKE.json. Setup proves runtime availability only, not diagnostic correctness or hosted SQL behavior.
OC-TRIAL may now execute the released isolated diagnostic tests and self-check loop. No further install approval needed for this installed dependency; no hosted/browser/network mode released.
Keep node_modules out of commits/exports. Preserve the package lock; no root package.json was created.
