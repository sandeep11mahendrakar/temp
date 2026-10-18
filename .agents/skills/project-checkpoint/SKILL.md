---
name: project-checkpoint
description: Record concise, evidence-based task checkpoints for this CAPSTONE project without duplicating authoritative boards or ledgers.
---

# Project checkpoint

AI-agent-first style: concise pipe rows, evidence cites, one claim/line, <= 300 chars, IST, ASCII. Board/ledger/intercom text writes use Node.js `fs` UTF-8 only.

When ending substantial work or handing it back:

1. Recheck `git status --short`; identify only files changed by this task and preserve pre-existing dirt.
2. Classify outcomes as **attempted**, **blocked**, **completed**, or **verified**. Completed means the artifact/work exists; verified requires a command/check that actually ran and its observed result.
3. Record exact verification evidence (command, result/count, artifact path, commit if any). Disclose partial runs, timeouts, skipped gates, and mismatches.
4. State unresolved blockers, owner/dependency, and the next actionable step. Do not invent ownership or change status outside the authorized workflow.
5. Update authoritative locations only when assigned: board state in `docs/TASK_BOARD.md`, coordination in `docs/INTERCOM.md`, outcomes in `docs/R3_RESULTS.jsonl`, audit verdicts in `docs/AUDIT.jsonl`. Preserve append-only history; use Node.js `fs` UTF-8 for project board/ledger edits.
6. Keep response checkpoints concise. Update `CODEX_PROJECT_MEMORY.md` only for durable navigation rules or material cross-task context; otherwise point to the authoritative record. Date any state snapshot.

Suggested response format:

```text
Status: attempted | blocked | completed | verified
Changed: <task-owned paths only>
Evidence: <commands/results/artifacts; say not run when applicable>
Blockers: <owner/dependency or none known>
Next: <one actionable step>
```
