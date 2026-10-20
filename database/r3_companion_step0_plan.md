# DB-5 stage 0 offline prep plan (R3 companion)

Source: database/r3_companion.sql (DB-2 additive objects). No deploy.

Objects to add (R3-prefixed only):
- public.r3_runs table (append-only run evidence)
- r3_runs_research_eligible_idx, r3_runs_eligibility_kind_idx
- RLS enabled on r3_runs
- policies: r3_runs_service_role_select/insert (service_role only)
- function r3_reject_run_mutation() + trigger r3_runs_append_only (UPDATE/DELETE blocked)
- view r3_research_eligible (security_invoker, ELIGIBLE research rows only)
- view r3_evidence_readback (security_invoker, all rows)

Rules:
- schema_version must equal '1.0' (CHECK).
- aggregate_eligibility in ELIGIBLE/EXCLUDED/PENDING_VALIDATION.
- ELIGIBLE requires RESEARCH + non-empty app_id/comparison_id.
- TRIAL rows must be EXCLUDED.
- supersedes_report must not equal run_id.
- manifest/report/payload hashes lowercase SHA-256 (64 hex).
- run_id PK ensures uniqueness (duplicate -> 1 row).
- grants: service_role SELECT/INSERT only; anon/authenticated no access to table/views.
- no DROP/ALTER of existing team objects (runs, run_summary, web_a/b, mobile_a/b).
- rollback reverses in dependency order; only R3 objects removed.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (names only; values never written).
Owner gates H1/H2 required before any apply.