# Project instructions

- Treat this as a shared, possibly dirty worktree. Before editing, inspect `git status --short`; preserve all existing changes. Never reset, clean, stash, overwrite, or discard unrelated work. Do not push or delete files.
- Source precedence: current `docs/TASK_BOARD.md` directives and row states; then latest relevant `docs/INTERCOM.md`; then append-only evidence in `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl`; then project docs and `CODEX_PROJECT_MEMORY.md`; OpenCode `opencode-memory/memory.jsonl` is primary for OpenCode's persistent graph, not a replacement for live project records. Historical handoffs are lower priority.
- Load `CODEX_PROJECT_MEMORY.md` for project orientation. Retrieve only task-relevant board/intercom ranges and docs. Use `.agents/skills/project-context/SKILL.md` when the task needs project context; use `.agents/skills/project-checkpoint/SKILL.md` when recording a checkpoint. Do not reread all history by default.
- For explicitly assigned coordination, implementation, or evidence recomputation, use `.agents/skills/project-submaster/SKILL.md`, `.agents/skills/project-worker/SKILL.md`, or `.agents/skills/project-auditor/SKILL.md` respectively. These skills do not grant role authority or override current human orders. Build bounded assignments from `docs/WORKER_ASSIGNMENT_TEMPLATE.md`.
- Keep user-owned or other-agent changes intact. Check board ownership/locks and current live HOLDER before project work. Live runs are serial; obey stop-list, API/key, and bot-protection gates.
- Never expose secrets or include `.env`/credentials in outputs or commits. Board/ledger text writes use Node.js `fs` UTF-8 per project convention; preserve append-only logs.
- For structural code exploration, use the installed `codebase-memory` skill when available.

## Utility skills

- `.agents/skills/project-memory-sync/SKILL.md` = daily durable-memory sync (trigger: "update the opencode memory").
- `.agents/skills/project-taskboard/SKILL.md` = canonical board procedure.
- `.agents/skills/project-intercom/SKILL.md` = canonical intercom procedure.

## Canonical board/intercom manuals

- Board procedure => `.agents/skills/project-taskboard/SKILL.md`; live board state => `docs/TASK_BOARD.md`.
- Intercom procedure => `.agents/skills/project-intercom/SKILL.md`; live coordination => `docs/INTERCOM.md`.
- `.agents/skills/` is the sole active skill tree. `.codex/` was archived to `_TEMP_BIN/.codex-legacy-2026-10-18/`; archived copies are not active instructions.

## Role dispatch (mandatory)

- "u r the master" -> `.agents/skills/project-master/SKILL.md` (plans-only; issues PROMPTs/rows; never implements).
- "u r sub-master" -> `.agents/skills/project-submaster/SKILL.md` (board integrator, verifier-of-record, intercom judge, FINAL_STATE owner).
- "u r worker N" -> `.agents/skills/project-worker/SKILL.md` (unified worker + claim/DONE-PROOF/watch loop).
- "u r auditor" -> `.agents/skills/project-auditor/SKILL.md` (read-only evidence recomputation).
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

## Compact agent prompts and SUB startup (owner order 2026-10-19)

- All WORKER/AUD/SUB/MASTER agent packets, prompts and coordination output use compact ASCII key=value or pipe rows, <=300 chars/line, with exact identifiers, negations, commands, paths and evidence retained.
- Mandatory communication style: load .agents/skills/caveman/SKILL.md for worker/agent responses. Project ASCII schemas and required confirmations take precedence over optional Caveman prose formatting.
- Caveman compresses wording only; no unmeasured token-saving claims, altered code/SQL, omitted gate/evidence, broken grammar or loss of meaning. User questions and safety-critical decisions remain clear full sentences.
- Internal DM only for actionable blockers/conflicts, essential clarification or final verdict requiring action; no routine progress, ACK-only messages, heartbeat chatter or duplicate notice replies.
- New SUB sessions read docs/SUB_COORDINATION_ONBOARDING.md and run node tools/subOnboard.js for read-only navigation; live board/intercom still govern. The script grants no role, claim or execution permission.


## Rule 43 (owner amendment 2026-10-20)
Workers may claim any genuinely claimable task without asking permission; first valid durable claim wins. Claimable = OPEN/unclaimed, deps met, no conflicting owner/lock, sufficient context, runtime/access satisfied. Workers may implement bounded scope, run authorized checks, submit proof, mark own work VERIFY. Workers may NEVER mark DONE or independently accept; only activated MASTER/SUB/AUD may record DONE, and numbered instances (SUB2, AUD2, ...) are equally eligible. DM discussion alone does not change task state; silence is not approval.
