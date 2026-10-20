# TV1 R3 offline diagnostic runner - SUB repair

Scope | Disposable persisted PGlite only; no Supabase/remote/browser/upload/credential access.
Runtime | Installed tools/.tv1-runtime package; runner records SELECT version(), current role and actual package version.
Prerequisite | Explicit expected-baseline profile required; zero and six are LOCAL fixture definitions, not hosted approval.
Fixture | --fixture-baseline zero is default; six creates local runs + five views with one retained source row.
Baseline | Measure all public table/view/sequence objects except the three named R3 relations; indexes/constraints are included in metadata shape.
Comparison | Exact expected object names checked before diagnostics; executor stores measured fingerprint in temp expectation outside diagnostic transaction.
Rollback | SQL compares actual baseline before/after; executor explicitly rolls back and closes on error; reopens SAME data directory for fresh cleanup checks.
Rows | Six-object local fixture seeded row is compared separately; metadata fingerprint alone is not arbitrary row-data preservation proof.

## Literal commands (each evidence directory must be new)
node --check tools/tv1LocalRunner.js
node --check tools/tv1LocalRunner.test.js
node --test tools/tv1LocalRunner.test.js
node tools/tv1LocalRunner.js --self-check --expected-baseline zero --evidence-root docs/evidence/tv1-r3/fresh-zero
node tools/tv1LocalRunner.js --self-check --expected-baseline six --fixture-baseline six --evidence-root docs/evidence/tv1-r3/fresh-six

Evidence | run.json: actual runtime, source hashes, baseline, parsed case states, rollback/close/errors and fresh postcheck.
Evidence | notices.json: raw NOTICE messages; results.json: complete db.exec statement result arrays with actual SELECT rows.
States | NOTICE code00000 is not expected denial SQLSTATE; actual_state is parsed from SQL assertion message.
Failure | Nonzero on any execution/rollback/close/postcheck failure; original exception preserved alongside cleanup errors.
No overwrite | Existing evidence directory refuses before session construction. Prior submission evidence is unchanged.
Capture tests | Set TV1_TEST_EVIDENCE_ROOT to a fresh directory to retain each control raw JSON; owned disposable DB directories are cleaned by tests.
Windows | Sandbox temporary-path remapping may abort persisted PGlite reopen; approved local execution is required for that environment.
Limits | Failure hooks are explicit local test faults; actual positive SQL cases run the unmodified diagnostic body and original migration.
Limits | Fingerprint covers recorded relation metadata, not every function/policy/trigger in the whole database.
Limits | Hosted identity/access/migration, stored-envelope digest and transport retry remain separate independent gates.
Acceptance | Self-check exit0 is local evidence only; independent AUD verdict + SUB integration are required. No hosted TV1 DONE.
