-- DB-2 additive R3 companion objects for the existing Supabase project.
-- Preconditions: approved DB-5 owner access, DB-2a collision/preservation
-- inspection, and accepted DB-1 field contract. Execute once after review.
-- Never run setup.sql here; this file does not modify public.runs or team views.
-- Hash columns validate lowercase SHA-256 shape only; clients recompute hashes.
-- Transport must compare an existing payload hash before accepting a retry.

BEGIN;

CREATE TABLE public.r3_runs (
  run_id text PRIMARY KEY,
  app_id text,
  comparison_id text,
  platform text,
  stage text,
  schema_version text NOT NULL,
  experiment_kind text NOT NULL,
  execution_outcome text NOT NULL,
  integrity_verdict text NOT NULL,
  aggregate_eligibility text NOT NULL,
  supersedes_report text,
  manifest_sha256 text NOT NULL,
  report_sha256 text NOT NULL,
  payload_sha256 text NOT NULL,
  manifest jsonb NOT NULL,
  report jsonb NOT NULL,
  source_pointers jsonb NOT NULL,
  availability jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),

  CONSTRAINT r3_runs_schema_version_ck
    CHECK (schema_version = '1.0'),
  CONSTRAINT r3_runs_experiment_kind_ck
    CHECK (experiment_kind IN ('RESEARCH', 'TRIAL', 'PENDING_VALIDATION')),
  CONSTRAINT r3_runs_execution_outcome_ck
    CHECK (execution_outcome IN (
      'PASS', 'PARTIAL', 'FAIL', 'BLOCKED', 'ERROR', 'INCONCLUSIVE',
      'NOT_RECORDED'
    )),
  CONSTRAINT r3_runs_integrity_verdict_ck
    CHECK (integrity_verdict IN (
      'CLEAN', 'QUARANTINED', 'CONTAMINATED', 'INCONCLUSIVE',
      'NOT_EVALUATED', 'PENDING_VALIDATION'
    )),
  CONSTRAINT r3_runs_aggregate_eligibility_ck
    CHECK (aggregate_eligibility IN (
      'ELIGIBLE', 'EXCLUDED', 'PENDING_VALIDATION'
    )),
  CONSTRAINT r3_runs_trial_excluded_ck
    CHECK (experiment_kind <> 'TRIAL' OR aggregate_eligibility = 'EXCLUDED'),
  CONSTRAINT r3_runs_eligible_research_ids_ck
    CHECK (aggregate_eligibility <> 'ELIGIBLE' OR (
      experiment_kind = 'RESEARCH'
      AND app_id IS NOT NULL AND btrim(app_id) <> ''
      AND comparison_id IS NOT NULL AND btrim(comparison_id) <> ''
    )),
  CONSTRAINT r3_runs_supersedes_ck
    CHECK (supersedes_report IS NULL OR supersedes_report <> run_id),
  CONSTRAINT r3_runs_manifest_hash_ck
    CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT r3_runs_report_hash_ck
    CHECK (report_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT r3_runs_payload_hash_ck
    CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT r3_runs_manifest_object_ck
    CHECK (jsonb_typeof(manifest) = 'object'),
  CONSTRAINT r3_runs_report_object_ck
    CHECK (jsonb_typeof(report) = 'object'),
  CONSTRAINT r3_runs_manifest_id_ck
    CHECK (manifest ->> 'run_id' IS NOT NULL AND manifest ->> 'run_id' = run_id),
  CONSTRAINT r3_runs_report_id_ck
    CHECK (report #>> '{run,id}' IS NOT NULL AND report #>> '{run,id}' = run_id),
  CONSTRAINT r3_runs_source_pointers_object_ck
    CHECK (jsonb_typeof(source_pointers) = 'object'),
  CONSTRAINT r3_runs_availability_object_ck
    CHECK (jsonb_typeof(availability) = 'object')
);

CREATE INDEX r3_runs_research_eligible_idx
  ON public.r3_runs (platform, stage, created_at)
  WHERE experiment_kind = 'RESEARCH' AND aggregate_eligibility = 'ELIGIBLE';

CREATE INDEX r3_runs_eligibility_kind_idx
  ON public.r3_runs (aggregate_eligibility, experiment_kind, created_at);

ALTER TABLE public.r3_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY r3_runs_service_role_select
  ON public.r3_runs FOR SELECT TO service_role USING (true);

CREATE POLICY r3_runs_service_role_insert
  ON public.r3_runs FOR INSERT TO service_role WITH CHECK (true);

CREATE FUNCTION public.r3_reject_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'r3_runs is append-only; % is refused', TG_OP
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.r3_reject_run_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.r3_reject_run_mutation() FROM anon, authenticated, service_role;

CREATE TRIGGER r3_runs_append_only
  BEFORE UPDATE OR DELETE ON public.r3_runs
  FOR EACH ROW EXECUTE FUNCTION public.r3_reject_run_mutation();

CREATE VIEW public.r3_research_eligible
WITH (security_invoker = true)
AS
SELECT run_id, app_id, comparison_id, platform, stage, schema_version,
       execution_outcome, integrity_verdict, supersedes_report,
       manifest_sha256, report_sha256, payload_sha256, created_at
FROM public.r3_runs
WHERE experiment_kind = 'RESEARCH'
  AND aggregate_eligibility = 'ELIGIBLE';

CREATE VIEW public.r3_evidence_readback
WITH (security_invoker = true)
AS
SELECT run_id, app_id, comparison_id, platform, stage, schema_version,
       experiment_kind, execution_outcome, integrity_verdict,
       aggregate_eligibility, supersedes_report, manifest_sha256,
       report_sha256, payload_sha256, manifest, report, source_pointers,
       availability, created_at
FROM public.r3_runs;

-- Supabase projects can grant public-schema table/view privileges by default.
-- Explicitly remove those grants, then give the trusted server role only the
-- operations required by the upload/readback contract.
REVOKE ALL PRIVILEGES ON TABLE public.r3_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.r3_runs TO service_role;
REVOKE ALL PRIVILEGES ON TABLE public.r3_research_eligible FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.r3_evidence_readback FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.r3_research_eligible TO service_role;
GRANT SELECT ON TABLE public.r3_evidence_readback TO service_role;

COMMIT;
