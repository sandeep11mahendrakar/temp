# G-3 library-regression (W4, 2026-10-18)

Library regression sweep on seeded sites (saucedemo, demoqa, todomvc) vs the
A-8 baseline. Deterministic archetype path (no brain). Label: ASSISTED.

| site | http | elements (now/base) | top archetype (now/base) | generated TCs (now/base) | regression? |
|---|---|---|---|---|---|
| saucedemo | 200 | 18/18 | login/login | 9/9 | no |
| demoqa | 200 | 31/31 | navmenu/navmenu | 3/3 | no |
| todomvc | 200 | 10/10 | navmenu/navmenu | 3/3 | no |

All 3 seeded sites match the A-8 baseline exactly (element counts, top
archetype, score, generated TC counts). No regression. No 429/quota.
api_calls=0. Secret scan 0. No push.
Evidence: vision/storage/outputs/g3_results.json.
