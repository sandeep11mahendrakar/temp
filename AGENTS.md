# Project instructions

- Treat this as a shared, possibly dirty worktree. Before editing, inspect `git status --short`; preserve all existing changes. Never reset, clean, stash, overwrite, or discard unrelated work. Do not push or delete files.
- Source precedence: current `docs/TASK_BOARD.md` directives and row states; then latest relevant `docs/INTERCOM.md`; then append-only evidence in `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl`; then project docs and `CODEX_PROJECT_MEMORY.md`; OpenCode `opencode-memory/memory.jsonl` is primary for OpenCode's persistent graph, not a replacement for live project records. Historical handoffs are lower priority.
- Load `CODEX_PROJECT_MEMORY.md` for project orientation. Retrieve only task-relevant board/intercom ranges and docs. Use `.agents/skills/project-context/SKILL.md` when the task needs project context; use `.agents/skills/project-checkpoint/SKILL.md` when recording a checkpoint. Do not reread all history by default.
- For explicitly assigned coordination, implementation, or read-only verification, use `.agents/skills/project-director/SKILL.md`, `.agents/skills/project-worker/SKILL.md`, or `.agents/skills/project-verifier/SKILL.md` respectively. These skills do not grant role authority or override current human orders. Build bounded assignments from `docs/WORKER_ASSIGNMENT_TEMPLATE.md`.
- Keep user-owned or other-agent changes intact. Check board ownership/locks and current live HOLDER before project work. Live runs are serial; obey stop-list, API/key, and bot-protection gates.
- Never expose secrets or include `.env`/credentials in outputs or commits. Board/ledger text writes use Node.js `fs` UTF-8 per project convention; preserve append-only logs.
- For structural code exploration, use the installed `codebase-memory` skill when available.

## Role dispatch (mandatory)

- "u r the master" -> `.agents/skills/project-master/SKILL.md` (plans-only; issues PROMPTs/rows; never implements).
- "u r sub-master" -> `.agents/skills/project-submaster/SKILL.md` (board integrator, verifier-of-record, intercom judge, FINAL_STATE owner).
- "u r worker N" -> `.agents/skills/project-worker/SKILL.md` + `.agents/skills/project-worker-r3/SKILL.md` (claim/DONE-PROOF/watch loop).
- "u r auditor" -> `.agents/skills/project-verifier/SKILL.md` + `.agents/skills/project-auditor-r3/SKILL.md` (read-only evidence recomputation).
- Role skill load is MANDATORY before any project write. The boot phrase IS the authority grant; re-read the skill each fresh session.

## Writing style law (mandatory for every role)

AI-agent-first compact style everywhere (board, intercom, ledgers, reports, replies): pipe-table rows, abbreviations, `<id> => <owner>` mappings, evidence cites `(commit|file:line)` per claim, one claim per line, lines <= 300 chars, ASCII only, IST timestamps, no prose paragraphs where a line works, numbers always with raw-output provenance. Board/ledger/intercom writes use Node.js `fs` UTF-8 only (PowerShell mangles unicode).

## Onboarding budget (read this much, no more, unless the task requires deeper)

1. `CODEX_PROJECT_MEMORY.md` - full.
2. Role skill file - full.
3. `docs/TASK_BOARD.md` - directives top + non-terminal rows + your row's region.
4. `docs/INTERCOM.md` - last 40 lines.
5. Evidence/artifacts - on demand, only cited ranges.
`docs/FINAL_STATE.md` full read replaces 3-4 when the program state itself is the question.
