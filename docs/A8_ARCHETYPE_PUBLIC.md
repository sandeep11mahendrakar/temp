# A-8 archetype-public (W4, 2026-10-18)

Archetype path (deterministic, no brain) run on the 6 A-7 practice sites.
Label: ASSISTED (deterministic, no LLM). Live slot held by W4. Timeboxed,
no retries. Evidence: vision/storage/outputs/a8_results.json.

| # | site | http | elements | top archetype | score | generated TCs | truth facts | cause-class |
|---|---|---|---|---|---|---|---|---|
| 1 | automationexercise | 200 | 34 | login | 0.9 | 9 | 1 (facts) | observed (no flow truth) |
| 2 | books-toscrape | 200 | 60 | navmenu | 0.6 | 3 | 1 (facts) | observed |
| 3 | demoqa | 200 | 31 | navmenu | 0.6 | 3 | 1 (facts) | observed |
| 4 | saucedemo | 200 | 18 | login | 0.9 | 9 | 1 (facts) | observed |
| 5 | the-internet | 200 | 44 | search | 0.6 | 3 | 1 (facts) | observed |
| 6 | todomvc | 200 | 10 | navmenu | 0.6 | 3 | 1 (facts) | observed |

Notes: A-7 truth files are fact-based (observed_title/http_status/block_class),
not flow-based, so truth_coverage (flow match) is N/A. All 6 sites returned
HTTP 200 with no bot-block; perceive succeeded; archetypes detectAll +
expandAll produced TCs. No retries needed. No 429/quota. api_calls=0 (no LLM).
Secret scan 0. No push.
