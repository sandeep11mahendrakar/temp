---
name: project-taskboard
description: Canonical CAPSTONE procedure for reading and maintaining docs/TASK_BOARD.md. Use when task creation, claims, row state, ownership, or board edits are involved.
---

# Task board procedure

- Canonical procedure: this file at .agents/skills/project-taskboard/SKILL.md.
- Live directives, owners, locks, and row states: docs/TASK_BOARD.md.
- Human orders and root AGENTS.md govern; this manual grants no role or row authority.
- Copies in _TEMP_BIN are legacy archives. docs/skills copies are retired.

## Read and act

- Use a board row for multi-agent, multi-session, gated work, or when explicitly ordered.
- Before project work: inspect git status; read the current governing directive, assigned row, and newest relevant intercom lines.
- Confirm owner, state, dependencies, declared file region, locks, and live HOLDER before acting.
- Never invent a board schema or status flow. Follow the current directive and current board format.
- Only the authorized coordinator creates/reassigns rows or edits shared board sections.
- Keep assignments bounded: objective | owner | files | dependencies | acceptance | hard stop | return evidence.

## Board writes

- Preserve existing work and history. Make only the authorized row or directive change; corrections append.
- Use Node.js fs UTF-8 for board text. Re-read immediately before a shared-file patch.
- AI-agent-first compact style: one claim per ASCII line, <= 300 chars, IST timestamps, evidence cites.
- Never reset, clean, stash, delete, push, expose secrets, or stage broadly.
- Report attempted/completed/verified separately; cite observed command output for verification.

## Handoff

- Record the exact row/state, owner, changed paths, evidence, blocker, and next action.
- Do not mark a row complete from a worker claim alone; use the current verifier gate.
- Preserve board locks, serial live-run rules, stop lists, and USER-* gates from current directives.

## Mandatory verification on task creation (D48)

- Every new implementation row MUST name its independent verifier/review path and include POS, NEG, exact commands/evidence, scope, dependencies and verdict destination. No row is complete to seed without this.
- Create a dedicated counter-row when no existing TV/PV/DB-V rolling review explicitly covers the task; otherwise link the existing verifier row/DB-V checklist. Never duplicate IDs or audits.
- Flow: OPEN -> CLAIMED -> VERIFY after worker DONE-PROOF + row-required self-checks -> DONE only after independent AUD ACCEPT and SUB integration. Worker never sets DONE; AUD never implements or flips.
- On each state change, update only the owned row via Node fs UTF-8 and post evidence/next action in intercom. Claim explicitly assigned rows or rows in a current directive-authorized pool; require DONE deps and free lock, then record actual owner.
- Watch windows are 15 min with 30-second change-only polls; finish or checkpoint active work at expiry and report final state.
