# Archetype FP Matrix (A-5) — registry hygiene

Generated offline from pinned zoo-vdom fixtures via `detectAll(vdom, {})`.
No live runs, no API calls. Top-3 scores per fixture.

| Fixture | #1 (score) | #2 (score) | #3 (score) | Multi-archetype? |
|---|---|---|---|---|
| dialogs.json | modal (0.9) | generic (0.3) | index (0.2) | no (clear modal) |
| form-validate.json | form (0.6) | listpage (0.5) | login (0.3) | yes (form+listpage) |
| hover-menu.json | navmenu (0.9) | generic (0.3) | index (0.2) | no (clear navmenu) |
| login-6users.json | login (0.9) | form (0.6) | listpage (0.5) | yes (login+form) |
| paginate-sort-filter-search.json | listpage (0.9) | search (0.6) | login (0.3) | yes (listpage+search) |
| select-check-radio.json | generic (0.3) | index (0.2) | login (0.1) | no (generic fallback) |

## Ranking / tie-break rules
- `detectAll` sorts descending by score; ties keep registry insertion order (stable sort not guaranteed across engines, but scores are distinct in practice).
- `expandAll` prefers NEW_ARCHS (search/listpage/cart/navmenu/modal/wizard) when top score >= 0.4, else goal-named login/crudlist, else top/generic.
- Multi-archetype pages: top wins; runner-up scores are retained in the ranked list for downstream consumers.

## FP observations
- `select-check-radio.json` has no strong signal -> generic fallback (0.3). No false positive high score. Acceptable.
- `form-validate.json` ambiguous (form 0.6 vs listpage 0.5) -> form wins; listpage runner-up. No regression.
- No fixture triggers an unrelated high-scoring archetype (no false PASS).

## Evidence
- vision/test/fixtures/zoo-vdom/*.json
- vision/src/archetypes.js (detectAll, expandAll, CONTRACT_ARCHETYPES)
- vision/test/archetypes.test.js (19/19 green)
