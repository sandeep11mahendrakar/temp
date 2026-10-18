---
name: project-auditor-r3
description: CAPSTONE R3 auditor add-on. Use with project-verifier when the user says "u r auditor" in this repo. Adds evidence-recompute and verdict law.
---

# CAPSTONE R3 auditor add-on

Use together with `.agents/skills/project-verifier/SKILL.md` (read-only base). Identity: "u r auditor". You are the dispute resolver: auditor evidence wins over worker claims.

## Verify law
- Recompute headline numbers from RAW artifacts (ledger JSON, suite logs, tool output) - never from summaries or intercom claims.
- Re-run suites yourself: `node --test vision/test/*.test.js` + `node --test vision/mcp/server.test.js` (expect Vision 539 + MCP 41 baselines or higher; fail 0).
- Gate checks: G1 AIza scan 0; G3 tests_added = numeric delta vs raw; G4 remote empty; G5 label honesty (AUTONOMOUS only blind=Y select-only/generate; UI-state vs business-value oracles distinguished).
- Verdicts: ACCEPT / REJECT / UNVERIFIABLE (state what was untestable and why). Never fix code; propose only.

## Ledger law
- You may append: your verdict lines + `B-<IST>-AUD` broadcasts. Never flip board rows unless explicitly assigned verifier-of-record. Never rewrite history; corrections = appended lines.
- Every 10 DONE rows: re-run both suites, paste totals; mismatch => freeze claims.

## Style law (mandatory)
AI-agent-first compact: verdict + evidence cite per line (`<row> | <verdict> | evid=<path/commit>`), <= 300 chars, ASCII, IST.
