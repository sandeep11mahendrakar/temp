-- DB-5 stage 0 negative controls (local/mock only; no deploy).
-- Assumes r3_companion.sql already applied. Wrapped transaction rolls back.

BEGIN;

-- Anon must not read/write r3_runs or views.
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.r3_runs;
    RAISE EXCEPTION 'anon SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.r3_runs (run_id,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
    VALUES ('neg-anon','1.0','TRIAL','PASS','CLEAN','EXCLUDED',repeat('a',64),repeat('b',64),repeat('c',64),'{"run_id":"neg-anon"}','{"run":{"id":"neg-anon"}}','{}','{}');
    RAISE EXCEPTION 'anon INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='neg-anon';
    RAISE EXCEPTION 'anon UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='neg-anon';
    RAISE EXCEPTION 'anon DELETE unexpectedly succeeded';
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

-- Authenticated must not read/write.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.r3_runs;
    RAISE EXCEPTION 'authenticated SELECT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.r3_runs (run_id,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
    VALUES ('neg-auth','1.0','TRIAL','PASS','CLEAN','EXCLUDED',repeat('a',64),repeat('b',64),repeat('c',64),'{"run_id":"neg-auth"}','{"run":{"id":"neg-auth"}}','{}','{}');
    RAISE EXCEPTION 'authenticated INSERT unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='neg-auth';
    RAISE EXCEPTION 'authenticated UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='neg-auth';
    RAISE EXCEPTION 'authenticated DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
RESET ROLE;

-- Service role can insert.
SET LOCAL ROLE service_role;
INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
VALUES ('neg-svc','app','cmp','web','A','1.0','RESEARCH','PASS','CLEAN','ELIGIBLE',repeat('a',64),repeat('b',64),repeat('c',64),'{"run_id":"neg-svc"}','{"run":{"id":"neg-svc"}}','{}','{}'),
       ('neg-trial','app','cmp','web','trial','1.0','TRIAL','BLOCKED','CLEAN','EXCLUDED',repeat('d',64),repeat('e',64),repeat('f',64),'{"run_id":"neg-trial"}','{"run":{"id":"neg-trial"}}','{}','{}');

-- Duplicate run_id => one row.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (run_id,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
    VALUES ('neg-svc','1.0','TRIAL','PASS','CLEAN','EXCLUDED',repeat('a',64),repeat('b',64),repeat('c',64),'{"run_id":"neg-svc"}','{"run":{"id":"neg-svc"}}','{}','{}');
    RAISE EXCEPTION 'duplicate run_id unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- Hash conflict rejected (same id, changed payload hash).
DO $$
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
    VALUES ('neg-svc','app','cmp','web','A','1.0','RESEARCH','PASS','CLEAN','ELIGIBLE',repeat('a',64),repeat('b',64),repeat('9',64),'{"run_id":"neg-svc"}','{"run":{"id":"neg-svc"}}','{}','{}');
    RAISE EXCEPTION 'hash conflict unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;

-- Eligible-only view.
DO $$
DECLARE ec integer;
BEGIN
  SELECT count(*) INTO ec FROM public.r3_research_eligible WHERE run_id IN ('neg-svc','neg-trial');
  IF ec <> 1 THEN
    RAISE EXCEPTION 'eligible view expected 1 research row, got %', ec;
  END IF;
END;
$$;

-- Immutability: UPDATE/DELETE rejected.
DO $$
BEGIN
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='neg-svc';
    RAISE EXCEPTION 'UPDATE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='neg-svc';
    RAISE EXCEPTION 'DELETE unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE '55000' THEN NULL;
  END;
END;
$$;
RESET ROLE;

ROLLBACK;
