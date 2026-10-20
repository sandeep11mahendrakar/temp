-- DB-5 stage 0 offline readback (COUNT outputs + stored envelopes; local/mock only).
-- Recompute payload_sha256 on each returned stored_envelope with tools/r3DbContract.js.
-- rb-research must match; rb-arbitrary deliberately reuses its digest and must fail.
-- Envelope shape: manifest/run_id=rb-research, app=app, comparison=cmp, platform=web,
-- stage=A, experiment_kind=RESEARCH, execution_outcome=PASS, integrity=CLEAN,
-- aggregate_eligibility=ELIGIBLE, supersedes_report=null, cost calls=1 tokens=10
-- screens=1 time=1. Hashes are SHA-256 of exact source JSON strings.

BEGIN;
SET LOCAL ROLE service_role;

INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
VALUES
('rb-research','app','cmp','web','A','1.0','RESEARCH','PASS','CLEAN','ELIGIBLE',NULL,'d03227574d53ffd05df75155d2707393a67bd5bed001f30caca13a36ff8f572f','bb9d533c68349d75f829bab82520cf5b92a7cf6c9fa9143cd69f8efdd202a673','ce291084132594990975080cc6ad2c40909a4bad020144152b6edeff4afa63f6',
 '{"run_id":"rb-research","app_id":"app","comparison_id":"cmp","platform":"web","stage":"A","cost":{"calls":1,"tokens":10,"screens":1,"time":1}}',
 '{"run":{"id":"rb-research"},"app_id":"app","comparison_id":"cmp","platform":"web","stage":"A","experiment_kind":"RESEARCH","execution_outcome":"PASS","integrity_verdict":"CLEAN","aggregate_eligibility":"ELIGIBLE"}',
 '{"run_id":"manifest.run_id","app_id":"report.app_id","comparison_id":"report.comparison_id","platform":"report.platform","stage":"report.stage","experiment_kind":"report.experiment_kind","execution_outcome":"report.execution_outcome","integrity_verdict":"report.integrity_verdict","aggregate_eligibility":"report.aggregate_eligibility","supersedes_report":null,"manifest_sha256":"manifest.json:raw-bytes","report_sha256":"report.json:raw-bytes"}',
 '{"run_id":"RECORDED","app_id":"RECORDED","comparison_id":"RECORDED","platform":"RECORDED","stage":"RECORDED","experiment_kind":"RECORDED","execution_outcome":"RECORDED","integrity_verdict":"RECORDED","aggregate_eligibility":"RECORDED","supersedes_report":"NOT_RECORDED","manifest_sha256":"RECORDED","report_sha256":"RECORDED","manifest.cost.calls":"RECORDED","manifest.cost.tokens":"RECORDED","manifest.cost.screens":"RECORDED","manifest.cost.time":"RECORDED"}'),
('rb-arbitrary','app','cmp','web','A','1.0','RESEARCH','FAIL','CLEAN','ELIGIBLE',NULL,'d03227574d53ffd05df75155d2707393a67bd5bed001f30caca13a36ff8f572f','bb9d533c68349d75f829bab82520cf5b92a7cf6c9fa9143cd69f8efdd202a673','ce291084132594990975080cc6ad2c40909a4bad020144152b6edeff4afa63f6',
 '{"run_id":"rb-arbitrary","app_id":"app","comparison_id":"cmp","platform":"web","stage":"A","cost":{"calls":1,"tokens":10,"screens":1,"time":1}}',
 '{"run":{"id":"rb-arbitrary"},"app_id":"app","comparison_id":"cmp","platform":"web","stage":"A","experiment_kind":"RESEARCH","execution_outcome":"FAIL","integrity_verdict":"CLEAN","aggregate_eligibility":"ELIGIBLE"}',
 '{"run_id":"manifest.run_id","app_id":"report.app_id","comparison_id":"report.comparison_id","platform":"report.platform","stage":"report.stage","experiment_kind":"report.experiment_kind","execution_outcome":"report.execution_outcome","integrity_verdict":"report.integrity_verdict","aggregate_eligibility":"report.aggregate_eligibility","supersedes_report":null,"manifest_sha256":"manifest.json:raw-bytes","report_sha256":"report.json:raw-bytes"}',
 '{"run_id":"RECORDED","app_id":"RECORDED","comparison_id":"RECORDED","platform":"RECORDED","stage":"RECORDED","experiment_kind":"RECORDED","execution_outcome":"RECORDED","integrity_verdict":"RECORDED","aggregate_eligibility":"RECORDED","supersedes_report":"NOT_RECORDED","manifest_sha256":"RECORDED","report_sha256":"RECORDED","manifest.cost.calls":"RECORDED","manifest.cost.tokens":"RECORDED","manifest.cost.screens":"RECORDED","manifest.cost.time":"RECORDED"}'),
('rb-trial',NULL,NULL,'web','trial','1.0','TRIAL','BLOCKED','CLEAN','EXCLUDED',NULL,repeat('d',64),repeat('e',64),repeat('f',64),'{"run_id":"rb-trial"}','{"run":{"id":"rb-trial"}}','{}','{}');

SELECT count(*) AS research_eligible_count FROM public.r3_research_eligible WHERE run_id IN ('rb-research','rb-arbitrary','rb-trial');
SELECT count(*) AS readback_count FROM public.r3_evidence_readback WHERE run_id IN ('rb-research','rb-arbitrary','rb-trial');

-- Return actual persisted values. Client recomputation must accept rb-research and reject rb-arbitrary.
SELECT run_id, payload_sha256, to_jsonb(r) AS stored_envelope
FROM public.r3_evidence_readback AS r
WHERE run_id IN ('rb-research','rb-arbitrary')
ORDER BY run_id;

-- Duplicate retry must leave exactly one row.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.r3_runs (run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability)
    VALUES ('rb-research','app','cmp','web','A','1.0','RESEARCH','PASS','CLEAN','ELIGIBLE',NULL,'d03227574d53ffd05df75155d2707393a67bd5bed001f30caca13a36ff8f572f','bb9d533c68349d75f829bab82520cf5b92a7cf6c9fa9143cd69f8efdd202a673','ce291084132594990975080cc6ad2c40909a4bad020144152b6edeff4afa63f6','{"run_id":"rb-research","app_id":"app","comparison_id":"cmp","platform":"web","stage":"A","cost":{"calls":1,"tokens":10,"screens":1,"time":1}}','{"run":{"id":"rb-research"},"app_id":"app","comparison_id":"cmp","platform":"web","stage":"A","experiment_kind":"RESEARCH","execution_outcome":"PASS","integrity_verdict":"CLEAN","aggregate_eligibility":"ELIGIBLE"}','{"run_id":"manifest.run_id","app_id":"report.app_id","comparison_id":"report.comparison_id","platform":"report.platform","stage":"report.stage","experiment_kind":"report.experiment_kind","execution_outcome":"report.execution_outcome","integrity_verdict":"report.integrity_verdict","aggregate_eligibility":"report.aggregate_eligibility","supersedes_report":null,"manifest_sha256":"manifest.json:raw-bytes","report_sha256":"report.json:raw-bytes"}','{"run_id":"RECORDED","app_id":"RECORDED","comparison_id":"RECORDED","platform":"RECORDED","stage":"RECORDED","experiment_kind":"RECORDED","execution_outcome":"RECORDED","integrity_verdict":"RECORDED","aggregate_eligibility":"RECORDED","supersedes_report":"NOT_RECORDED","manifest_sha256":"RECORDED","report_sha256":"RECORDED","manifest.cost.calls":"RECORDED","manifest.cost.tokens":"RECORDED","manifest.cost.screens":"RECORDED","manifest.cost.time":"RECORDED"}');
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;
SELECT count(*) AS duplicate_retry_row_count FROM public.r3_evidence_readback WHERE run_id='rb-research';

RESET ROLE;
ROLLBACK;
