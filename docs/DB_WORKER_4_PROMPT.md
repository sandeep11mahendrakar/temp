# PROMPT34 / worker 4
Activation | u r worker 4.
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

Lane | W4 => DB-6 -> DB-7 -> existing T-2; start DB-6 now; single safe-trial driver later.
DB-6 files | tools/fixtures/db-trial/*.json; docs/DB_TRIAL_EXPECTATIONS.md.
DB-6 deps | none; synthetic raw examples only; fixture IDs fixed per archive/report pair; no old archive overwrite.
DB-6 goal | Define clean, blocked, partial and contaminated inputs + expected outcome/integrity/eligibility/hash/availability; all trial examples excluded.
DB-6 controls | Mutated ID, secret in nested key/value, fake eligible trial, absent timing, failed partial execution; record expected rejections and original provenance.
DB-7 files | tools/r3DbWorkflow.js; tools/r3DbWorkflow.test.js; docs/DB_RUNBOOK.md.
DB-7 deps | DB-1,DB-3,DB-4,DB-6 DONE; orchestration only; consume P-1/P-2 and accepted uploader/exporter.
Workflow | One documented command path validates evidence, creates new archive, generates report, queues export, uploads only by explicit mode, and readbacks; default offline/dry-run.
Workflow | Given retained raw run artifacts, preserve source; report already archived must exist before immutable archive finalization; never repair old manifest in place.
Integration | Mock network tests invoke real accepted contract/export/archive/generator/uploader modules; cover whole path, not mocked assertions of own logic.
Controls | Upload fail still retains archive/outbox; duplicate/different payload; blocked/partial/TRIAL excluded; no implicit network; invalid source/hash refuses before POST.
T-2 carry | SUB assigns existing unclaimed T-2 to W4 after DB-5 and T-1 DONE; only owner shell/opencode network; acquire HOLDER before browser/service work.
T-2 scope | saucedemo clean; local zoo captcha-like expected BLOCKED, stop on challenge; local zoo iframe partial with failures. No new target/site or CAPTCHA retry.
T-2 record | New immutable run folder each; actual duration/calls/screens; missing cost/tokens NOT_RECORDED; source report + sanitized export + upload/readback receipts.
T-2 files | runs/<new-trial-id>/ via P-1; docs/evidence/db-trial/<new-id>/ sanitized proof; do not edit runtime/oracles/truths to improve outcomes.
T-2 accept | TV-2 independently verifies; a failed/blocked site outcome may be valid trial evidence, but failed upload/readback is not integration success.
Out of scope | SQL/uploader/exporter implementation, existing claims, research campaign, credentials in logs, browser/foreign-process takeover.

## PROMPT36 scheduling override
POOL | Fixed worker/lane reservations above are superseded by TASK_BOARD PROMPT36. Any W1..W4 may claim an eligible OPEN pool task; exact task scope/P35 verification remains.
PRESERVE | Current claims/VERIFY owners, dependencies, W-CODEX handoff, AUD/SUB/OWNER roles and live/access restrictions remain; use docs/DB_WORKER_POOL_PROMPT.md.
