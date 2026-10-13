# MCP LIVE PROOF — R3-T10 (worker-2)

Status: PRE-RUN. Live loop starts only after worker-1 posts R3-T8 DONE
(serial rule, shared ports 5000-5004). This file holds the plan and will
hold every tool call + reasoning once the run starts. No code edits in
this lane.

## Objective

Drive the headed login loop YOURSELF as the brain through
`vision/mcp/server.js`: perceive saucedemo -> fill username -> fill
password -> click Login, using coordinates from each fresh visual DOM
and re-reading after every step. Verdict question: did it log in
unassisted?

## Environment (pre-run, verified offline)

- Suites green this session: 55/55 test/ + 8/8 mcp/ (63/63 combined run).
- Ports 5000-5004 LISTENING by foreign PIDs at last check: W1 serial
  hold stands, no launch from this lane until the slot clears.
- Free quota pre-reset at last check: no LLM-backed steps from this lane
  (the MCP loop itself needs no LLM key — the brain is me — but the
  pipeline services are shared, so the serial rule still applies).
- Target: https://www.saucedemo.com/ (standard_user / secret_sauce per
  RUN_ANALYSIS; hands-off discipline applies — never touch the browser
  mid-run; log timestamps of anything odd).

## Tool contract (from server.js read, no edits)

| Tool | Input | Returns |
|---|---|---|
| status | {} | service health, no browser |
| perceive | {url} | compact visual DOM (same shape as API path) |
| act navigate | {action:"navigate", value\|url} | fresh DOM + url_change verification |
| act fill | {action:"fill", target:{type,text} or x/y, value} | fresh DOM + input_value verification |
| act click | {action:"click", target:{type,text} or x/y} | fresh DOM + url_change verification; stale targets FAIL unresolved_target, never clicked |
| evidence | {} | screenshot paths + step history |
| reset | {} | closes session, services stay up |

## Step plan (live rows appended at run time)

| # | Tool call | Reasoning | Verification seen | Result |
|---|---|---|---|---|
| 0 | status | confirm services before opening browser | PENDING | PENDING |
| 1 | perceive saucedemo | get fresh DOM + element ids | PENDING | PENDING |
| 2 | act fill username | top input = username (positional rule, R4) | input_value | PENDING |
| 3 | perceive (fresh DOM) | re-read after fill, never reuse coords | PENDING | PENDING |
| 4 | act fill password | bottom input = password | input_value | PENDING |
| 5 | perceive (fresh DOM) | confirm both fills before submit | PENDING | PENDING |
| 6 | act click Login | target type+text preferred (stale-safe) | url_change to inventory | PENDING |
| 7 | perceive (fresh DOM) | confirm inventory + Logout/Cart text | PENDING | PENDING |
| 8 | evidence | collect screenshots + history | PENDING | PENDING |
| 9 | reset | close session, free the slot | PENDING | PENDING |

## Deviations

None yet (pre-run).

## Verdict

PENDING live run. Criteria: inventory URL + Logout/Cart text observed with
zero browser touches and zero assistance; every step logged above with its
verification method.

---

## R3-T15 HTTP SMOKE (looper, NOT part of W2 proof above - do not edit W2 sections)

Server: node mcp/server.js --transport http (port 5123, localhost only).
Zero OpenRouter calls (local YOLO/OCR/pipeline only). No browser-service edits.

| # | Request (POST /mcp unless noted) | Response shape | Time |
|---|---|---|---|
| 0 | GET /health | 200 {ok:true, server:"vision-test@0.1.0", transport:"http"} | <10ms |
| 1 | initialize {protocolVersion 2025-06-18} | result {protocolVersion, capabilities:{tools}, serverInfo} | 6ms |
| 2 | tools/list | result.tools = status,perceive,act,evidence,reset | 10ms |
| 3 | tools/call status {} | content[0].text JSON services all healthy (gateway/yolo/ocr/merge/browser) | 50ms |
| 4 | tools/call perceive {url example.com} | url + element_count 9 + page_text 594 chars (real Example-Domain prose) + screenshot path | 2364ms |

Verdict: HTTP fallback transport live-PROVEN end to end (same routing table as stdio via dispatchMessage). Server stopped after smoke (port 5123 free).
