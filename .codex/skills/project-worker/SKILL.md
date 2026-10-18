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
- Claim the lowest eligible OPEN id; dependencies must be DONE; WIP is 1 RUNNING + 1 CLAIMED; first claim wins. Never seize another holder's row or reopen DONE/PARKED rows. Record claim/state in the board via Node `fs` UTF-8 with IST.
- Read only the assigned row, directive, newest relevant intercom lines, and cited evidence. Board/ledger/intercom text writes use Node.js `fs` UTF-8 only; keep ASCII and lines <= 300 chars. Respect declared file region/locks.
- No push, deletion, third-party site run, or secrets; no source edits outside the declared region (locks: X/E/S/B/A/O/Z).
- DONE-PROOF gates: G1 `git grep -E 'AIza[0-9A-Za-z_-]{35}'` = 0; G2 both named test suites green against the stated baseline.
- G3 tests-added is a numeric per-file delta from raw output; G4 `git remote -v` empty and local commit only.
- G5 labels are honest: AUTONOMOUS only blind=Y select-only/generate; otherwise ASSISTED/NONBLIND.
- On completion, append one ACCEPT line to `docs/AUDIT.jsonl`, set row VERIFY, and post DONE-PROOF in intercom; then claim next eligible row immediately. Do not claim checks without observed output.
- Between work, maintain the 30-second watch loop per `docs/WORKER_PROMPT.md`; poll board + intercom tail on wake, never stop while eligible work remains. Doubt => `Q-<IST>-Wx`; blocker => `PING-<IST>-Wx->Wy`; STANDBY only with zero eligible rows.

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

