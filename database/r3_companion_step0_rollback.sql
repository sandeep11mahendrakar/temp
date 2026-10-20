-- DB-5 stage 0 rollback (reverse order; R3 objects only; no team tables touched).
BEGIN;

DROP VIEW IF EXISTS public.r3_evidence_readback;
DROP VIEW IF EXISTS public.r3_research_eligible;

DROP TRIGGER IF EXISTS r3_runs_append_only ON public.r3_runs;
DROP FUNCTION IF EXISTS public.r3_reject_run_mutation();

DROP POLICY IF EXISTS r3_runs_service_role_insert ON public.r3_runs;
DROP POLICY IF EXISTS r3_runs_service_role_select ON public.r3_runs;

ALTER TABLE IF EXISTS public.r3_runs DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS public.r3_runs_eligibility_kind_idx;
DROP INDEX IF EXISTS public.r3_runs_research_eligible_idx;

DROP TABLE IF EXISTS public.r3_runs;

COMMIT;
