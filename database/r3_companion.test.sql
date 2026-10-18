-- DB-2 allow/deny regression for an isolated Supabase-compatible test project.
-- Run as a database owner after r3_companion.sql, with ON_ERROR_STOP enabled.
-- The whole fixture transaction rolls back; it writes only public.r3_runs.
-- Do not run against production as a substitute for the owner DB-5 plan.
-- Test DB must start with the six approved team objects from DB-2a.
-- The six-object check proves presence only; unchanged definitions require the
-- authorized DB-5 before/after fingerprint and are not claimed by this test.

BEGIN;

DO $$
DECLARE
  team_object_count integer;
  eligible_def text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.r3_runs'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on r3_runs';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.r3_runs', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.r3_runs', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.r3_research_eligible', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.r3_evidence_readback', 'SELECT') THEN
    RAISE EXCEPTION 'service_role requires SELECT and INSERT';
  END IF;
  IF has_table_privilege('service_role', 'public.r3_runs', 'UPDATE')
     OR has_table_privilege('service_role', 'public.r3_runs', 'DELETE')
     OR has_table_privilege('anon', 'public.r3_runs', 'SELECT')
     OR has_table_privilege('anon', 'public.r3_runs', 'INSERT')
     OR has_table_privilege('anon', 'public.r3_runs', 'UPDATE')
     OR has_table_privilege('anon', 'public.r3_runs', 'DELETE')
     OR has_table_privilege('authenticated', 'public.r3_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.r3_runs', 'INSERT')
     OR has_table_privilege('authenticated', 'public.r3_runs', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.r3_runs', 'DELETE')
     OR has_table_privilege('anon', 'public.r3_research_eligible', 'SELECT')
     OR has_table_privilege('authenticated', 'public.r3_research_eligible', 'SELECT')
     OR has_table_privilege('anon', 'public.r3_evidence_readback', 'SELECT')
     OR has_table_privilege('authenticated', 'public.r3_evidence_readback', 'SELECT') THEN
    RAISE EXCEPTION 'unexpected table privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.r3_research_eligible'::regclass
      AND reloptions @> ARRAY['security_invoker=true']
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.r3_evidence_readback'::regclass
      AND reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'views must use security_invoker';
  END IF;

  SELECT pg_get_viewdef('public.r3_research_eligible'::regclass, true)
    INTO eligible_def;
  IF position('RESEARCH' in eligible_def) = 0
     OR position('ELIGIBLE' in eligible_def) = 0 THEN
    RAISE EXCEPTION 'eligible view is missing its research/eligibility filter';
  END IF;

  SELECT count(*) INTO team_object_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'runs', 'run_summary', 'web_a_runs', 'web_b_runs',
      'mobile_a_runs', 'mobile_b_runs'
    );
  IF team_object_count <> 6 THEN
    RAISE EXCEPTION 'expected six existing team objects to remain present; found %', team_object_count;
  END IF;
END;
$$;

-- Public clients must fail on both direct table access and eligible-view access.
SET LOCAL ROLE anon;
DO $$
BEGIN
  -- Same ID and same payload hash is stopped by the primary key at SQL level;
  -- transport may ignore the duplicate only after exact-hash comparison.
  BEGIN
    PERFORM 1 FROM public.r3_runs;
    RAISE EXCEPTION 'anon SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-anon-denied', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-anon-denied"}', '{"run":{"id":"db2-anon-denied"}}', '{}', '{}');
    RAISE EXCEPTION 'anon INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.r3_research_eligible;
    RAISE EXCEPTION 'anon eligible-view SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.r3_runs;
    RAISE EXCEPTION 'authenticated SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-auth-denied', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-auth-denied"}', '{"run":{"id":"db2-auth-denied"}}', '{}', '{}');
    RAISE EXCEPTION 'authenticated INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Exercise the configured trusted backend role for its positive INSERT grant.
SET LOCAL ROLE service_role;
INSERT INTO public.r3_runs (
  run_id, app_id, comparison_id, platform, stage, schema_version,
  experiment_kind, execution_outcome, integrity_verdict, aggregate_eligibility,
  manifest_sha256, report_sha256, payload_sha256, manifest, report,
  source_pointers, availability
) VALUES (
  'db2-control-research', 'db2-app', 'db2-comparison', 'web', 'A', '1.0',
  'RESEARCH', 'PASS', 'CLEAN', 'ELIGIBLE', repeat('a', 64), repeat('b', 64),
  repeat('c', 64), '{"run_id":"db2-control-research"}',
  '{"run":{"id":"db2-control-research"}}', '{}', '{}'
), (
  'db2-control-trial', NULL, NULL, 'web', 'trial', '1.0',
  'TRIAL', 'BLOCKED', 'CLEAN', 'EXCLUDED', repeat('d', 64), repeat('e', 64),
  repeat('f', 64), '{"run_id":"db2-control-trial"}',
  '{"run":{"id":"db2-control-trial"}}', '{}', '{}'
);

-- Exercise exact evidence readback and the filtered research view as backend.
DO $$
DECLARE
  eligible_count integer;
  readback_count integer;
BEGIN
  SELECT count(*) INTO eligible_count FROM public.r3_research_eligible
  WHERE run_id IN ('db2-control-research', 'db2-control-trial');
  IF eligible_count <> 1 THEN
    RAISE EXCEPTION 'eligible view must include research and exclude trial; found %', eligible_count;
  END IF;
  SELECT count(*) INTO readback_count FROM public.r3_evidence_readback
  WHERE run_id IN ('db2-control-research', 'db2-control-trial');
  IF readback_count <> 2 THEN
    RAISE EXCEPTION 'authorized readback must include both rows; found %', readback_count;
  END IF;
END;
$$;
RESET ROLE;

-- Duplicate IDs reject at the PK. Transport must DO NOTHING then compare hashes.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-research', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-control-research"}', '{"run":{"id":"db2-control-research"}}', '{}', '{}');
    RAISE EXCEPTION 'duplicate run_id unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Same ID with a changed payload also conflicts; never overwrite the row.
  BEGIN
    INSERT INTO public.r3_runs (
      run_id, app_id, comparison_id, platform, stage, schema_version,
      experiment_kind, execution_outcome, integrity_verdict, aggregate_eligibility,
      manifest_sha256, report_sha256, payload_sha256, manifest, report,
      source_pointers, availability
    ) VALUES (
      'db2-control-research', 'db2-app', 'db2-comparison', 'web', 'A', '1.0',
      'RESEARCH', 'PASS', 'CLEAN', 'ELIGIBLE', repeat('a', 64), repeat('b', 64),
      repeat('9', 64), '{"run_id":"db2-control-research"}',
      '{"run":{"id":"db2-control-research"}}', '{}', '{}'
    );
    RAISE EXCEPTION 'same-ID changed-payload insert unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-trial-eligible', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'ELIGIBLE',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-control-trial-eligible"}', '{"run":{"id":"db2-control-trial-eligible"}}', '{}', '{}');
    RAISE EXCEPTION 'eligible trial unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-bad-outcome', '1.0', 'TRIAL', 'MAYBE', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-control-bad-outcome"}', '{"run":{"id":"db2-control-bad-outcome"}}', '{}', '{}');
    RAISE EXCEPTION 'unsupported execution outcome unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-bad-root', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '[]', '{"run":{"id":"db2-control-bad-root"}}', '{}', '{}');
    RAISE EXCEPTION 'array manifest root unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-bad-payload-hash', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), 'bad-hash',
      '{"run_id":"db2-control-bad-payload-hash"}',
      '{"run":{"id":"db2-control-bad-payload-hash"}}', '{}', '{}');
    RAISE EXCEPTION 'malformed payload hash unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-bad-hash', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      'not-a-hash', repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-control-bad-hash"}', '{"run":{"id":"db2-control-bad-hash"}}', '{}', '{}');
    RAISE EXCEPTION 'malformed source hash unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.r3_runs (
      run_id, schema_version, experiment_kind, execution_outcome,
      integrity_verdict, aggregate_eligibility, manifest_sha256,
      report_sha256, payload_sha256, manifest, report, source_pointers,
      availability
    ) VALUES ('db2-control-bad-id', '1.0', 'TRIAL', 'PASS', 'CLEAN', 'EXCLUDED',
      repeat('a', 64), repeat('b', 64), repeat('c', 64),
      '{"run_id":"db2-control-bad-id"}', '{"run":{"id":"some-other-id"}}', '{}', '{}');
    RAISE EXCEPTION 'manifest/report identity mismatch unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- The trigger refuses privileged UPDATE/DELETE; transaction rollback leaves no fixture rows.
DO $$
BEGIN
  BEGIN
    UPDATE public.r3_runs SET execution_outcome = 'FAIL'
    WHERE run_id = 'db2-control-research';
    RAISE EXCEPTION 'UPDATE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id = 'db2-control-research';
    RAISE EXCEPTION 'DELETE unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
  END;
END;
$$;

ROLLBACK;
