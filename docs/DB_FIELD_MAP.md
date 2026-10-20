# R3 database envelope field map

Contract module: `tools/r3DbContract.js`; API: `buildEnvelope(input)`, `validateEnvelope(row)`, `canonicalJson(row)`, `payloadHash(row)`. Offline only; no DB, network, sanitization, executor, or source-run mutation.

## Row fields

| Field | Type | Source pointer / transform | Missing / status rule |
|---|---|---|---|
| schema_version | string | fixed `1.0` | other versions rejected |
| run_id | string | `manifest.run_id`; must equal `report.run.id` | required; invalid/mismatch rejected |
| app_id | string/null | `report.app_id` then `manifest.app_id` | absent => null + NOT_RECORDED; never pair by name |
| comparison_id | string/null | `report.comparison_id` then `manifest.comparison_id` | absent => null + NOT_RECORDED; never infer A/B pair |
| platform | string/null | `report.platform` then `manifest.platform` | absent => null + NOT_RECORDED; no relabeling |
| stage | string/null | `report.stage` then `manifest.stage` | absent => null + NOT_RECORDED; no stage inference |
| experiment_kind | enum | report then manifest: RESEARCH, TRIAL | absent => PENDING_VALIDATION; unsupported rejected |
| execution_outcome | enum | precedence: `report.execution_outcome`, `report.result.verdict`, `manifest.execution_outcome`, `manifest.overall_status` | PASS/PARTIAL/FAIL/BLOCKED/ERROR/INCONCLUSIVE/NOT_RECORDED; legacy SUCCESS/PARTIAL_FAILURE/MIXED aliases mapped, raw JSON retained |
| integrity_verdict | enum | explicit report integrity verdict | CLEAN/QUARANTINED/CONTAMINATED/INCONCLUSIVE/NOT_EVALUATED/PENDING_VALIDATION; absent is not CLEAN |
| aggregate_eligibility | enum | report aggregate field or `report.eligibility.aggregate` | ELIGIBLE/EXCLUDED/PENDING_VALIDATION; absent => PENDING_VALIDATION |
| supersedes_report | string/null | report then manifest | absent => null + NOT_RECORDED; same ID rejected |
| manifest_sha256 | lowercase hex SHA-256 | raw `manifest.json` bytes, supplied by caller | required; do not hash parsed JSON |
| report_sha256 | lowercase hex SHA-256 | raw `report.json` bytes, supplied by caller | required; do not hash parsed JSON |
| manifest/report | JSON object | unchanged source objects | retained for provenance; sanitization is DB-4 |
| source_pointers | JSON object | exact selected JSON pointers above | null pointer means no source field was present |
| availability | JSON object | per-row field + `manifest.cost.{calls,tokens,screens,time}` | RECORDED, NOT_RECORDED, NOT_APPLICABLE, STAGE_NOT_RUN, BLOCKED, ERROR, INCONCLUSIVE, REDACTED, PENDING_VALIDATION |
| payload_sha256 | lowercase hex SHA-256 | canonical envelope below | added after validation; excluded from own hash; DB-4 recomputes after sanitization |

`ELIGIBLE` requires explicit `experiment_kind=RESEARCH`, `app_id`, and `comparison_id`; missing IDs stay null/NOT_RECORDED and cannot be guessed from names or stage. Every `TRIAL` is excluded from aggregates; `TRIAL + ELIGIBLE` is rejected even when execution passed. OBSERVED/BLOCKED remain raw report outcomes, never PASS aliases.

## Hash contract

Canonical bytes are UTF-8 `JSON.stringify` over recursively key-sorted envelope JSON. Arrays retain order. Exclude top-level `payload_sha256`, `created_at`, `inserted_at`, `updated_at`, and `server_timestamp`; all other fields participate. Nested source timestamps remain inside manifest/report. DB-1 hashes its validated envelope; DB-4 MUST sanitize first, then recompute `payload_sha256` over the exact exported row. Source manifest/report hashes attest original bytes; exported payload hash attests stored content and is not interchangeable with source hashes.

## Source anchors

| Claim | Source |
|---|---|
| P-1 manifest keys, cost fields, artifact paths/hashes, NOT_RECORDED | `tools/runArchive.js` (`FIELDS`, manifest builder); P-1 DONE row on `docs/TASK_BOARD.md` |
| P-2 run/report roots, required manifest fields, report `run.id` and cases | `tools/researchSchema.js` (`REQUIRED`, `validate`); `docs/SITE_RUN_REPORT_TEMPLATE.md` sections 1-3 |
| Current uploader ID equality and source hashes | `tools/trialUploader.js` `buildPayload` |
| Team DB only accepts platform web/mobile and A/B architecture; companion row preserves IDs separately | `docs/DB_INTEGRATION_PLAN.md` findings + approved architecture |
| Legacy B status is SUCCESS/PARTIAL_FAILURE; contaminated is separate integrity state | `docs/INDEX_PILOT_FINDINGS.md` lines 29-31 |
| Trial rows are never aggregate-eligible; missing telemetry remains explicit | `docs/DB_INTEGRATION_PLAN.md` eligibility/no-inference rules |

P-1/P-2 source records prove local input format only. This field map does not assert deployed DB columns, RLS, grants, constraints, or views.
