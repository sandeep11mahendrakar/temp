# PROMPT34 / worker 2
Activation | u r worker 2.
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

Lane | W2 => DB-2a -> DB-2 -> DB-5; start DB-2a now; this is the only deployment lane.
DB-2a files | docs/DB_SQL_REVIEW.md; database/r3_inspect.sql.
DB-2a deps | none; use approved DB plan + pinned remote setup source; read-only inspection SQL, no connection.
DB-2a goal | Prepare current-schema/grants/RLS/triggers/view/name-collision/capacity inspection queries and team-object preservation baseline.
DB-2a controls | Synthetic backend metadata missing PK/RLS or allowing UPDATE => review checklist identifies failure; existing team objects must remain unchanged.
DB-2 files | database/r3_companion.sql; database/r3_companion.test.sql.
DB-2 deps | DB-1 + DB-2a DONE; use accepted contract, not guessed JSON columns.
SQL | Add companion table + named constraints/indexes; RLS on; revoke public roles; required backend INSERT/SELECT; no changes to shared runs table.
Immutable | RLS bypass does not permit UPDATE/DELETE; enforce companion-only grants and trigger. Same-ID same hash no-op; different hash conflict verified by transport.
Views | security_invoker eligible-only research view excludes TRIAL; evidence readback includes excluded runs for authorized backend; do not leak to anon.
Tests | SQL allow/deny controls: anon/authenticated access, UPDATE/DELETE refusal, constraints, duplicate ID, TRIAL exclusion and unchanged team objects.
SQL evidence | SQL static review is not executed Postgres evidence; run locally if authorized runtime available; otherwise report hard blocker with runnable commands.
DB-5 deps | DB-2,DB-3,DB-4,DB-7 DONE; explicit owner DB-access order/environment; SUB live coordination; no USER-* flag inferred.
DB-5 files | docs/evidence/db-backend/<new-id>/ sanitized metadata+logs; no key-bearing config/report.
Deployment | Owner shell/opencode with network only; inspect first, stop on name collision/design fork; apply accepted additive SQL; capture before/after evidence; no destructive rollback.
Backend controls | Same upload twice yields one row; changed hash conflicts; UPDATE/DELETE refused; unauthorized access denied; research view filters; exact-ID readback includes trial.
Gate return | AUD backend verdict -> SUB closes DB-5 and resolves TV-1/T-1; no worker self-closing.
Out of scope | Team schema/helper rewrites, credential collection, executor edits, safe-trial driving, campaign.

## PROMPT36 scheduling override
POOL | Fixed worker/lane reservations above are superseded by TASK_BOARD PROMPT36. Any W1..W4 may claim an eligible OPEN pool task; exact task scope/P35 verification remains.
PRESERVE | Current claims/VERIFY owners, dependencies, W-CODEX handoff, AUD/SUB/OWNER roles and live/access restrictions remain; use docs/DB_WORKER_POOL_PROMPT.md.
