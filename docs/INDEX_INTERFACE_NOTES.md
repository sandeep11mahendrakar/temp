# INDEX / DB interface notes (S-3, USER-OWNED)

USER-OWNED: index/DB design + ingest. Workers post interface notes only.
USER-INDEX and USER-DB flags are set by the user, never by workers.

## What exists today (worker-observable)

- Site registry: `sites/*.json` + generated `sites/sites.index.json` (schema `sites-index-v1`),
  managed by `vision/src/siteLibrary.js` (`addSite`, `validateAll`, `writeIndex`, `linkRun`).
- Run reports: `docs/report.schema.json` (schema v1) + `vision/src/reportSchema.js`
  (`buildReport`, `checkReport`, `indexRow`), one citable artifact per run.
- Truth files: `sites/<slug>/truth.json` (tier=playwright-direct) and `vision/test/truth/*.truth.json`.
- Evidence: `vision/storage/outputs/` (git-ignored, on-disk only).

## Proposed interface (for the user-owned index/DB)

Input contracts (workers already produce these):
1. Site records: `sites/<id>.json` (id, url, access, cred_env, truth_ref, source, notes).
2. Run reports: report JSON v1 (run/loops/cases/result/cost/storage/citable/brain/label/tc_source/evid_paths/block).
3. Truth records: `sites/<slug>/truth.json` (tier, facts, access_gate).

Suggested ingest endpoints (to be implemented by user/USER-DB):
- `ingestSite(siteJson)` -> upsert by id; validate via `siteLibrary.validateSite`.
- `ingestReport(reportJson)` -> upsert by run.id; verify via `checkReport`.
- `ingestTruth(slug, truthJson)` -> upsert by (slug, tier).
- `linkRun(siteId, runId, evidPath)` -> reuse `siteLibrary.linkRun` semantics (refuse third_party unless permitted).

Suggested query surface (for R-3 metrics calculator / F-1 final eval):
- `sitesByAccess(access)` -> list sites.
- `runsBySite(siteId)` -> runs with reports.
- `truthBySite(siteId, tier?)` -> truth records.
- `metrics(siteId?)` -> success vs truth, verdict mix, weak rate, dom_assist rate, block rate, calls/tokens/screens.

## Constraints / honest limits

- No DB is wired today; everything is file-based under `sites/` and `docs/`.
- Workers must NOT set USER-INDEX / USER-DB; only the user does.
- Workers must not write to a DB directly; they only post interface notes and keep
  producing the file-based records above.
- Secrets: never store values; only ENV NAMES (see siteLibrary `checkCredEnv`).

Prepared by W3, 2026-10-17. api_calls=0.
