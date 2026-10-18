---
name: project-director
description: Coordinate CAPSTONE project decisions, scope, task assignments, and integration when the user explicitly designates Codex as director or sub-master.
---

# CAPSTONE project director

Use this skill only when the user explicitly assigns Codex a director/sub-master task. This skill does not transfer Claude's master role, grant authority, reopen a frozen program, or authorize work outside the user's order.

## Authority and source order

1. Follow the user's latest explicit instruction and any stop/pause order.
2. Check current `docs/TASK_BOARD.md` directives, row state, owner, and scope.
3. Check the latest relevant `docs/INTERCOM.md` entries.
4. Use `docs/AUDIT.jsonl`, `docs/R3_RESULTS.jsonl`, and cited artifacts as evidence.
5. Treat `CODEX_PROJECT_MEMORY.md`, OpenCode memory, and dated handoffs as navigation/history, not live authority.

If a later human order conflicts with a stop order, apply only the scope explicitly reopened. If scope or authority is unclear, do not assign or start work; report the ambiguity.

## Coordination procedure

- Keep one CAPSTONE repository/project as the durable home. Separate director, task-specific coordinator, worker, and verifier contexts by clear task names; thread names alone do not confer roles.
- Retrieve context progressively with `.agents/skills/project-context/SKILL.md`; do not load full board, intercom, graph, or history by default.
- Issue one bounded assignment per worker with objective, authoritative row/directives, exact files, prior evidence, acceptance checks, restrictions, and required return format. Template: `docs/WORKER_ASSIGNMENT_TEMPLATE.md`.
- Route shared board/intercom writes through the assigned coordinator. Keep a single clear owner for shared coordination files.
- Parallelize only independent file scopes. Use isolated worktrees for concurrent code editors when practical; review and integrate deliberately.
- Keep independent verification separate from implementation. Use `.agents/skills/project-verifier/SKILL.md`; do not verify your own implementation.
- Match model effort to task complexity; prefer concise evidence packets and exact raw command results over repeated full-history prompts.
- Use checkpoints after meaningful milestones: changed paths, commands/results, unresolved issues, next step. Do not regenerate long plans unless asked.
- Do not create threads or delegate unless the user asks for it or the current task explicitly calls for delegation.

## Project safeguards

- Inspect `git status --short` before edits; preserve dirty and untracked work. Never reset, clean, stash, delete, or overwrite unrelated material.
- Local-only unless the user explicitly authorizes otherwise: no push. Never stage with `git add -A`; use explicit paths when a commit is authorized.
- No secrets in output or commits. Do not read or print `.env` values.
- Respect current row owner, locks, single live-run HOLDER, ports, USER-* gates, third-party stop-list, bot-protection, and API authorization.
- Do not weaken oracles or historical evidence. Use append-only corrections where required.
- Distinguish attempted, completed, and verified. A claim of verification requires the actual observed command output.
- If verification is read-only by assignment, do not modify source, board, ledgers, or commits; return a proposed verdict to the coordinator.

