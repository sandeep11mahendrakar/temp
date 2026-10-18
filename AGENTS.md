# Project instructions

- Treat this as a shared, possibly dirty worktree. Before editing, inspect `git status --short`; preserve all existing changes. Never reset, clean, stash, overwrite, or discard unrelated work. Do not push or delete files.
- Source precedence: current `docs/TASK_BOARD.md` directives and row states; then latest relevant `docs/INTERCOM.md`; then append-only evidence in `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl`; then project docs and `CODEX_PROJECT_MEMORY.md`; OpenCode `opencode-memory/memory.jsonl` is primary for OpenCode's persistent graph, not a replacement for live project records. Historical handoffs are lower priority.
- Load `CODEX_PROJECT_MEMORY.md` for project orientation. Retrieve only task-relevant board/intercom ranges and docs. Use `.agents/skills/project-context/SKILL.md` when the task needs project context; use `.agents/skills/project-checkpoint/SKILL.md` when recording a checkpoint. Do not reread all history by default.
- Keep user-owned or other-agent changes intact. Check board ownership/locks and current live HOLDER before project work. Live runs are serial; obey stop-list, API/key, and bot-protection gates.
- Never expose secrets or include `.env`/credentials in outputs or commits. Board/ledger text writes use Node.js `fs` UTF-8 per project convention; preserve append-only logs.
- For structural code exploration, use the installed `codebase-memory` skill when available.
