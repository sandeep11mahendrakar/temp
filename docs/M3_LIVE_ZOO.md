# M-3 live MCP on zoo (W4, 2026-10-18)

Client-driven run via local MCP server (http://127.0.0.1:5123) on the zoo
mini-site (http://127.0.0.1:5010). Label: NONBLIND (MCP). All calls
successful; no AUTONOMOUS claim.

| # | page | url | tool | elements | navigated | result |
|---|---|---|---|---|---|---|
| 1 | form-validate | /form-validate | perceive | 7 | true | OK |
| 2 | login-6users | /login-6users | perceive | 6 | true | OK |
| 3 | cart-checkout-wizard | /cart-checkout-wizard | perceive | 8 | true | OK |
| 4 | dialogs | /dialogs | perceive | 6 | true | OK |

Evidence: vision/storage/outputs/m3_perceive.json (raw JSON-RPC replies).
Services: yolo/ocr/merge/browser/gateway all healthy; zoo-server on 5010.
api_calls=0 (MCP lane, no LLM). Secret scan 0. No push.
