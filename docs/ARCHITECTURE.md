# Architecture (Q-3 sync)

## Services (vision/)
- browser-service (port 5004): Playwright-driven browser control.
- yolo-service (port 5001): YOLO ScreenParser (screenparser_best.pt).
- ocr-service (port 5002): OCR text extraction.
- merge-service (port 5003): visual-DOM merge.
- gateway (port 5000): HTTP entry / orchestration.

## Tracks (PROMPT27)
Z (zoo closure), A (archetypes+generation), V (executor/perception), M (MCP front-end),
E (experience memory), R (reporting), S (library tooling), Q (quality+docs), G/F/FIN (final).

## Key modules
- vision/src/oracle.js — verdictFor (PASS/FAIL/OBSERVED/BLOCKED, app_outcome).
- vision/src/reportSchema.js — buildReport/checkReport/indexRow, R-1 fields.
- vision/src/metricsCalc.js — aggregate metrics (R-3).
- vision/src/memoryAblation.js — E-4 ablation.
- vision/src/lessonRetrieval.js — E-2 (EXPERIENCE_MEMORY=on, default off).
- vision/src/siteLibrary.js — S-0 site registry.
- sites/onboard.js — S-2 onboarding.
- vision/mcp/server.js — MCP tools (perceive/act/assert/memory/report/library).

## Docs
ONBOARDING.md, BRAIN.md, ORACLE_CONTRACT.md, SITE_LIBRARY.md, LIMITATIONS.md,
CLAIMS_MATRIX.md, DEPRECATION_PROPOSAL.md, INDEX_INTERFACE_NOTES.md.

Synced 2026-10-18 by W3 (Q-3). api_calls=0.
