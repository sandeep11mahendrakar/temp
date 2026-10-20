# PROMPT34 / worker 1
Activation | u r worker 1.
Authority | Owner requested complete DB delivery using W1..W4; master plans-only; implement only your assigned rows.
Context | Read CODEX_PROJECT_MEMORY.md; .agents/skills/project-worker/SKILL.md; project-taskboard + project-intercom skills; latest PROMPT34 board + intercom; docs/DB_INTEGRATION_PLAN.md.
Shared tree | You are not alone; preserve all other-agent/user edits and existing deletions. No reset/clean/stash/delete/push or broad staging.
Claims | Re-read row/deps/locks; claim only assigned eligible OPEN row; post claim + exact region. SUB owns shared row integration and VERIFY->DONE.
Coordination | You may append your own claim/DONE-PROOF/Q/PING and evidence ledgers via Node fs UTF-8; do not edit another row or decision.
Evidence | One run/commit per decision; raw command+exit; tests_added numeric per file; targeted tests + Vision/MCP regression as required; scan changed tracked+untracked files without printing matches.
Delivery | Every row has a negative control; fix DONE requires measured delta>0 or hard-block proof; implementation -> VERIFY, independent AUD -> SUB flip.
Safety | No credentials in outputs; env values never echoed. No endpoint/key access from offline Codex. No flags inferred; no campaign/stop-list expansion.
Continuation | After DONE-PROOF claim next eligible assigned row; dependency blocks => Q/PING and another eligible task; no claim stealing.
Return | row/state | files/diff | commit | exact commands+exit | tests_added/file | negative control | delta | evidence | blocker | RESUME next=<row>.

Lane | W1 => DB-1 -> DB-4 -> existing T-4 -> DB-8; start DB-1 now after claim sweep.
DB-1 goal | Freeze an executable, source-cited envelope contract without changing executor semantics.
DB-1 files | docs/DB_FIELD_MAP.md; tools/r3DbContract.js; tools/r3DbContract.test.js.
DB-1 deps | P-1/P-2 recorded DONE; approved DB plan. Publish field names/types + module exports early; SUB/AUD accepts before downstream finalization.
Contract | r3_runs keys include identity/app/comparison/platform/stage, schema_version, experiment_kind, outcome/integrity/eligibility, supersedes_report, manifest/report, source hashes, payload_sha256.
Contract | Define canonical JSON hash inputs excluding payload_sha256 and server timestamps; preserve numeric zero vs missing; statuses and source pointers explicit.
Controls | Reject manifest/report ID mismatch, unsupported status, guessed A/B pairing, malformed roots/hash/eligibility, trial marked ELIGIBLE; no token defaults.
DB-4 files | tools/r3DbExport.js; tools/r3DbExport.test.js; docs/DB_REPORT_COVERAGE.md.
DB-4 deps | DB-1 DONE; consume P-1/P-2 without editing their files or old archives.
Export | Validate -> sanitize allowlisted fields/keys+values -> compute export hash -> immutable outbox; retain original hashes and source version; stable paths.
Report | Map every original template section to evidence/output/NOT_RECORDED; implement DB-facing fields, expose unimplemented report sections honestly; no claim that compact summary is full template.
Controls | Secret in key/value/URL, absent telemetry, source-vs-export hash distinction, changed same-ID payload, clean/blocked/partial/contaminated fixtures.
T-4 carry | SUB assigns existing unclaimed T-4 to W1 after T-3 DONE; docs/TRIAL_REPORT.md <=60 lines; retain TV-4 independent review.
DB-8 files | docs/DB_COMPLETION_REPORT.md only; deps accepted DB deliverables + T-4 DONE; source-cited handoff, commands, failure limits, current backend and trial IDs.
DB-8 control | Remove a required backend/trial evidence reference in a temporary check input => closure fails; never fabricate COMPLETE.
Out of scope | SQL, uploader, workflow, runtime sources, existing shared template/history, live uploads.

## PROMPT36 scheduling override
POOL | Fixed worker/lane reservations above are superseded by TASK_BOARD PROMPT36. Any W1..W4 may claim an eligible OPEN pool task; exact task scope/P35 verification remains.
PRESERVE | Current claims/VERIFY owners, dependencies, W-CODEX handoff, AUD/SUB/OWNER roles and live/access restrictions remain; use docs/DB_WORKER_POOL_PROMPT.md.
