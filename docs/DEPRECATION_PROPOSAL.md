# Deprecation proposal — v1 mechanisms (Q-5)

PROPOSAL ONLY. No files are deleted by this document. User approval required before any removal.

## Deprecated v1 files (header-marked `@deprecated`)

| v1 file | Superseded by | Deprecated since | Status |
|---|---|---|---|
| `vision/src/batchPlan.js` | `vision/src/planner.js` (B5-full) | v1-deprecate (85e491d) | deprecated header only |
| `vision/src/runMemory.js` | `vision/src/memory.js` (B4-full) | v1-deprecate (85e491d) | deprecated header only |
| `vision/src/zeroLoop.js` | `vision/src/loopController.js` (B6-full) | v1-deprecate (85e491d) | deprecated header only |

## Current importers (removal blockers)

- `batchPlan.js` is referenced by `vision/src/planner.js` and `docs/TASK_BOARD.md`.
- `runMemory.js` is referenced by `vision/src/memory.js` and `vision/test/memory.test.js`.
- `zeroLoop.js` is referenced by `vision/src/loopController.js`.

## Risk assessment

- Removing any of the three v1 files now would break the v2 modules that still import them (planner.js, memory.js, loopController.js) and the memory test suite. The v2 modules have not yet been fully decoupled from the v1 mechanisms (they import/re-export or call into v1 internals).
- The deprecated headers are the only change so far; behavior is unchanged and both v1 and v2 remain green (suites 446/446 + 41/41 at 2026-10-17).
- `reportSchema.js` is NOT deprecated (it stays as the base layer under `report.js`).

## Recommended cleanup sequence (requires user approval)

1. Decouple `planner.js`, `memory.js`, `loopController.js` from their v1 counterparts (remove imports, inline or replace calls).
2. Update `vision/test/memory.test.js` to target `memory.js` only.
3. Delete `batchPlan.js`, `runMemory.js`, `zeroLoop.js` plus their v1 tests in one commit, with a full suite run before/after.
4. Remove the `@deprecated` headers and any remaining references in docs.

## Not in scope

- No deletion, no code edits, no test changes. This document is the proposal only.
- The `reportSchema.js` base layer is intentionally retained (not deprecated).

Prepared by W3, 2026-10-17. api_calls=0.
