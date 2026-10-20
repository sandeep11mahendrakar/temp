# Worker assignment

**Task/row:** <ID and title>  
**Mode:** Implement | Investigate  
**Owner:** <worker/session>  
**Status/authorization:** <current board state and explicit assignment>

## Goal

<One observable outcome>

## Authoritative context

- Board directive and row: <path + ID>
- Latest relevant intercom: <timestamp/entry>
- Prior evidence/failure: <paths and short description>

## Scope

- Allowed files: <exact paths>
- Out of scope: <related but unassigned files/work>

## Acceptance

1. <behavior/result>
2. <required checks and expected evidence>
3. <required report or artifact>

## Restrictions

Preserve dirty work. Respect row ownership, locks, live-run HOLDER, USER-* gates, stop lists, and current pause orders. No secrets in output. No push, deletion, or unrelated cleanup. Do not update shared coordination records unless explicitly assigned.

## Return

Changed paths and diff summary; exact commands and observed results; numeric tests added per file when required; evidence paths; unresolved issues; next action. Separate attempted, completed, and verified work.


## Addressed review and continuation

Name the non-author AUD/PV recipient and the exact source/evidence revision. Include the required runtime/access preflight, inputs/schema/sample minimum, POS/NEG, commands, expected artifacts, human-only gate and the next serial owner/action.
Use addressed VERIFY_REQUEST -> ACK -> VERDICT -> INTEGRATED messages with unique IDs, one primary recipient, reply_to and revision. ACK is receipt only; SUB records integration separately.
If a recipient is inactive, record the pending request and route reassignment through SUB. Do not infer a verdict, auto-steal work, or close a task from a message exchange.
Keep all prior intercom lines unchanged; legacy messages remain visible for manual review.

## Minimum task context

Include objective and current evidence/revision; input schema and minimum valid sample; exact allowed files and out-of-scope paths; actual owner or pool; each dependency with why; runtime/access preflight and authorized fallback.
List executable POS and NEG controls with exact commands, expected outputs/artifacts, independent verifier, human-only decision, hard stop and named next action/serial owner.
If a stage is partial, state what passed, what remains, who owns the next action and the evidence needed; do not imply later-stage acceptance.
A requester may append WITHDRAW for its own unacknowledged request when the revision changes; then use a new request ID. After ACK, route cancellation to SUB. Withdrawal closes only the message exchange, never the task.
