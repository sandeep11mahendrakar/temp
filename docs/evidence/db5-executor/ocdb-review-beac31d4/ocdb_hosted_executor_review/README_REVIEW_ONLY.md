# OC-DB — proposed hosted SQL diagnostic executor (independent review package)

**Status: PREPARATION / UNEXECUTED / NOT APPROVED FOR HOSTED USE.** The existing Supabase migration safety block remains active. This package is **not** a permission to retry through CLI, a direct PostgreSQL connection, SQL Editor, a different account, or split migration SQL. Only the normally approved route, with a new explicit SUB + owner/operator/AUD release, can allow future use. This package does **not** apply any migration or upload data.

## Inputs and missing provenance

- Target (owner/SUB-confirmed): personal development main project, shared=N, `capstone-r3-dev`, ref `xvizjawcpafdqrygzvcx`, org `qwgbhcakpfwytcrryuxd`, region `ap-south-1`.
- Immutable migration custody: `database/r3_companion.sql`, SHA-256 `b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6`. The migration is **not** bundled here or applied by this runner.
- Offline R6 `9fe071c560826b4cf4e578cda619e66f9aa685edf72245806b20cc3dd1352def` is **not** hosted proof.
- SUB says the corrected P59 diagnostics/local runner passed 16/16 with zero-team and six-object fixtures. **Exact P59 sources and the corrected SUB R2 procedure were not attached to the current conversation and could not be inspected.** The subcase matrix is *provisional based on the older R2 expected matrix*; a reviewed case plan is deliberately **not** provided. The template is intentionally non-executable and rejected by validation.
- The available prior procedure (`OC_DB_DB5_HOSTED_PROCEDURE_UNEXECUTED_20261019.md`) had rejected evidence boundaries; this is a **separate** code artifact. Neither source validation nor 13 simulated tests equates to hosted TV-1 proof.

## Execution design — to be independently reviewed, not invoked yet

1. **External authorization, before any connection:** Independently authenticate SUB/owner release for the exact project, role, reviewed P59 plan hash, hosted-capable runner, credential handling, and the specifically permitted transport. A signed/independently audited approval is needed; the runner only checks the *fields* of a provided release JSON and **cannot authenticate human authority**. Even a `hosted_executor_approved=true` field cannot clear platform safety restrictions. In particular, a migration call previously blocked by safety checks may not be rerouted to this executor.
2. **Plan custody:** Auditor supplies an immutable case-plan JSON whose `sha256` must match `--reviewed-plan-sha256`. It contains a case per SQL subcase: `id`, `role`, `sql`, `params`, optional `fixture_id`, and exact expected `rows`, `rowcount`, or `sqlstate`+`constraint` (no hard-coded credentials or real-row contents). No original P59 SQL is altered, reconstructed, or automatically transformed by this package. A new granular plan derived from P59 requires separate static review.
3. **One connection for the test transaction:** The runner opens one psycopg 3 connection with autocommit enabled *solely to control explicit transaction boundaries*; issues exactly one `BEGIN`; retains its backend PID; takes a hashed non-R3 public-schema baseline; sets per-statement timeout and idle-in-transaction timeout. No `COMMIT` exists anywhere in the runner.
4. **SQLSTATE-level execution and recovery:** Each reviewed case uses that same connection and a generated `SAVEPOINT`. For a negative test, the driver exception's `.sqlstate` and `.diag.constraint_name` are captured without its message. `ROLLBACK TO SAVEPOINT` restores the transaction for subsequent cases. Each case results in `{case_id, role, expected, raw, status}` with raw driver SQLSTATE, constraint, rowcount, or allowlisted synthetic scalar rows. An unexpected SQL success, wrong constraint, wrong count, missing result, or SQL error stops the case loop and marks the run FAIL.
5. **Guaranteed *attempt* at rollback and close:** In `finally`, the main connection receives a single `ROLLBACK` and then `.close()` even if a test errored, was interrupted, or rollback itself failed. Both acknowledgement and failure are captured. These cannot be guaranteed against SIGKILL/power loss/network partitions; the result remains FAIL/UNVERIFIED without independent confirmation.
6. **Fresh read-only cleanup:** After attempting to close the main session, the runner opens a **different connection**, sends `BEGIN READ ONLY`, compares the hashed pre/post non-R3 **public-schema** object baseline, queries persisted count for exactly four synthetic fixture IDs (must equal `0`), and checks the original backend PID no longer appears in `pg_stat_activity` (must equal zero). This second session itself receives `ROLLBACK` and `.close()` in `finally`. If it cannot query, find a PID, close, or verify zeros, the result is FAIL.
7. **Raw evidence + fail-closed status:** Output is JSON, reserved before any connection as `INCOMPLETE` with exclusive create, replaced atomically with final sanitized results after cleanup. A crash cannot silently yield PASS. No credentials, connection strings, SQL text, bound values, error messages, payloads, or arbitrary database strings are logged. Every subcase has its own expected/observed fields and status. `PASS_SQL_DIAGNOSTICS_ONLY` is narrower than TV-1 ACCEPT and does not claim transport/digest proof.
8. **TLS/project isolation:** At execution, the environment variable `OCDB_DATABASE_URL` is used only after release checks; its hostname must exactly match `db.xvizjawcpafdqrygzvcx.supabase.co` and psycopg uses `sslmode=verify-full`. Other hosts, poolers, projects, and branches are refused by this **proposal**. Read-only plugin identity/collision/migration-history checks immediately before a single eventual approved apply remain separately required.

## Evidence boundaries and limitations for AUD

- `SQL_SUBCASE_EXPECTED_MATRIX_PROVISIONAL.md`: 40 provisional subcases/checkpoints from older R2, **all actual values NOT RUN**. The P59 `16/16` is a *local control count*, not these SQL subcase counts, and cannot be mapped byte-exactly without P59 source.
- This generic runner intentionally rejects case-plan control statements, procedural `DO` blocks, semicolon-delimited SQL, and DDL. Consequently, **P59 cannot be assumed executable here unchanged**; independent review must map approved P59 subcases to separately reviewed atomic SQL and validate expected results. No auto-conversion is implemented.
- The SQL validator is conservative defense in depth, **not a full SQL parser**. It cannot by itself prove every approved query is read-only, scoped, or free of side effects. An independent auditor must inspect each exact query and parameters before approval.
- Public non-R3 schema baseline fingerprint includes object shape, views, grants, constraints, and indexes, but is **not** a full database backup, not all schemas and not table data. The synthetic test readback checks exactly four reviewed fixture IDs only, not all possible writes by an unreviewed SQL statement. Independent transaction guard plus SQL review remain mandatory.
- Server-side transaction abort on connection loss is PostgreSQL behavior, but a client cannot force or attest immediate session closure during a network partition. The required independent fresh PID/row check detects lack of proof and fails closed; SIGKILL may leave an `INCOMPLETE` evidence file, requiring operator reconciliation.
- Transport identical-retry/hashing proof must come from the independently approved uploader; stored-envelope digest recomputation (positive matching and negative altered/pinned payload) must use accepted `tools/r3DbContract.js` semantics on actual hosted rows. **Both remain `NOT_COVERED`.**
- The release field values are merely assertions until independently authenticated by SUB/AUD; never treat the template as permission or as an alternative to the safety-blocked migration tool.

## Offline tests performed in this preparation

Only `python -m unittest -v test_ocdb_hosted_executor.py` was run with injected **in-memory fake connections**. The 13 local tests cover expected SQLSTATE/savepoint behavior, one BEGIN and ROLLBACK on the main connection, new read-only cleanup connection, zero/six synthetic schema-baseline simulations, unexpected errors, interrupt, rollback failure, close failure, leftover synthetic rows, active old PID, baseline drift, cleanup query failure, redaction of error messages, plan restriction, and project/release gating. Actual output is in `OFFLINE_FAKE_TEST_OUTPUT.txt`: **13/13 PASS**, no PostgreSQL driver installed or imported by tests and no network/hosted SQL used.

## Conditions for any later execution

1. SUB supplies the corrected R2 and **exact P59 files**, hashes, reviewed mapping, and independent AUD approval.
2. Owner/SUB resolves the real platform safety/access restriction through the normal supported path; it is not acceptable to use this direct-Postgres executor merely as an alternate transport.
3. Independent AUD approves this hosted-capable design, mandatory TLS, authorization process, atomic plan and its hash, 4-fixture cleanup scope, special PostgreSQL owner-role preflight, and deployment as a **distinct authorized executor**.
4. Owner/OC-DB confirms credentials remain in environment only, with a documented secret-scan policy; package output paths are private and artifact hashes and permission controls recorded.
5. One approved migration is applied and verified independently; then a separate explicit run approval permits synthetic hosted diagnostics. No live trials or uploads are implied.
6. Only then, after a new mandatory read-only project/objects/history preflight, the reviewed executor may be invoked under the approved route. Independent AUD receives hosted sanitized raw evidence and issues any acceptance verdict; OC-DB does not self-issue TV-1 ACCEPT or DONE.

## Files

- `ocdb_hosted_executor.py` — gated psycopg 3 harness, not an approved transport.
- `test_ocdb_hosted_executor.py` — deterministic in-memory fake adapter; never calls Supabase.
- `OFFLINE_FAKE_TEST_OUTPUT.txt` — exact simulated test output.
- `SQL_SUBCASE_EXPECTED_MATRIX_PROVISIONAL.md` — provisional expected SQLSTATE/case outputs, no observations.
- `CASE_PLAN_TEMPLATE_NOT_APPROVED.json` — intentionally empty and non-executable; no approved case SQL supplied.
- `RELEASE_TEMPLATE_NOT_APPROVED.json` — deliberately non-authorizing; boolean clearance flags false.
- `FILE_SHA256_MANIFEST.txt` — artifact custody hashes, no credential values.
