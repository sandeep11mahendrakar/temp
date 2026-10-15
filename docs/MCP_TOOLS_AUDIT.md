# MCP Tools Audit (B0 blockDetector hook surface)

Source: `vision/mcp/server.js` (read-only audit, zero edits).

## Current tools + params (5)

1. `status` (no params) — health of vision services; launches no browser.
2. `perceive` (`url: string`, `navigate?: boolean`) — YOLO+OCR+merge visual
   DOM + `navigated` bool; navigates only on blank/different-URL/forced.
3. `act` (single grounded action; key Enter|Tab|Space; fill + submitKey) —
   re-detects live, structured failures, 4-minute cap.
4. `evidence` (no params) — screenshot paths + step history.
5. `reset` (no params) — closes persistent session + history.

## blockDetector hook design vs MCP surface

- `perceive`-reply already carries title + URL + OCR/body text: the exact
  `classify()` input shape. Detector runs post-perceive with zero new tools
  and zero schema changes (see `HOOK_INTO` in `vision/src/blockDetector.js`).
- `act` surface is untouched: a classifier never acts, so act params and
  failure taxonomy are unchanged. A non-`ok` verdict only annotates the run
  (honest BLOCKED downstream), never triggers navigation or retries.
- No secrets cross the hook: inputs are page observables; `signals[]`
  echoes matched page text fragments only.

## Proposed additions (M0 owns; listed, not built)

- `detect_block` convenience tool (thin `classify()` wrapper for agents).
- `perceive` optionally carrying `block: {class, confidence}` inline.
