# PROMPT34 / worker 3
Activation | u r worker 3.
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

Lane | W3 => DB-3a -> DB-3 -> existing T-3; start DB-3a now; T-1 source still belongs to W-CODEX until explicit handoff.
DB-3a files | docs/DB_SERVER_UPLOAD.md only.
DB-3a goal | Document approved server-only secret/legacy service-role transport, key-header rules, no public grants, outbox retry/readback and redaction; no secrets read.
DB-3a deps | none; use approved DB plan; current official Supabase docs on key handling when network-capable connector exists.
DB-3a controls | Checklist rejects browser privileged key, key logged/persisted, anon-only access to denied table, secret key sent as JWT, mocked RLS asserted as live.
DB-3 deps | DB-1,DB-2,DB-3a,DB-4 DONE + SUB-recorded W-CODEX handoff.
DB-3 files | tools/trialUploader.js; tools/trialUploader.test.js.
Handoff | Capture T-1 dirty diff/hash and author acknowledgment; inherit all working code/tests; stop overlapping edits until released; handoff is not backend acceptance.
Transport | Use accepted exporter/contract; server env only; secret key api-key header vs legacy JWT authorization correctly; never mutate payload with credentials.
Transport | Configurable accepted table/view; bounded timeout/retry; immutable local outbox; no response body/error credential leakage; exact-ID GET independent of eligibility view.
Duplicate | After ignored insert fetch exact row; same payload hash => success; differing hash => conflict; do not confuse HTTP success with matching stored data.
Controls | All supported synthetic auth modes; malformed config; duplicate/conflict; network timeout/retry retains outbox; forbidden payload key/value; hash tampering; excluded-row readback.
T-1 link | DB-3 acceptance updates the implementation evidence attached to existing T-1/TV-1; backend proof remains DB-5; no duplicate uploader row closure.
T-3 carry | SUB assigns existing unclaimed T-3 to W3 after T-2 DONE; network only owner shell/opencode; no extra website.
T-3 files | docs/evidence/db-roundtrip/<new-id>/ sanitized machine output; reuse accepted uploader/workflow readback.
T-3 controls | Compare local source hashes + canonical stored payload hash and manifest identity; duplicate one row; research view excludes TRIAL; mismatch must fail.
Out of scope | SQL, exporter source, workflow, original P-1/P-2 code, T-1 before handoff, safe-site driver.

## PROMPT36 scheduling override
POOL | Fixed worker/lane reservations above are superseded by TASK_BOARD PROMPT36. Any W1..W4 may claim an eligible OPEN pool task; exact task scope/P35 verification remains.
PRESERVE | Current claims/VERIFY owners, dependencies, W-CODEX handoff, AUD/SUB/OWNER roles and live/access restrictions remain; use docs/DB_WORKER_POOL_PROMPT.md.
