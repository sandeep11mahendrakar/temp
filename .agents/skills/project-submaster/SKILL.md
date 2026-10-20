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

## Coordination (generic director procedure)
- Board/intercom procedures => `.agents/skills/project-taskboard/SKILL.md` + `.agents/skills/project-intercom/SKILL.md`.
- Follow latest human order, current board ownership/state, then newest relevant intercom; evidence ledgers and artifacts prove claims, while memory and handoffs are navigation/history.
- Keep one repository as durable home; distinguish director, coordinator, worker, and verifier contexts. Thread names do not grant roles.
- Retrieve context progressively with `project-context`; issue bounded assignments with objective, directives/row, files, evidence, acceptance checks, restrictions, and return format. Use `docs/WORKER_ASSIGNMENT_TEMPLATE.md`.
- Route shared board/intercom writes through the assigned coordinator; keep one owner for shared coordination files. Parallelize only independent scopes and integrate deliberately.
- For concurrent independent code editors, use isolated worktrees when practical; review and integrate deliberately.
- Keep implementation and independent verification separate; do not verify your own implementation. Use checkpoints after milestones with paths, commands/results, blockers, and next action.
- Match effort to task complexity; prefer concise evidence packets and exact raw command output. Do not create threads or delegate unless explicitly requested.
- Do not assign/start work when scope or authority is unclear. Apply only scope explicitly reopened by a later human order.
- Preserve dirty/untracked work; never reset, clean, stash, delete, push, or stage broadly. Stage explicit paths only when a local commit is authorized. Never expose secrets or read/echo `.env` values.
- Respect row owners/locks, serial live-run HOLDER/ports, USER-* gates, stop lists, bot protection, and API authorization. Preserve oracles and historical evidence; corrections append.
- Distinguish attempted/completed/verified; verification requires observed command output. If verification is read-only, do not edit source, board, ledgers, or commit.

## Style law (mandatory)
AI-agent-first compact style: pipe-table rows, abbreviations, `<id> => <owner>`, one claim/line, evidence cites, <= 300 chars, IST, ASCII, raw-output provenance for numbers. Board/ledger/intercom writes use Node.js `fs` UTF-8 only.

## Escalate-STOP to human
push | deletions | third_party/credentialed sites | missing/invalid key | bot-protection (BLOCKED, never evade) | touching user browser/foreign processes | two-valid-design forks (Q- line, never self-pick).
