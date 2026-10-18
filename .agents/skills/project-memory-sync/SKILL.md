---
name: project-memory-sync
description: Daily durable-memory write-up for CAPSTONE. Use when the user says "update the opencode memory" (or "sync memory"). Turns board/intercom/ledger truth into validated durable facts in the repo memory copy. NO live-graph access needed.
---

# Project memory sync (Codex-safe procedure)

TRIGGER: user says "update the opencode memory" / "sync the memory". You ADD observations; you NEVER rewrite, reorder, or delete JSONL lines; you NEVER store secrets/keys/passwords.

## Sources of truth (read in this order, budget-capped)
1. `docs/TASK_BOARD.md` - directives top (newest 3) + every non-terminal row + rows changed since the last sync line.
2. `docs/INTERCOM.md` - last 60 lines.
3. `docs/FINAL_STATE.md` + `docs/CLAIMS_MATRIX.md` - when program metrics/claims changed.
4. `docs/AUDIT.jsonl` + `docs/R3_RESULTS.jsonl` - verdict mix + newest row turns.
5. `git log --oneline -10` - newly landed commits.

## What to write (distill, do not dump)
For each durable fact that is NOT already in memory:
- entity: reuse existing entity names where possible: capstone-project | review3-program | campaign-status | provider-quotas | agent-conventions | tooling | open-work.
- observation format: `<date> <fact> (evid <commit|file:line>)` - one fact per observation, <= 280 chars, ASCII only, no secrets/keys/passwords/emails.
- Write program milestones (rounds closed, final numbers, gates), durable tooling/config changes, standing decisions (laws, stop-lists), role/authority transfers.
- Skip: transient row states (OPEN/CLAIMED of the moment), suite totals that will change again, worker session chat, anything already recorded.

## How to write (exact, mistake-proof)
Target file: `opencode-memory/memory.jsonl` in THIS repo (JSONL: one JSON object per line; entities look like `{"type":"entity","name":"<name>","entityType":"<project|config|state|reference|procedure|decision|queue>","observations":["..."]}`; relations like `{"type":"relation","from":"A","to":"B","relationType":"..."}`).
1. Read the whole file; parse each line with JSON.parse in Node; if ANY line fails parse, STOP and post `Q-<IST>-Wx: memory.jsonl corrupt at line N` - do not attempt repair yourself.
2. Find the target entity line (case-sensitive name). If it does not exist, APPEND a new entity object at the end with a matching relation optional.
3. Edit ONLY that one line in memory: add your observation strings to its `observations` array (dedupe against existing: skip if any existing observation shares the same leading 60 chars).
4. Write with Node fs UTF-8, LF endings, preserve every other byte-for-byte line.
5. VALIDATE before finishing: re-read the file; every line must JSON.parse; output must be pure ASCII (charCodeAt <= 127 for every char); print `lines=<n> ascii=ok jsonl=ok added=<k>`.
6. Commit the single file local (never push): `codex-memory sync <round/topic> (LOCAL no-push)`.
7. Post `B-<IST>-Wx: memory sync: <n> facts added to <entity>` in docs/INTERCOM.md.

## Why Codex writes only the repo copy
The LIVE persistent graph (`C:/Users/sandeep/.config/opencode/memory.jsonl`) belongs to OpenCode/Claude and is merged by Claude AFTER reading this repo copy. Your job ends at a validated repo copy + intercom note. Do not fabricate live-graph state.

## Failure modes to avoid
- Powershell writes mangling unicode => ALWAYS Node fs UTF-8, never PowerShell redirect/Add-Content.
- Rewriting the whole file from a parsed model (order churn) => ONLY the target line may differ.
- Storing secrets or writing `blindY` claims without ledger evidence.
- Writing "current suite totals" as durable facts (they change every run); store milestone totals only, cited to a commit.
