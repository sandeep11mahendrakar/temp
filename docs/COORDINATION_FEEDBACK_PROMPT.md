# Coordination feedback round / paste to WORKER, SUB or AUD
Purpose | Diagnose taskboard/intercom friction from your own work; recommendations only. Keep your current role and active claim; no implementation or state/gate changes.
Identity | Set role=WORKER|SUB|AUD; name=<your assigned ID>; session=<known ID or NOT_RECORDED>; never invent another participant's feedback.
Read | Current role skill, project-taskboard + project-intercom skills; TASK_BOARD current DB/trial rows and latest directives; relevant INTERCOM entries; SUGGESTIONS historical+current coordination entries.
Focus | Examine your actual completed/blocked/contested tasks; cite file:line or commit per observed problem. Label unsupported explanations HYPOTHESIS.
Submission | Append one tagged block to docs/SUGGESTIONS.md via one Node fs UTF-8 append; ASCII, lines<=300 chars. Use ID=COORD-20261019-<role>-<name>; corrections append with reply_to ID.
Round rule | This owner-requested feedback round supersedes historical round-robin ordering for these submissions only. Do not wait for another participant; do not read all program history.
Header | id=<ID> | from=<role>:<name> | to=SUB | cc=MASTER | kind=SUGGESTION | task=COORD-REVIEW | IST=<timestamp>
Entry | problem | observed/hypothesis | evidence | concrete change | expected benefit | risk/counterexample | affected files | verification/control.
Cover | Missing task context; unnecessary vs real dependencies; chain ownership and next-stage handoff; worker-free queue; claim collisions/shared paths; unavailable runtime/human input discovered late.
Cover | From/to routing, message IDs/reply_to, acknowledgment vs resolution, unresolved inbox across restart, duplicate messages and quiet/inactive recipient.
Cover | Worker->AUD review->SUB integration delays, author independence, correct scope of rechecks, honest partial completion and preserving active legacy rows/history.
Task brief | Recommend sufficient context: objective, current evidence, inputs/schema, exact files, owner/pool, deps+why, runtime/access preflight, POS/NEG, commands, outputs, verifier, next action.
Dependency rule | Parallel independent files/contracts; serial tightly coupled stages with one claimed chain owner and named next action; never waive real contracts, audit independence or owner gates.
Required | Include an example improved task brief and an addressed VERIFY_REQUEST -> ACK -> VERDICT -> INTEGRATED exchange with one primary recipient per message.
Required | Propose a minimal implementation plan for one eventual worker task; identify a small first release, compatibility/migration plan and executable positive/negative controls.
Required | State what must remain human-only, what can be automated, and what must remain unchanged. Avoid model/provider/country blame without controlled evidence.
No counts | Do not invent elapsed times, number of missed messages or model-comparison performance. Use raw logs/timestamps if reporting a measurement.
Notify | Append one routed notification to docs/INTERCOM.md: id=<new unique ID>|from=<role>:<name>|to=SUB|cc=MASTER|kind=SUGGESTION_READY|reply_to=COORD-REVIEW-20261019|evidence=docs/SUGGESTIONS.md:<line>.
Writes | Allowed: your own SUGGESTIONS block and INTERCOM notification only; preserve all concurrent edits; no overwrite/broad staging/deletion/push; no secrets.
SUB extra | Submit your own tagged suggestions first; then append a CONSOLIDATION block listing received/missing role IDs, deduplicated items, KEEP/CHANGE/REJECT with reasons, conflicts and recommended bounded scope.
SUB extra | Read and acknowledge each addressed submission; preserve dissent and unreviewed status. Do not call feedback complete while expected participants are unaccounted for; absent feedback is not approval.
SUB return | Post from=SUB:<name> to=MASTER kind=CONSOLIDATION_READY reply_to=COORD-REVIEW-20261019 with exact suggestion section refs and missing responses.
MASTER next | After SUB consolidation and available participant evidence, master reviews and issues one bounded implementation task with independent AUD checks; no implementation task is activated by this prompt.
Return | Your ID, exact suggestion/notification lines, strongest changes, unresolved questions; resume existing eligible work. No new thread or cross-chat messaging required.
