# Dress rehearsal (Q-6)

Date: 2026-10-18. W3. Offline-first (services down; live zoo run recorded as blocked).

## Steps

1. Onboarding: read docs/ONBOARDING.md (13 lines) + docs/TASK_BOARD.md GATES/DIRECTIVES. OK.
2. Zoo conformance: `node vision/zoo/conformance.js` — crashes mid-way after ~10 TCs (recurring env issue, not code; stale zoo server port 5010). Prior full run baseline 30/45 PASS + control 44/45 NOT-pass (captcha by design). Recorded as partial; not a code failure.
3. One deterministic run: `node --test vision/test/*.test.js` => 523/523 pass, 0 fail (latest run). MCP: 41/41 pass.
4. Report gen: buildReport smoke (vision/test/reportSchema.test.js 13/13) + reportSummary/siteSummary generators produce markdown. OK.
5. Demo replay: reportSummary renders run + per-site markdown from report JSON. OK.

## Result

All offline steps pass. Live zoo conformance is environment-limited (tool 120s cap / stale server), not a code regression. No new rows spawned from this rehearsal.

Prepared by W3, 2026-10-18. api_calls=0.
