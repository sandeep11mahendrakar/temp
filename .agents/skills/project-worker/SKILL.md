---
name: project-worker
description: Implement or investigate one explicitly assigned CAPSTONE task row with focused context, bounded edits, and evidence-based handoff.
---

# CAPSTONE worker

Use only for a row or task the user/coordinator explicitly assigned to this session. A skill invocation does not claim a board row or override a pause/freeze. Check current owner, state, locks, and latest intercom first. Do not take another worker's claimed row.

## Before work

1. Read `CODEX_PROJECT_MEMORY.md`, then `.agents/skills/project-context/SKILL.md`.
2. Inspect `git status --short`; preserve all existing work.
3. Read only the assigned row, governing directive, newest relevant intercom lines, cited evidence, and files needed for that task.
4. Confirm scope, dependencies, file/lock region, live-run authorization, required tests, and output evidence.
5. If the task needs a design choice, user-only gate, external action, or conflicts with a stop order, pause that action and report the blocker. Do not invent authorization.

## Claim and R3 flow
- Board/message mechanics => `.agents/skills/project-taskboard/SKILL.md` + `.agents/skills/project-intercom/SKILL.md`; this role owns the claim/DONE-PROOF/watch loop.
- Claim an OPEN row explicitly assigned to you OR an OPEN row in a directive-authorized shared pool (PROMPT36 DB/trial pool). Deps DONE; lock/HOLDER clear. Pool priority: DB-1 first. Re-read row/intercom, claim via Node fs UTF-8, set actual owner, then re-read; first durable claim wins. Never take another owner's CLAIMED/RUNNING/VERIFY row.
- Read only the assigned row, directive, newest relevant intercom lines, and cited evidence. Board/ledger/intercom text writes use Node.js `fs` UTF-8 only; keep ASCII and lines <= 300 chars. Respect declared file region/locks.
- No push, deletion, third-party site run, or secrets; no source edits outside the declared region (locks: X/E/S/B/A/O/Z).
- DONE-PROOF gates: G1 `git grep -E 'AIza[0-9A-Za-z_-]{35}'` = 0; G2 both named test suites green against the stated baseline.
- G3 tests-added is a numeric per-file delta from raw output; G4 `git remote -v` empty and local commit only.
- G5 labels are honest: AUTONOMOUS only blind=Y select-only/generate; otherwise ASSISTED/NONBLIND.
- On completion, post raw DONE-PROOF, run row-required self-checks, and set your row CLAIMED -> VERIFY via Node fs UTF-8. Notify assigned AUD/DB-V with evidence revision. Never mark DONE; SUB integrates independent ACCEPT. Then inspect current directive for next eligible assigned/shared-pool OPEN row with DONE deps and clear WIP/lock.
- Use the bounded 15-minute/30-second change-only loop in `docs/WORKER_PROMPT.md`. On each change, re-read assigned rows/deps/owner/lock and intercom. At window end report final state; do not abandon active work. Doubt => Q; blocker => PING; STANDBY only when no assigned row is eligible.

## Implementation

- Keep to one bounded row. Do not bundle unrelated cleanup or architecture changes.
- Use isolated worktrees for parallel independent code changes when explicitly requested and practical; keep shared board/intercom writes with the designated coordinator.
- Follow the row's required tools and existing repository conventions. Preserve negative controls and oracle behavior.
- Do not read or expose secrets. No `.env` output. No push or deletion.
- Respect stop lists, bot protection, credentials, USER-* flags, HOLDER/live ports, and any current pause.
- Run targeted checks during implementation and the row's required final checks when authorized. Do not claim a check passed unless you ran it and observed the output.

## Handoff

Use `.agents/skills/project-checkpoint/SKILL.md`. Report row/state, changed paths, concise diff, exact command/results, tests-added per file when required, blockers, and next action.
Include a commit hash only when a local commit was explicitly authorized.
End every turn with `RESUME next=<row>` or `STANDBY`.

Do not update the board, intercom, or append-only ledgers unless the assignment explicitly gives you that coordination responsibility.

## Style and write law
AI-agent-first compact style: pipe rows, abbreviations, `<id> => <owner>`, one claim/line, evidence cites, <= 300 chars, IST, ASCII, raw-output provenance for numbers. Board/ledger/intercom writes use Node.js `fs` UTF-8 only.



## Rule 43 claim autonomy
Workers autonomously claim eligible OPEN work (first valid durable claim wins). Claimable requires deps DONE, no conflicting owner/lock, sufficient context, runtime/access satisfied. Never take another worker claim. Workers may mark own work VERIFY only; never DONE. Only MASTER/SUB/AUD (including numbered instances) may record DONE after independent evidence review. DM discussion alone does not change task state; silence is not approval.
