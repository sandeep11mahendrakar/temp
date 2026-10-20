# R3 server upload contract
Status | DB-3a design artifact; W3; 2026-10-18 IST; no deployed backend acceptance.
Authority | docs/DB_WORKER_3_PROMPT.md; docs/DB_INTEGRATION_PLAN.md; SUB integrates board state.
Scope | Trusted owner-controlled server process only; local contract, no credentials read or requests to a project.
Gate | DB-3 implementation requires DB-1/DB-2/DB-3a/DB-4 DONE and SUB-recorded W-CODEX handoff.
Handoff | Capture inherited T-1 dirty diff/hash plus author acknowledgment before uploader edits; preserve existing code/tests.
Backend | DB-5 requires accepted DB-2/DB-3/DB-4/DB-7 plus owner access order/environment; TV-1 hosted proof remains unresolved.

## Auth and request boundary
Config | Explicit auth mode plus server environment credential; missing, ambiguous or malformed config fails before a request.
Preferred | Secret API key in apikey header; omit Authorization for this raw REST mode; never treat the opaque key as a JWT. [S1]
Legacy | Explicitly configured, existing team service_role JWT only; apikey carries the JWT and Authorization uses Bearer with that JWT. [S2]
Legacy validation | Reject malformed JWT and any role other than service_role; local claim parsing does not prove signature or hosted validity.
Isolation | Dedicated uploader request context; never inherit browser cookies, signed-in user tokens or another client's session.
Public keys | anon/publishable credentials cannot satisfy this privileged contract; fail closed, without public-grant fallback.
Endpoint | Owner-configured HTTPS project origin only; validated table/view identifiers; reject redirects to prevent credential forwarding.
Credentials | Environment/secret-store input only; never command-line literals, frontend bundles, payload fields, outbox files or evidence.
Logging | Redact headers before diagnostics; no raw request/response objects, bodies, URLs with tokens, stack causes or key fragments.
Errors | Emit allowlisted error code, HTTP status and attempt count only; never echo config values or remote error text.
Auth failure | Stop on invalid config or 401/403; no alternate key, role, endpoint or policy fallback.
Sources | Official docs checked 2026-10-18 IST; transport details are requirements, not claims about the current T-1 implementation.

## Database boundary
Table | Proposed public.r3_runs only; accepted DB-1/DB-2 contract determines actual names/columns before implementation.
Public denial | RLS enabled; no anon/authenticated table or view grants; do not add public INSERT/SELECT to make the uploader work.
Privilege | Secret/service_role bypasses RLS; RLS alone cannot establish append-only behavior. [S1]
Exposure | Do not assume new public tables are Data-API accessible; owner DB-5 must prove explicit backend grants without adding public grants. [S3]
Append-only | DB-2 must restrict backend companion-table grants to SELECT/INSERT and enforce UPDATE/DELETE denial with a trigger.
Team objects | No changes to existing team tables/views/grants; collision/current-schema checks belong to owner deployment.
View | Accepted eligible view uses security_invoker=true; excludes TRIAL and ineligible rows; privilege checks remain required.
Readback | Separate authorized exact-run_id table/readback path includes excluded rows; research view is not an upload acknowledgment path.

## Local-first transfer and verification
Export | Consume accepted DB-4 exporter and DB-1 field contract; do not construct guessed IDs/statuses or silently change the exporter schema.
Sanitize | Allowlist fields; reject forbidden credential markers in keys and values; record only scan counts, never matching text.
Outbox | Validate and atomically persist immutable sanitized envelope before sending; preserve archive bytes and existing outbox entries.
Hash | Retain raw manifest/report file hashes separately from the versioned canonical sanitized payload hash.
Hash verification | Recompute payload hash excluding its own hash field using accepted serialization rules; mismatch stops before POST.
Insert | POST with conflict-ignore semantics on unique run_id; no merge/upsert, UPDATE or DELETE request.
Timeout | Require finite request timeout and bounded total attempts/backoff; exact budgets must be configured and covered by DB-3 tests.
Retry | Retry only transient transport/timeout/rate-limit/server errors within bounds; honor bounded Retry-After; retain outbox on every failure.
Ambiguous result | After a lost POST response, exact-ID readback/retry uses the same immutable ID and payload, never a replacement row.
Readback query | URL-encode an equality filter on exact run_id; require exactly one matching stored row; zero/multiple rows fail acknowledgment.
Readback proof | Recompute stored canonical payload hash; compare local hash, identity, source hashes and manifest fields; claimed stored hash alone is insufficient.
Duplicate | Same ID plus matching recomputed payload/identity => acknowledged; differing payload => conflict, never success or overwrite.
Completion | HTTP success alone is insufficient; record sanitized acknowledgment only after verified readback; retain immutable outbox evidence.
Trial | experiment_kind=TRIAL, citable=false, aggregate_eligibility=EXCLUDED, including a clean trial; never promote on upload success.

## Acceptance checklist / negative controls
Check | Rejected input or action | Required observable result
--- | --- | ---
C1 | Browser/frontend privileged key | Reject design/config; no credential-bearing request.
C2 | Key logged, persisted in payload/outbox, or leaked by remote error | Reject; sanitized diagnostics and zero credential-value matches.
C3 | anon-only access against denied companion table | No public grant fallback; owner DB-5 proves unauthorized read/write denied.
C4 | Secret API key sent as Authorization JWT | Header-control failure; opaque secret uses apikey only.
C5 | Mocked RLS/grants asserted as deployed proof | UNVERIFIABLE hosted gate; mocks establish client behavior only.
C6 | Same run_id with different canonical payload/hash | Conflict; stored row unchanged; local evidence retained.
C7 | Timeout/interrupted POST or readback | Bounded failure/retry; immutable outbox retained; no false acknowledgment.
C8 | Secret marker in object key/value, malformed ID or tampered payload hash | Reject before request; no matched text in diagnostics.
C9 | Excluded TRIAL row absent from research view | Exact-ID authorized readback still verifies; view exclusion remains intact.
C10 | Signed-in JWT overrides server auth or cross-origin redirect | Reject; no credential forwarding or silent role substitution.
C11 | UPDATE/DELETE attempted by privileged backend | DB-5 live denial required; client method restrictions alone are insufficient.
Proof levels | DB-3 synthetic controls = client behavior; DB-V = independent local review; DB-5 = owner-run hosted proof.
Tests added | docs/DB_SERVER_UPLOAD.md=0 executable tests; checklist is review criteria, not an executed auth/RLS test suite.

## Sources
S1 | https://supabase.com/docs/guides/getting-started/api-keys | key types, server restriction, apikey transport, RLS bypass.
S2 | https://supabase.com/docs/guides/auth/signing-keys | legacy JWT API keys and API gateway handling.
S3 | https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically | explicit grants for new tables; checked 2026-10-18 IST.
Plan | docs/DB_INTEGRATION_PLAN.md | approved no-public-grants, immutability, outbox, hash/readback and owner-only deployment requirements.
Doc lookup | Official API-key+RLS pages and Data API changelog checked 2026-10-18 IST; search_docs used for auth; no backend inspected.
