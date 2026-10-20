# OC-DB executor R1 - consolidated independent AUD repair request
Status | REJECT / NOT APPROVED; DB5 remains BLOCKED. No hosted action or migration retry authorized.
1 Coverage | Replace minimum16+one-per-group rule with exact required case-ID set derived from current P59, including every role/action subcase.
2 Mapping | Supply an explicit executable atomic case plan: SQL, roles, four synthetic IDs, expected rows, SQLSTATE and named constraints. Old-R2 provisional matrix + empty template is insufficient.
3 Approval | Caller JSON booleans and caller hashes are not approval. Bind trusted external authorization to exact executor+plan+target+operator+route; never claim a field clears the platform safety block.
4 SQL scope | Top-level regex permits unsafe WITH/function paths. Use an exact independently reviewed query allowlist or equivalent strict enforcement; bind every fixture write to the four approved synthetic IDs.
5 Bounds | Add bounded client-side execution/I-O/cleanup watchdogs. Server/connect timeouts alone do not bound stalled reads, rollback or close.
Tests | Add negatives for missing/replaced/extra cases, wrong release binding, unapproved SQL/CTE/function/write IDs and stalled execution/rollback/close. Fake tests are control-flow evidence only.
Freeze | One complete corrected package with current P59 sources, explicit plan/matrix, executor, tests, dependency versions, exact hashes and raw outputs; then independent AUD review.
Current P59 | docs/evidence/tv1-runner-review/20261019193033-sub-r6/SUB_SNAPSHOT.json | revision87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9.
Key sources | database/TV1_Diagnostics_R3.sql; database/r3_companion.sql; tools/tv1LocalRunner.js; tools/tv1LocalRunner.test.js; docs/TV1_R3_EXPECTED_OUTPUT_MATRIX.md; docs/TV1_R3_OFFLINE_RUNBOOK.md.
Boundary | Local runner rejects remote use; do not mechanically paste procedural SQL into a bare-statement executor. No placeholders, fabricated execution or local16-to-hosted aggregate conversion.
Procedure | SUB corrected status to proposal present but unapproved in docs/DB5_HOSTED_PROCEDURE_R3.md; prior evidence preserved.
Access | Normal authorized migration-tool approval still required. Do not use direct psycopg, another API or transport to bypass the prior restriction.
