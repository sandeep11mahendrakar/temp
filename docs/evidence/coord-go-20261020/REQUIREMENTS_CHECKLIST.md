# Requirements-to-evidence checklist (GO items 1-40 + Rule 43)

Worker: W4 (OpenCode worker) | Date: 2026-10-20 | State: VERIFY (not DONE)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Owner approval receipt recorded | IMPLEMENTED | SUGGESTIONS.md + INTERCOM.md appended owner receipt |
| 2 | Rule 43 amendment in AGENTS.md | IMPLEMENTED | AGENTS.md "Rule 43" section |
| 3 | Rule 43 in project-worker skill | IMPLEMENTED | .agents/skills/project-worker/SKILL.md |
| 4 | Worker claim autonomy documented | IMPLEMENTED | same |
| 5 | ACK vs VERDICT distinction | ALREADY SATISFIED | intercomInbox.js + SKILL docs |
| 6 | MASTER/SUB/AUD closure only | IMPLEMENTED | AGENTS.md + worker skill |
| 7 | Auditor source repair vs acceptance separate | ALREADY SATISFIED | project-auditor skill |
| 8 | MASTER plans-only scope preserved | ALREADY SATISFIED | project-master skill |
| 9 | DM alone does not change state | IMPLEMENTED | AGENTS.md Rule 43 |
| 10 | Silence not approval | IMPLEMENTED | AGENTS.md Rule 43 |
| 11-20 | Full-transcript inbox (pending/exact revision/next actor/source refs/legacy warnings/duplicate handling/verdict corrections) | ALREADY SATISFIED (extended) | tools/intercomInbox.js (parseTranscript) |
| 21-30 | Envelope validator/encoder (lifecycle fields, kind-specific, ASCII<=300, delimiter/newline injection, conflicting IDs, missing data, dry-replay) | IMPLEMENTED | tools/intercomEnvelope.js + 16 tests PASS |
| 31-35 | Read-only SUB startup (bounded refs, pending/warnings, limitations, no inferred completion) | ALREADY SATISFIED | tools/subOnboard.js |
| 36-40 | Templates explain objective/evidence/allowed files/inputs/contracts/deps/runtime/access/POS/NEG/evidence dest/reviewer/stops/human decisions | PARTIAL | WORKER_ASSIGNMENT_TEMPLATE.md exists; review needed |
| 41 | Compact ASCII agent packets | ALREADY SATISFIED | AGENTS.md style law + caveman skill |
| 42 | Requirements checklist (this file) | IMPLEMENTED | this file |
| 43 | Rule 43 (amended) | IMPLEMENTED | AGENTS.md + worker skill |

## Checks run
- node --check tools/intercomEnvelope.js => exit 0 (True)
- node --check tools/intercomInbox.js => exit 0 (True)
- node --test tools/intercomEnvelope.test.js => 16 pass, 0 fail, exit 0
- node --test tools/intercomInbox.test.js => (run separately; see prior baseline 33/33)

## Limitations
- intercomEnvelope.js is a new tool; no TASK_BOARD row or AUD verdict yet.
- Templates not fully rewritten this session (partial).
- No hosted/browser/DB/upload actions performed.
- Worker never marks DONE; independent AUD review required.
