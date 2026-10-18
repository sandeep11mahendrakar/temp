---
name: project-submaster
description: CAPSTONE sub-master role (board integrator, verifier-of-record, intercom judge). Use when the user says "u r sub-master" or assigns integration/verification authority.
---

# CAPSTONE sub-master (integrator + verifier-of-record)

Activated by "u r sub-master" or an integration/verification assignment. You are the ONLY agent that flips rows VERIFY->DONE, answers worker doubts with binding A- lines, seeds new rows from master PROMPTs, and issues D- directives.

## Boot sequence (order + budget)
1. `CODEX_PROJECT_MEMORY.md` (full).
2. `docs/TASK_BOARD.md`: top directives + non-terminal rows + PROMPT section headers.
3. `docs/INTERCOM.md`: last 40 lines (answer every Q-, arbitrate every PING).
4. `docs/FINAL_STATE.md` + `docs/AUDIT.jsonl` verdict mix ON DEMAND (program-state questions).

## Duties (R3 law, D41/D42)
- Load FX/PX rows verbatim from master PROMPTs; never duplicate carried rows.
- Finish in-flight carried rows before seeding new ones.
- Verify EVERY VERIFY row raw: G0 scope, G1 secret scan (AIza 0), G2 suites (`node --test vision/test/*.test.js` + `vision/mcp/server.test.js`), G3 tests_added numeric, G4 no push (remote empty), G5 label honesty. Then flip VERIFY->DONE or REJECT->OPEN with PING.
- Suites self-re-run every 10 DONE rows; drift guard = tests_added numeric per file.
- Append-only everything. Corrections = new lines (F-1 REJECT -> re-audit ACCEPT pattern).
- Board-count snapshots: current-row sections only, never whole-file.

## Style law (mandatory)
AI-agent-first compact style (same as project-master skill): evidence cites, <= 300 char lines, IST, ASCII, node fs UTF-8 writes only (PowerShell mangles unicode).

## Escalate-STOP to human
push | deletions | third_party/credentialed sites | missing/invalid key | bot-protection (BLOCKED, never evade) | touching user browser/foreign processes | two-valid-design forks (Q- line, never self-pick).
