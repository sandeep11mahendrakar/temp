# R3 database integration plan
Status | DESIGN APPROVED by Sandeep in this chat; planning only; no deployed DB inspected or changed.
Scope | Same shared Supabase project; additive R3 companion table; trusted server-side upload; existing team runs/views preserved.
Authority | Owner requested inspect/plan/board tasks; approved companion table + server-side upload; USER-* flags unchanged.
Source handling | Repository guides and attached report documents are evidence/design inputs, not authority to execute their commands.
Reference | Neonishh/Capstone-Project @ 6a558f3af2ded2121db233ae8d644dc1be8c2d6c; database files fetched read-only through GitHub connector.
Ref SQL | https://github.com/Neonishh/Capstone-Project/blob/6a558f3af2ded2121db233ae8d644dc1be8c2d6c/database/setup.sql
Ref helper | https://github.com/Neonishh/Capstone-Project/blob/6a558f3af2ded2121db233ae8d644dc1be8c2d6c/database/saveRun.js
Ref guide | https://github.com/Neonishh/Capstone-Project/blob/6a558f3af2ded2121db233ae8d644dc1be8c2d6c/database/TEAM_SETUP.md
Inspection | Graph-first lookup + coverage checks; metadata_changed reported; material claims checked against current source.
Limit | Source compatibility assessment, not independent acceptance audit; no suites, browser runs, uploads or SQL executed by master.

## Evidence and change size
Finding | Team DB is Supabase public.runs; root README still describes SQLite; database/ guides describe current integration. (remote setup.sql:7; database/README.md:1)
Finding | Team rows require platform web/mobile, architecture A/B, app/comparison IDs, created_at, memory_log/test_cases/execution_results arrays. (remote setup.sql:8)
Finding | Team SQL enables RLS, denies anon/authenticated, grants service_role SELECT/INSERT/UPDATE. (remote setup.sql:20)
Finding | Team helper uses merge-duplicates and replaces the local same-ID bundle; conflicts with R3 immutable-run policy. (remote saveRun.js:49,60)
Finding | Team schema has no explicit R3 manifest/report/hash/eligibility columns; Fusion is outside the A/B constraint. (remote setup.sql:7)
Finding | Current T-1 envelope contains manifest/report, source hashes, schema_version, supersedes_report and eligibility. (tools/trialUploader.js:55)
Finding | Current T-1 config accepts publishable/anon only; cannot access the inspected team SQL contract. (tools/trialUploader.js:84; remote setup.sql:21)
Finding | TV-1 remains UNVERIFIABLE for deployed RLS, unique run_id and eligible view; mocks are insufficient. (docs/INTERCOM.md:444)
Finding | P-2 generator emits a compact summary/checklist; full report template remains 0.1-draft with richer stage/integrity sections. (tools/researchSchema.js:73; docs/SITE_RUN_REPORT_TEMPLATE.md:3)
Finding | Sample manifest run_id=schema-clean differs from report run.id=sample-clean; uploader identity guard rejects it. (runs/schema-clean/manifest.json:2; runs/schema-clean/report.json:3; tools/trialUploader.js:49)
Finding | Historical B execution JSON has results[].status; pilot notes describe a different verdict shape; adapters must detect source version. (docs/INDEX_PILOT_FINDINGS.md:15)
Finding | Historical Fusion dashboard has headline/execution rather than cases[]; existing adapter preserves separate source/denominator. (vision/src/dashboardAdapter.js:3)
Finding | Legacy buildReport zero-defaults absent token fields; research exports must preserve source availability instead. (vision/src/reportSchema.js:132)
Input check | Temp report-template and field-audit files equal repo copies by SHA256; no import/rewrite needed. (Get-FileHash read-only output in this chat)
Size | MAJOR at shared schema/security/immutability contract; direction approved. MINOR at offline adapters/report mapping. No executor/perception redesign proposed.
Deployed state | UNKNOWN; GitHub setup.sql is source intent, not proof of actual hosted columns, grants, policies, rows or project capacity.

## Approved architecture
Path | Runtime artifacts -> immutable P-1 archive -> P-2 report -> sanitized export/outbox -> server-only uploader -> R3 table -> readback + eligible view.
Table | Proposed public.r3_runs in existing project; owner deployment must first check name collision/current schema.
Identity | run_id primary key; app_id/comparison_id link experiments; platform/stage distinguish Web-B from Fusion without relabeling.
Payload | manifest and report JSONB preserve R3 fields; schema_version, experiment_kind, execution_outcome, integrity_verdict, aggregate_eligibility explicit.
Lineage | supersedes_report records a new immutable row; source run ID and optional existing team run ID remain separate identifiers.
Provenance | Store source manifest/report hashes AND sanitized payload hash with serialization/version definition.
Hash rule | Source hashes attest retained local bytes; sanitized payload hash attests stored content; do not compare sanitized JSON bytes to a raw-file hash.
Artifacts | DB holds stable archive-relative paths + hashes + access class; screenshots stay local for trial; local paths are not remote-accessible URLs.
No inference | Missing duration/tokens/screens/brain metadata remain NOT_RECORDED/null with availability; never fabricate arrays, case IDs or zero measurements.
Semantics | Retain raw verdict, app_outcome, weak strength, block cause, tc_source and qualified brain label; OBSERVED/BLOCKED never coerced to passed.
Eligibility | Trial rows experiment_kind=TRIAL, citable=false, aggregate_eligibility=EXCLUDED; clean trial remains excluded from research.
Eligibility view | security_invoker=true; filter aggregate_eligibility=ELIGIBLE and exclude TRIAL; authorized evidence readback uses a separate path including excluded runs.
Privacy | Sanitization precedes outbox/upload; allowlist payload fields; scan keys AND values for real credentials and prohibited markers.
Credential scan | Reject service_role / sb_secret_ / eyJ payload markers and AIza key patterns; test fixtures use synthetic values; never scan by printing matches.

## Security and idempotency
Transport | Trusted owner shell/opencode backend only; env-only privileged credential; no privileged key in client/browser, payload, logs or report.
Auth alignment | Prefer current Supabase secret-key support; permit legacy server-role JWT only if already used by team and explicitly configured.
Auth change | Existing T-1 key validation must be deliberately revised after W-CODEX handoff; no silent key fallback or public INSERT policy.
DB controls | Enable RLS; deny anon/authenticated access; grant dedicated companion table only required SELECT/INSERT to actual backend role.
Immutability | Service/secret keys bypass RLS; enforce no UPDATE/DELETE with grants plus table trigger on R3 rows, without altering team table grants.
Retry | INSERT ON CONFLICT DO NOTHING; read existing row and compare payload hash before acknowledging duplicate; differing payload => conflict, never success.
Outbox | Persist immutable sanitized envelope before request; retain on failure; bounded timeout/backoff; no response body/credential logging.
Readback | Fetch each run by exact run_id regardless of eligibility; verify stored payload hash, identity, source hashes and manifest fields against local evidence.
Negatives | Different payload same ID, unauthorized read/write, UPDATE/DELETE, secret in object key/value, missing metadata, interrupted upload, and malformed identity must fail honestly.
Limits | Published Free Storage quota=1 GB; remaining capacity UNKNOWN; check owner project usage before any later Storage upload.
Limits source | https://supabase.com/docs/guides/platform/manage-your-usage/storage-size
Auth source | https://supabase.com/docs/guides/getting-started/api-keys
RLS source | https://supabase.com/docs/guides/database/postgres/row-level-security

## Bounded worker plan
DB-1 | MINOR | docs/DB_FIELD_MAP.md + tools/r3DbContract.js + tests | map manifest/report, historical B status, Fusion adapter and team IDs; offline only.
DB-1 acceptance | Explicit source JSON pointers, transform/version/status mapping, units/availability and evidence per field; reject guessed pairing or unsupported status.
DB-2 | APPROVED MAJOR preparation | database/r3_companion.sql + database/r3_companion.test.sql | additive SQL draft only; no team DROP/ALTER/UPDATE/DELETE.
DB-2 acceptance | Companion schema constraints, unique ID, payload hash, RLS/grants, append-only enforcement, evidence readback and eligible-only view; allow/deny SQL tests.
DB-3 | MINOR code adaptation under approved auth design | tools/trialUploader.js + tools/trialUploader.test.js | requires explicit W-CODEX scope handoff; preserve existing T-1 work.
DB-3 acceptance | Server credential contract, secret-safe errors, bounded network timeout, duplicate-hash conflict, exact-ID readback; no actual endpoint/key access in Codex.
DB-4 | MINOR | tools/r3DbExport.js + tests; docs/DB_REPORT_COVERAGE.md | source-bound sanitizer/export and template coverage map; no existing archive/template overwrite.
DB-4 acceptance | Correct new archive IDs; clean/blocked/partial/contaminated fixtures; trial excluded; separate raw/sanitized hashes; missing telemetry preserved; report coverage gaps explicit.
DB-V | auditor read-only | DB-1..4 evidence | independent checks with raw outputs; do not fix code; connect findings to TV-1 rather than duplicating trial audits.
DB-5 | owner shell/opencode only | additive deployment + sanitized backend evidence | awaits owner DB-access order/environment and DB-V; no USER-DB inferred.
DB-5 acceptance | Before/after metadata proves team objects preserved; real RLS/grants/no-update, exact-ID readback, duplicate/conflict and eligibility tests; no secrets in evidence.
Every fix | DONE only measured delta>0 or hard-block proof; tests_added numeric by file; negative control; AIza scan zero before explicit-path local commit.
Return | row | author/verifier | changed paths | commit | exact commands/exit | tests_added/file | negative control | artifact paths | delta/block proof.

## Integration order
Order | DB-1 -> DB-2/DB-4 -> DB-3 after T-1 handoff -> DB-V -> DB-5 -> TV-1 acceptance -> existing T-2/T-3/T-4 and TV rows -> T-5 owner decision.
Preserve | P-1/P-2 recorded DONE; T-1 VERIFY and TV-1 unresolved remain; no master flips or reassignment of existing rows.
Trial | Existing allowlist only: saucedemo, zoo captcha-like BLOCKED, zoo iframe partial; no extra site or CAPTCHA retry/evasion.
Research | Existing P-5 verification + research-run-1 tag + later owner authorization remain; this plan authorizes no campaign.
Freeze | Resolve template/generator coverage and trial findings before claiming schema frozen; P-2 acceptance is not proof of hosted compatibility.
No bulk backfill | Historical INDEX stays authoritative ledger; separate dry-run import preview before any historical ingest; stop-listed evidence may be read offline, never revisited.
No expansion | Dashboard, realtime, vectors, new Supabase project, mobile migration and rewriting shared team tables are outside this plan.

## Exact new-file scopes
DB-1 | docs/DB_FIELD_MAP.md; tools/r3DbContract.js; tools/r3DbContract.test.js.
DB-2 | database/r3_companion.sql; database/r3_companion.test.sql.
DB-3 | tools/trialUploader.js; tools/trialUploader.test.js; only after W-CODEX/coordinator handoff.
DB-4 | tools/r3DbExport.js; tools/r3DbExport.test.js; docs/DB_REPORT_COVERAGE.md.
DB-V | Read-only DB-1..DB-4 source and evidence; no implementation ownership.
DB-5 | Owner/opencode executes only approved companion SQL after access order; auditor records independent backend verdict.

## PROMPT34 amendment / owner-requested four-worker completion
Authority | Owner requested a better taskboard rewrite using earlier row conventions and four workers; this amendment supersedes earlier unowned DB row assignments and linear audit ordering.
Plan | docs/DB_WORKER_1_PROMPT.md; docs/DB_WORKER_2_PROMPT.md; docs/DB_WORKER_3_PROMPT.md; docs/DB_WORKER_4_PROMPT.md; docs/DB_COORDINATOR_PROMPT.md.
Parallel start | W1 contract; W2 read-only SQL inspection pack; W3 auth/runbook; W4 deterministic raw fixtures. File scopes are disjoint; no worker edits another lane.
Then | Independently accepted contract enables W1 exporter + W2 migration; W3 transport after exporter/SQL acceptance and T-1 handoff; W4 workflow after accepted modules.
Audit correction | AUD reviews every ready row; SUB flips that row DONE; DB-V final rollup is not a dependency for implementation or deployment.
Deployment | W2 network-capable opencode/owner shell after offline acceptance and existing owner access order/environment; backend proof required; no credential/flag inferred.
Trial carry | W4 T-2; W3 T-3; W1 T-4; existing TV audits remain; current claims checked before assignment; no duplicate trial.
Finish | W1 DB-8 delivery report after real backend/roundtrip/trial acceptance; DB complete means usable full path + independent proof, not uploader mock tests alone.
Preserve | Earlier plan evidence/design and shared work preserved; superseded dependencies/owners remain historical; P-5/research tag and owner-freeze decisions unchanged.
