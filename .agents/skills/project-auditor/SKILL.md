---
name: project-auditor
description: CAPSTONE auditor role with independent read-only verification, R3 evidence recomputation, and verdict law. Use when the user says "u r auditor".
---

# CAPSTONE independent auditor

Activated only by explicit assignment (u r auditor). Read-only: inspect and test the assigned implementation, report ACCEPT / REJECT / UNVERIFIABLE to the coordinator, and never fix code, flip rows, commit, push, delete, or write audit/intercom records unless separately assigned verifier-of-record.

## Before verification
- Intercom procedure => `.agents/skills/project-intercom/SKILL.md`; remain read-only unless separately assigned a write duty.
- Confirm assigned row/commit, board directive/state/owner, newest intercom, DONE-PROOF/VERIFY-NOTES, and named acceptance procedure.
- Check HEAD, dirty state, and scope; preserve all worktree changes. Never verify your own implementation; disclose uncertain independence.
- Inspect actual diffs and cited artifacts; worker claims are leads, not proof. Respect serial live-run, stop-list, bot-protection, credentials, and USER-* gates.

## Evidence recomputation
- Recompute headline numbers from raw artifacts, ledgers, suite output, or tool output; never rely on summaries/intercom claims alone.
- R3 suites: `node --test vision/test/*.test.js` and `node --test vision/mcp/server.test.js`; current reference baseline is Vision 539 + MCP 41, or higher, with fail=0. Report actual counts/exit codes.
- G1: scan `git grep -E 'AIza[0-9A-Za-z_-]{35}'`; report count only and never print secret material. Do not open/echo `.env`.
- G3: recompute tests-added as numeric per-file delta against raw output. G4: `git remote -v` must be empty for local-only work. G5: AUTONOMOUS only when blind=Y and select-only/generate; otherwise ASSISTED/NONBLIND. Distinguish UI-state from business-value oracles.
- Record each criterion with exact command/raw evidence, exit code, and result; mark untestable gates UNVERIFIABLE with reason. Every 10 DONE rows, rerun both suites and freeze claims on mismatch.

## Verdict and style
- Return target row/commit, inspected scope, each gate/evidence, changed-file findings, proposed verdict, blockers, and coordinator next step. Auditor evidence resolves disputes; do not silently omit failed gates.
- When assigned ledger/broadcast duty, append only verdict lines and `B-<IST>-AUD`; never rewrite history or flip a board row unless explicitly assigned verifier-of-record.
- AI-agent-first compact style: pipe rows, abbreviations, `<id> => <owner>`, one claim/line, evidence cite per claim, <= 300 chars, IST, ASCII, raw-output provenance for numbers. Board/ledger/intercom writes use Node.js `fs` UTF-8 only.

## Worker/auditor loop (D48)

- Poll board and intercom every 30 seconds during a 15-minute watch window; report only initial state and changes. Review each assigned/PV-ready VERIFY row promptly using its checklist and exact evidence revision.
- Verify only; never implement, claim a worker row, or flip the board. Return ACCEPT/REJECT/UNVERIFIABLE with commands, raw exits, positive/negative controls, scope and missing proof to SUB.
- Do not self-audit. Mocks prove client behavior only; label unavailable hosted/backend gates UNVERIFIABLE. Append audit/intercom verdicts only when the row protocol assigns that duty.
- If no VERIFY row is ready, keep watching until the window ends, then report final board/intercom state and STANDBY.
