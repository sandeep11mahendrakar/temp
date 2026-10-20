-- TV-1 DIAGNOSTICS R3 - LOCAL DIAGNOSTIC / UNAPPROVED / NO HOSTED PROOF.
-- Only for the exact separately approved personal dev project capstone-r3-dev
-- ref=xvizjawcpafdqrygzvcx; W2 owns DB-5 until recorded SUB handoff.
-- No apply, no uploading, no migration changes, no privilege grants in this script.
-- BEFORE RUN: approved owner/SUB release, independently reviewed diagnostics,
-- baseline/catalog collision review, dedicated session, verified rollback-on-error
-- executor, and NOTICE + SELECT + SQLSTATE evidence capture.
-- FAIL CLOSED: if executor cannot guarantee same-session rollback and close in
-- finally after ANY error, DO NOT RUN. SQL cannot close its client session.
-- On disconnect PostgreSQL aborts uncommitted transactions; fresh-session
-- post-failure confirmation needs externally retained preflight fingerprint.
-- Never execute with a tool that may silently split sessions/autocommit INSERTs.
-- This is DATABASE-only testing; no approved uploader retry/hash validation here.
-- Stored-envelope SHA-256 recomputation remains client-side R6 contract work.
-- LOCAL runner supplies an explicit approved zero/six fixture profile and temp baseline.
-- pg_temp.tv1_team_inventory measures public non-R3 objects; no constant-empty CTE.

-- SESSION PREFLIGHT: measured catalog vs executor-retained temp expectation.
DO $session_preflight$
<<baseline_check>>
DECLARE
  owner_name text; is_superuser boolean; objects_n integer; baseline_fp text;
  enabled_trigger boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(c.relowner) INTO owner_name
    FROM pg_catalog.pg_class c WHERE c.oid='public.r3_runs'::regclass;
  SELECT rolsuper INTO is_superuser FROM pg_catalog.pg_roles WHERE rolname=current_user;
  IF (current_user <> owner_name AND NOT COALESCE(is_superuser,false)) OR
     NOT pg_catalog.has_table_privilege(current_user,'public.r3_runs','UPDATE') OR
     NOT pg_catalog.has_table_privilege(current_user,'public.r3_runs','DELETE') THEN
     RAISE EXCEPTION 'PREFLIGHT/OWNER: privileged executor (table owner/superuser with UPDATE+DELETE) required';
  END IF;
  IF NOT pg_catalog.pg_has_role(session_user,'anon','SET') OR
     NOT pg_catalog.pg_has_role(session_user,'authenticated','SET') OR
     NOT pg_catalog.pg_has_role(session_user,'service_role','SET') THEN
     RAISE EXCEPTION 'PREFLIGHT/ROLES: session user cannot SET all tested roles';
  END IF;
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid='public.r3_runs'::regclass AND tgname='r3_runs_append_only'
       AND tgenabled IN ('O','A')) INTO enabled_trigger;
  IF NOT enabled_trigger THEN
     RAISE EXCEPTION 'PREFLIGHT/TRIGGER: expected enabled append-only trigger absent';
  END IF;
  SELECT i.objects_n,i.fingerprint INTO objects_n,baseline_fp FROM pg_temp.tv1_team_inventory i;
  IF NOT EXISTS (SELECT 1 FROM pg_temp.tv1_expected_baseline b
                 WHERE b.objects_n=baseline_check.objects_n AND b.fingerprint=baseline_check.baseline_fp) THEN
    RAISE EXCEPTION 'PREFLIGHT/BASELINE measured catalog differs from approved local expectation';
  END IF;
  RAISE NOTICE 'PREFLIGHT/OWNER | owner_or_superuser=true | update=true | delete=true | PASS';
  RAISE NOTICE 'PREFLIGHT/ROLES | anon/authenticated/service_role SET=true | PASS';
  RAISE NOTICE 'PREFLIGHT/TRIGGER | enabled=true | PASS';
  RAISE NOTICE 'PREFLIGHT/BASELINE | objects=% | fingerprint=% | PASS', objects_n, baseline_fp;
END $session_preflight$;

BEGIN;
SET LOCAL client_min_messages = notice;
-- Preflight no previously existing synthetic row IDs. Any collision aborts the transaction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.r3_runs WHERE left(run_id, length('ocdb_tv1_20261019_')) = 'ocdb_tv1_20261019_') THEN
    RAISE EXCEPTION 'TV1 diagnostic fixture collision; refuse to overwrite or reuse';
  END IF;
END $$;
DO $catalog$
DECLARE rls_enabled boolean; v_name text; security_invoker_on boolean;
BEGIN
  SELECT c.relrowsecurity INTO rls_enabled FROM pg_catalog.pg_class c
   WHERE c.oid='public.r3_runs'::regclass;
  IF NOT COALESCE(rls_enabled,false) THEN
    RAISE EXCEPTION 'CAT/RLS: public.r3_runs must have relrowsecurity=true';
  END IF;
  RAISE NOTICE 'CAT/RLS | table=r3_runs | expected=true | actual=true | PASS';
  FOREACH v_name IN ARRAY ARRAY['r3_research_eligible','r3_evidence_readback'] LOOP
    SELECT COALESCE('security_invoker=true'=ANY(c.reloptions),false)
      INTO security_invoker_on FROM pg_catalog.pg_class c
     WHERE c.oid=pg_catalog.to_regclass('public.'||v_name);
    IF NOT COALESCE(security_invoker_on,false) THEN
      RAISE EXCEPTION 'CAT/SECURITY-INVOKER: % must be true',v_name;
    END IF;
    RAISE NOTICE 'CAT/SECURITY-INVOKER | view=% | expected=true | actual=true | PASS',v_name;
  END LOOP;
END $catalog$;
SELECT 'CAT/RLS' AS case_id,c.relname,c.relrowsecurity AS rls_on
 FROM pg_catalog.pg_class c WHERE c.oid='public.r3_runs'::regclass;
SELECT 'CAT/VIEWS' AS case_id,c.relname,c.reloptions
 FROM pg_catalog.pg_class c WHERE c.oid IN ('public.r3_research_eligible'::regclass,'public.r3_evidence_readback'::regclass)
 ORDER BY c.relname;
-- Positive INSERT fixtures (not digest-valid payloads; digest handled separately).
SET LOCAL ROLE service_role;
INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,
  execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,
  report_sha256,payload_sha256,manifest,report,source_pointers,availability) VALUES
('ocdb_tv1_20261019_eligible','app','cmp','web','A','1.0','RESEARCH','PASS','CLEAN','ELIGIBLE',NULL,repeat('a',64),repeat('b',64),repeat('c',64),
  '{"run_id":"ocdb_tv1_20261019_eligible"}'::jsonb, '{"run":{"id":"ocdb_tv1_20261019_eligible"}}'::jsonb, '{}'::jsonb, '{}'::jsonb),
('ocdb_tv1_20261019_trial','app','cmp','web','A','1.0','TRIAL','PASS','CLEAN','EXCLUDED',NULL,repeat('a',64),repeat('b',64),repeat('c',64),
  '{"run_id":"ocdb_tv1_20261019_trial"}'::jsonb, '{"run":{"id":"ocdb_tv1_20261019_trial"}}'::jsonb, '{}'::jsonb, '{}'::jsonb),
('ocdb_tv1_20261019_excluded','app','cmp','web','A','1.0','RESEARCH','PASS','CLEAN','EXCLUDED',NULL,repeat('a',64),repeat('b',64),repeat('c',64),
  '{"run_id":"ocdb_tv1_20261019_excluded"}'::jsonb, '{"run":{"id":"ocdb_tv1_20261019_excluded"}}'::jsonb, '{}'::jsonb, '{}'::jsonb),
('ocdb_tv1_20261019_pending','app','cmp','web','A','1.0','PENDING_VALIDATION','PASS','CLEAN','PENDING_VALIDATION',NULL,repeat('a',64),repeat('b',64),repeat('c',64),
  '{"run_id":"ocdb_tv1_20261019_pending"}'::jsonb, '{"run":{"id":"ocdb_tv1_20261019_pending"}}'::jsonb, '{}'::jsonb, '{}'::jsonb);
DO $fixture_count$
DECLARE actual_count integer;
BEGIN
 SELECT count(*) INTO actual_count FROM public.r3_runs
 WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
 IF actual_count <> 4 THEN
   RAISE EXCEPTION 'POS-INSERT: fixture_count expected 4, observed %',actual_count;
 END IF;
 RAISE NOTICE 'POS-INSERT | fixture_count=4 | expected=4 | PASS';
END $fixture_count$;
SELECT 'POS-INSERT' AS case_id,count(*) AS fixture_count FROM public.r3_runs
 WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
RESET ROLE;
SET LOCAL ROLE anon;
-- NEG-01: explicit observed SQLSTATE via GET STACKED DIAGNOSTICS and NOTICE output.
DO $tv1$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    PERFORM 1 FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-01/SELECT: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-01/SELECT | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    INSERT INTO public.r3_runs(run_id,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) VALUES ('ocdb_tv1_20261019_denied','1.0','TRIAL','PASS','CLEAN','EXCLUDED',repeat('a',64),repeat('b',64),repeat('c',64),'{"run_id":"ocdb_tv1_20261019_denied"}','{"run":{"id":"ocdb_tv1_20261019_denied"}}','{}','{}');
    RAISE EXCEPTION 'NEG-01/INSERT: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-01/INSERT | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-01/UPDATE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-01/UPDATE | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-01/DELETE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-01/DELETE | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    PERFORM 1 FROM public.r3_research_eligible;
    RAISE EXCEPTION 'NEG-01/ELIGIBLE-VIEW: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-01/ELIGIBLE-VIEW | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    PERFORM 1 FROM public.r3_evidence_readback;
    RAISE EXCEPTION 'NEG-01/READBACK-VIEW: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-01/READBACK-VIEW | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
END $tv1$;
RESET ROLE;
SET LOCAL ROLE authenticated;
-- NEG-02: explicit observed SQLSTATE via GET STACKED DIAGNOSTICS and NOTICE output.
DO $tv1$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    PERFORM 1 FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-02/SELECT: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-02/SELECT | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    INSERT INTO public.r3_runs(run_id,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) VALUES ('ocdb_tv1_20261019_denied','1.0','TRIAL','PASS','CLEAN','EXCLUDED',repeat('a',64),repeat('b',64),repeat('c',64),'{"run_id":"ocdb_tv1_20261019_denied"}','{"run":{"id":"ocdb_tv1_20261019_denied"}}','{}','{}');
    RAISE EXCEPTION 'NEG-02/INSERT: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-02/INSERT | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-02/UPDATE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-02/UPDATE | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-02/DELETE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-02/DELETE | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    PERFORM 1 FROM public.r3_research_eligible;
    RAISE EXCEPTION 'NEG-02/ELIGIBLE-VIEW: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-02/ELIGIBLE-VIEW | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    PERFORM 1 FROM public.r3_evidence_readback;
    RAISE EXCEPTION 'NEG-02/READBACK-VIEW: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-02/READBACK-VIEW | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
END $tv1$;
RESET ROLE;
SET LOCAL ROLE service_role;
-- NEG-03-SERVICE: explicit observed SQLSTATE via GET STACKED DIAGNOSTICS and NOTICE output.
DO $tv1$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-03-SERVICE/UPDATE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-03-SERVICE/UPDATE | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-03-SERVICE/DELETE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-03-SERVICE/DELETE | expected=42501 | actual=% | constraint=% | PASS', actual, cname;
  END;
END $tv1$;
-- POS-RETRY: database ON CONFLICT DO NOTHING is NOT approved transport proof.
DO $retry$
DECLARE before_digest text; after_digest text; row_count integer; inserted_count integer;
BEGIN
 SELECT payload_sha256 INTO STRICT before_digest FROM public.r3_runs
  WHERE run_id='ocdb_tv1_20261019_eligible';
 INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
 SELECT run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability
 FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible'
 ON CONFLICT (run_id) DO NOTHING;
 GET DIAGNOSTICS inserted_count = ROW_COUNT;
 SELECT count(*),min(payload_sha256) INTO row_count,after_digest FROM public.r3_runs
  WHERE run_id='ocdb_tv1_20261019_eligible';
 IF inserted_count <> 0 OR row_count <> 1 OR after_digest IS DISTINCT FROM before_digest THEN
   RAISE EXCEPTION 'POS-RETRY: expected zero inserts, one row, unchanged digest';
 END IF;
 RAISE NOTICE 'POS-RETRY | inserted=0 | row_count=1 | digest_unchanged=true | PASS';
END $retry$;
SELECT 'POS-RETRY' AS case_id,count(*) AS row_count,
       min(payload_sha256) AS stored_digest FROM public.r3_runs
 WHERE run_id='ocdb_tv1_20261019_eligible';
-- NEG-04: explicit observed SQLSTATE via GET STACKED DIAGNOSTICS and NOTICE output.
DO $tv1$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) SELECT run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,repeat('9',64),manifest,report,source_pointers,availability FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-04/HASH-CONFLICT: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23505' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_pkey' THEN
      RAISE EXCEPTION 'NEG-04/HASH-CONFLICT expected constraint r3_runs_pkey, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-04/HASH-CONFLICT | expected=23505 | actual=% | constraint=% | PASS', actual, cname;
  END;
END $tv1$;
-- NEG-05: explicit observed SQLSTATE via GET STACKED DIAGNOSTICS and NOTICE output.
DO $tv1$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) SELECT 'ocdb_tv1_20261019_bad_schema',app_id,comparison_id,platform,stage,'2.0',experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,jsonb_set(manifest, '{run_id}', to_jsonb('ocdb_tv1_20261019_bad_schema'::text)),jsonb_set(report, '{run,id}', to_jsonb('ocdb_tv1_20261019_bad_schema'::text)),source_pointers,availability FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-05/BAD-SCHEMA: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_schema_version_ck' THEN
      RAISE EXCEPTION 'NEG-05/BAD-SCHEMA expected constraint r3_runs_schema_version_ck, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-05/BAD-SCHEMA | expected=23514 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) SELECT 'ocdb_tv1_20261019_bad_eligibility',app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,'UNKNOWN',supersedes_report,manifest_sha256,report_sha256,payload_sha256,jsonb_set(manifest, '{run_id}', to_jsonb('ocdb_tv1_20261019_bad_eligibility'::text)),jsonb_set(report, '{run,id}', to_jsonb('ocdb_tv1_20261019_bad_eligibility'::text)),source_pointers,availability FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-05/BAD-ELIGIBILITY: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_aggregate_eligibility_ck' THEN
      RAISE EXCEPTION 'NEG-05/BAD-ELIGIBILITY expected constraint r3_runs_aggregate_eligibility_ck, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-05/BAD-ELIGIBILITY | expected=23514 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) SELECT 'ocdb_tv1_20261019_bad_trial',app_id,comparison_id,platform,stage,schema_version,'TRIAL',execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,jsonb_set(manifest, '{run_id}', to_jsonb('ocdb_tv1_20261019_bad_trial'::text)),jsonb_set(report, '{run,id}', to_jsonb('ocdb_tv1_20261019_bad_trial'::text)),source_pointers,availability FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-05/TRIAL-ELIGIBLE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_eligible_research_ids_ck' THEN
      RAISE EXCEPTION 'NEG-05/TRIAL-ELIGIBLE expected constraint r3_runs_eligible_research_ids_ck, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-05/TRIAL-ELIGIBLE | expected=23514 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) SELECT 'ocdb_tv1_20261019_bad_ids',NULL,NULL,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,jsonb_set(manifest, '{run_id}', to_jsonb('ocdb_tv1_20261019_bad_ids'::text)),jsonb_set(report, '{run,id}', to_jsonb('ocdb_tv1_20261019_bad_ids'::text)),source_pointers,availability FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-05/MISSING-IDS: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_eligible_research_ids_ck' THEN
      RAISE EXCEPTION 'NEG-05/MISSING-IDS expected constraint r3_runs_eligible_research_ids_ck, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-05/MISSING-IDS | expected=23514 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability) SELECT 'ocdb_tv1_20261019_bad_supersedes',app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,'ocdb_tv1_20261019_bad_supersedes',manifest_sha256,report_sha256,payload_sha256,jsonb_set(manifest, '{run_id}', to_jsonb('ocdb_tv1_20261019_bad_supersedes'::text)),jsonb_set(report, '{run,id}', to_jsonb('ocdb_tv1_20261019_bad_supersedes'::text)),source_pointers,availability FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-05/SELF-SUPERSEDES: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_supersedes_ck' THEN
      RAISE EXCEPTION 'NEG-05/SELF-SUPERSEDES expected constraint r3_runs_supersedes_ck, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-05/SELF-SUPERSEDES | expected=23514 | actual=% | constraint=% | PASS', actual, cname;
  END;
END $tv1$;
-- TRIAL+ELIGIBLE violates both trial-exclusion and eligible-research-ID checks;
-- PostgreSQL checks names alphabetically, so this additionally isolates trial exclusion.
DO $trial_pending$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
    SELECT 'ocdb_tv1_20261019_bad_trial_pending',app_id,comparison_id,platform,stage,schema_version,'TRIAL',execution_outcome,integrity_verdict,'PENDING_VALIDATION',supersedes_report,manifest_sha256,report_sha256,payload_sha256,
           jsonb_set(manifest,'{run_id}',to_jsonb('ocdb_tv1_20261019_bad_trial_pending'::text)),
           jsonb_set(report,'{run,id}',to_jsonb('ocdb_tv1_20261019_bad_trial_pending'::text)),source_pointers,availability
      FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-05/TRIAL-PENDING: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    GET STACKED DIAGNOSTICS actual=RETURNED_SQLSTATE,cname=CONSTRAINT_NAME;
    IF cname IS DISTINCT FROM 'r3_runs_trial_excluded_ck' THEN
      RAISE EXCEPTION 'NEG-05/TRIAL-PENDING expected r3_runs_trial_excluded_ck, got %',cname;
    END IF;
    RAISE NOTICE 'NEG-05/TRIAL-PENDING | expected=23514 | actual=% | constraint=% | PASS',actual,cname;
  END;
END $trial_pending$;
-- NEG-06 includes only view-exposed columns.
SELECT 'NEG-06' AS case_id,run_id,app_id,comparison_id,schema_version,payload_sha256
 FROM public.r3_research_eligible WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_'
 ORDER BY run_id;
DO $eligible_membership$
DECLARE expected_id text := 'ocdb_tv1_20261019_eligible'; ids text[]; all_count integer;
BEGIN
 SELECT array_agg(run_id ORDER BY run_id) INTO ids FROM public.r3_research_eligible
  WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
 SELECT count(*) INTO all_count FROM public.r3_evidence_readback
  WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
 IF ids IS DISTINCT FROM ARRAY[expected_id]::text[] OR all_count <> 4 THEN
   RAISE EXCEPTION 'NEG-06 expected only eligible ID %, got %, readback_count %',expected_id,ids,all_count;
 END IF;
 RAISE NOTICE 'NEG-06 | eligible_count=1 | sole_id=% | readback_count=4 | PASS',expected_id;
END $eligible_membership$;
RESET ROLE;
-- Owner/DDL-role append-only trigger path (separate from service_role denied grant).
DO $owner_recheck$
DECLARE owner_name text; is_superuser boolean;
BEGIN
 SELECT pg_catalog.pg_get_userbyid(c.relowner) INTO owner_name FROM pg_catalog.pg_class c
  WHERE c.oid='public.r3_runs'::regclass;
 SELECT rolsuper INTO is_superuser FROM pg_catalog.pg_roles WHERE rolname=current_user;
 IF (current_user <> owner_name AND NOT COALESCE(is_superuser,false)) OR
    NOT pg_catalog.has_table_privilege(current_user,'public.r3_runs','UPDATE') OR
    NOT pg_catalog.has_table_privilege(current_user,'public.r3_runs','DELETE') THEN
     RAISE EXCEPTION 'NEG-03-OWNER-TRIGGER: role-reset failed or privileges insufficient';
 END IF;
 RAISE NOTICE 'NEG-03-OWNER-PREFLIGHT | owner_or_superuser=true | update=true | delete=true | PASS';
END $owner_recheck$;
-- NEG-03-OWNER-TRIGGER: explicit observed SQLSTATE via GET STACKED DIAGNOSTICS and NOTICE output.
DO $tv1$
DECLARE actual text; cname text;
BEGIN
  BEGIN
    UPDATE public.r3_runs SET execution_outcome='FAIL' WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-03-OWNER-TRIGGER/UPDATE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-03-OWNER-TRIGGER/UPDATE | expected=55000 | actual=% | constraint=% | PASS', actual, cname;
  END;
  BEGIN
    DELETE FROM public.r3_runs WHERE run_id='ocdb_tv1_20261019_eligible';
    RAISE EXCEPTION 'NEG-03-OWNER-TRIGGER/DELETE: unexpected SQL success';
  EXCEPTION WHEN SQLSTATE '55000' THEN
    GET STACKED DIAGNOSTICS actual = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME;
    RAISE NOTICE 'NEG-03-OWNER-TRIGGER/DELETE | expected=55000 | actual=% | constraint=% | PASS', actual, cname;
  END;
END $tv1$;
DO $final_in_tx$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.r3_runs WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
 IF n <> 4 THEN RAISE EXCEPTION 'FINAL-IN-TX expected exactly 4 fixtures, observed %',n; END IF;
 RAISE NOTICE 'FINAL-IN-TX | fixtures=4 | PASS';
END $final_in_tx$;
SELECT 'FINAL-IN-TX' AS case_id,count(*) AS fixture_count FROM public.r3_runs
 WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
-- Evidence capture MUST retain raw NOTICE, SELECT rows, role, SQLSTATE and exit.
-- This normal-path ROLLBACK is mandatory and must NOT be replaced with COMMIT.
ROLLBACK;
-- POST-ROLLBACK EXECUTABLE ASSERTIONS: same dedicated session required.
-- If any earlier statement fails, the trusted executor MUST ROLLBACK and CLOSE
-- in finally, then perform a fresh read-only post-failure verification.
DO $post_rollback$
<<postcheck>>
DECLARE fixture_count integer; objects_n integer; baseline_fp text;
BEGIN
 SELECT count(*) INTO fixture_count FROM public.r3_runs
  WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
 IF fixture_count <> 0 THEN
   RAISE EXCEPTION 'POST-ROLLBACK fixture_count expected 0, observed %', fixture_count;
 END IF;
 SELECT i.objects_n,i.fingerprint INTO objects_n,baseline_fp FROM pg_temp.tv1_team_inventory i;
 IF NOT EXISTS (SELECT 1 FROM pg_temp.tv1_expected_baseline b
                WHERE b.objects_n=postcheck.objects_n AND b.fingerprint=postcheck.baseline_fp) THEN
   RAISE EXCEPTION 'POST-ROLLBACK measured catalog differs from retained baseline';
 END IF;
 RAISE NOTICE 'POST-ROLLBACK | fixture_count=0 | baseline_objects=% | baseline_fingerprint=% | PASS', objects_n, baseline_fp;
END $post_rollback$;
SELECT 'POST-ROLLBACK' AS case_id,count(*) AS fixture_count
 FROM public.r3_runs WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_';
-- STOP: no COMMIT. The externally reviewed executor must close this session.
-- Scope limit: measured public non-R3 metadata; runner separately compares seeded local rows.
-- Independent controls still required for uploader retries and R6 stored-byte hashes.
