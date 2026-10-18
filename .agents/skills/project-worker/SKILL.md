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

## Implementation

- Keep to one bounded row. Do not bundle unrelated cleanup or architecture changes.
- Use isolated worktrees for parallel independent code changes when explicitly requested and practical; keep shared board/intercom writes with the designated coordinator.
- Follow the row's required tools and existing repository conventions. Preserve negative controls and oracle behavior.
- Do not read or expose secrets. No `.env` output. No push or deletion.
- Respect stop lists, bot protection, credentials, USER-* flags, HOLDER/live ports, and any current pause.
- Run targeted checks during implementation and the row's required final checks when authorized. Do not claim a check passed unless you ran it and observed the output.

## Handoff

Use `.agents/skills/project-checkpoint/SKILL.md`. Report row/task and state; changed paths and concise diff summary; exact commands with observed results and numeric tests added per file when required; commit hash only if a commit was explicitly authorized; blockers, unverified claims, and next action.

Do not update the board, intercom, or append-only ledgers unless the assignment explicitly gives you that coordination responsibility.

