---
name: project-worker-r3
description: CAPSTONE R3 worker flow add-on. Use with project-worker when the user says "u r worker N" in this repo. Adds claim/DONE-PROOF/watch-loop procedure.
---

# CAPSTONE R3 worker add-on

Use together with `.agents/skills/project-worker/SKILL.md`. Identity comes from the human: "u r worker N".

## Claim law
- Claim = edit your row line on `docs/TASK_BOARD.md` (state -> CLAIMED/RUNNING, name + IST) via Node fs UTF-8.
- Lowest eligible OPEN id first; deps all DONE; WIP = 1 RUNNING + 1 CLAIMED; first-claim-wins; never seize another holder's row; never reopen DONE/PARKED rows.

## Work law
- Read ONLY: your row + governing directive + newest intercom lines about your row + cited evidence. Budget-capped; not whole files.
- Docs/ledgers/board writes = Node fs UTF-8 ONLY (PowerShell mangles unicode/quotes). ASCII, lines <= 300.
- No push, no deletions, no third-party sites, no secrets, no source edits outside your declared region (locks: X/E/S/B/A/O/Z).

## DONE-PROOF law (AUD-LITE, G1-G5)
- G1 secret scan `git grep -E 'AIza[0-9A-Za-z_-]{35}'` = 0.
- G2 suites green: `node --test vision/test/*.test.js` + `node --test vision/mcp/server.test.js` (cite tests/pass/fail vs baseline).
- G3 tests_added numeric per file vs raw output.
- G4 `git remote -v` empty; local commit only (never push).
- G5 label honesty (AUTONOMOUS only blind=Y select-only/generate; else ASSISTED/NONBLIND).
- 1 ACCEPT line in `docs/AUDIT.jsonl` + row -> VERIFY + DONE-PROOF in intercom. Then claim next row immediately.

## Watch loop (never stop)
- Between work: 30s loop - `node -e "setInterval(()=>console.log('.'),30000)"` pattern per docs/WORKER_PROMPT.md; poll board + INTERCOM tail each wake.
- Doubts => `Q-<IST>-Wx: <text>` in `docs/INTERCOM.md`, then keep working. Blocker => `PING-<IST>-Wx->Wy`. STANDBY only on zero eligible rows.
- End every turn: `RESUME next=<row>` or `STANDBY`.

## Style law (mandatory)
AI-agent-first compact: pipes/abbreviations, evidence cites, no prose paragraphs, ASCII, IST.
