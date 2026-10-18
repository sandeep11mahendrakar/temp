# Codex Project Memory

Project-scoped working context for this Codex workspace. This is a curated copy; OpenCode's primary source remains `C:\Users\sandeep\.config\opencode\memory.jsonl`.

## Project identity

- Workspace: `C:\Users\sandeep\pes\CAPSTONE\sem 6 reivew 3\code`.
- This is a vision-only review-3 project workspace. Current local branch is `main`; the current checked-out baseline/history must be checked with Git before acting. Do not assume historical handoff paths or branch details are current.
- Capstone: AI-assisted web/mobile UI test-case generation. Current workspace focuses on the Vision explorer/perception/executor, zoo fixtures, MCP surface, reporting, and campaign evidence.
- Read `docs/PROJECT_HANDOFF.md` only if present; current handoff found here is the older `agents/memory/PROJECT_HANDOFF.md`, dated 2026-08-26 and stale for current review-3 execution.

## Source of truth and recency

1. `docs/TASK_BOARD.md`: current row states, gates, and directives. Newest directive is D42; PROMPT29 FX rows define the active fix round.
2. `docs/INTERCOM.md`: latest coordination notes, answers, pings, holder/live-slot status. Read the latest relevant entries before any task action.
3. `docs/AUDIT.jsonl` and `docs/R3_RESULTS.jsonl`: append-only evidence ledgers. Never rewrite history; corrections are new entries.
4. `docs/ONBOARDING.md`, `docs/WORKER_PROMPT.md`, `docs/VERIFIER_PROMPT.md`, `docs/PROMPT28S_AUDIT_LITE.md`: operating workflow.
5. `agents/README.md`, `agents/skills/*.md`: project conventions and historic skill guidance.
6. `agents/memory/PROJECT_HANDOFF.md`: useful project background, but dated Aug 26 and superseded by current board/directives on active status.

## Active state at memory creation (2026-10-18)

- PROMPT29 fix round active under D42. FX-1 DONE (79.55%, below 90%; report failures honestly, do not claim 90%); FX-2 DONE (campaign-table arithmetic reports Tier1 13.56% n=8, Tier2 81.11% n=10, combined 51.09% n=18; cited 20%/48.7% were not reproduced from INDEX); FX-3 VERIFY; FX-4 CLAIMED by W1; FX-5 DONE; FX-6 OPEN; FIN-1 reopened to VERIFY pending FX-6.
- FX-3 append-only correction work may have outstanding Z-4 REJECT backfills and a Z-3 scope note; consult latest board/intercom because W4 raised a scope/ownership question.
- FX-5 stop-list is binding: do not run against stackoverflow, imdb, goodreads, npmjs, reddit, magento, or opencart. These are recorded as third_party + BLOCKED.
- Latest recorded suite baseline after FX-5 fix: Vision 525/525 and MCP 41/41; verify current results before making new claims.
- Current Git working tree is dirty with numerous pre-existing changes and untracked user/project files. Inspect `git status -sb` before edits; never revert or sweep unrelated changes.

## Operating rules

- No push. Local changes/commits only when task instructions call for them. Never delete files. Do not commit `.env`, credentials, or storage artifacts.
- Do not reveal or print secrets. Keys, if relevant, live in `vision/.env`; do not read/emit values. API calls default to zero unless a specific row permits them and its USER gate is present.
- Live browser/service runs are serial. Check current HOLDER and ports before any live run. Stop-list and bot-protection policies are binding; never evade.
- Board/ledger markdown/JSONL writes must use Node.js `fs` UTF-8 (PowerShell text writes can corrupt Unicode). Preserve append-only logs and other agents' entries.
- Work only on explicitly assigned/claimable rows. First-claim-wins, respect ownership and file locks. Board state is updated immediately by its authorized owner.
- Row lifecycle: OPEN -> VERIFY (DONE-PROOF plus AUD-LITE ACCEPT) -> DONE (independent verifier flips); BLOCKED/PARKED are honest terminal states.
- Do not weaken oracles. Include negative controls for TC/oracle changes. Frozen labels: AUTONOMOUS only when blind=Y and select-only/generate; MCP/CLI are NONBLIND; file/mock/seeded/replay are ASSISTED.
- Before task work, reread current board directives and intercom because this memory is only a snapshot.

## Key files

- `docs/TASK_BOARD.md` — live board and directives.
- `docs/INTERCOM.md` — current questions, answers, broadcasts, heartbeat, live holder.
- `docs/AUDIT.jsonl` — append-only audit outcomes.
- `docs/R3_RESULTS.jsonl` — append-only task evidence.
- `docs/ONBOARDING.md`, `docs/WORKER_PROMPT.md`, `docs/VERIFIER_PROMPT.md`, `docs/PROMPT28S_AUDIT_LITE.md` — workflow.
- `agents/README.md`, `agents/skills/INTERCOM_SKILL.md`, `agents/skills/TASKBOARD_SKILL.md` — agent coordination/board practices.
- `agents/memory/PROJECT_HANDOFF.md` — historical project context; stale status.
- `docs/CLAIMS_MATRIX.md`, `docs/FINAL_EVAL.md`, `docs/FINAL_STATE.md` — claims and campaign reporting (currently under FX-4/FX-6 correction).
- `vision/test/` — Vision tests; MCP suite entry is `vision/mcp/server.test.js`.

## Initial files read in this Codex session

- Copied OpenCode memory: `opencode-memory/memory.jsonl` (primary) and `opencode-memory/memory.json` (legacy). The Aug 26 backup and Oct 11 corrupt copy have not been copied/read.
- `docs/ONBOARDING.md`
- `agents/README.md`
- `agents/skills/INTERCOM_SKILL.md`
- `agents/skills/TASKBOARD_SKILL.md`
- `agents/memory/PROJECT_HANDOFF.md` (full; dated Aug 26, historical)
- `docs/PROMPT28S_AUDIT_LITE.md`
- `docs/WORKER_PROMPT.md`
- `docs/VERIFIER_PROMPT.md`
- `docs/TASK_BOARD.md` (governing directives, active FX rows, relevant status rows; the full file is 618 KB)
- `docs/INTERCOM.md` (recent/latest coordination entries; the full file is 52 KB)
- `docs/SUGGESTIONS.md` (opening instructions and relevant recent entries)
- Git status/log snapshot (to identify existing dirty work; no changes made to user code in this onboarding step).
