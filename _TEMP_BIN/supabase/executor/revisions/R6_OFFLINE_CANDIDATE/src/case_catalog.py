"""P59 35-case executable diagnostic specification. No deployment operation.

The SQL is hardcoded and checked byte-for-byte; no case SQL is accepted from
release/plan JSON. Parameters are bound, and every attempted INSERT uses one
of the ten explicitly allowlisted synthetic IDs (4 retained fixtures + 6
unique negative-case IDs); rejected rows are never intentionally persisted.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import hashlib
import json
import re

PREFIX = 'ocdb_tv1_20261019_'
IDS = tuple(PREFIX+x for x in ('eligible','trial','excluded','pending'))
NEG05_NAMES = ('BAD-SCHEMA','BAD-ELIGIBILITY','TRIAL-ELIGIBLE','MISSING-IDS','SELF-SUPERSEDES','TRIAL-PENDING')
NEG05_IDS = tuple(PREFIX+x for x in ('bad_schema','bad_eligibility','nonresearch_eligible','missing_ids','self_supersedes','trial_pending'))
assert len(NEG05_IDS)==len(NEG05_NAMES)==6 and len(set(IDS+NEG05_IDS))==10
WRITE_IDS = frozenset(IDS+NEG05_IDS)
SOURCE_P59_EXPECTED = (
 'PREFLIGHT/OWNER','PREFLIGHT/ROLES','PREFLIGHT/TRIGGER','PREFLIGHT/BASELINE',
 'CAT/RLS','CAT/SECURITY-INVOKER','POS-INSERT',
 *('NEG-01/'+x for x in ('SELECT','INSERT','UPDATE','DELETE','ELIGIBLE-VIEW','READBACK-VIEW')),
 *('NEG-02/'+x for x in ('SELECT','INSERT','UPDATE','DELETE','ELIGIBLE-VIEW','READBACK-VIEW')),
 'NEG-03-SERVICE/UPDATE','NEG-03-SERVICE/DELETE',
 'POS-RETRY','NEG-04/HASH-CONFLICT',
 *('NEG-05/'+x for x in ('BAD-SCHEMA','BAD-ELIGIBILITY','TRIAL-ELIGIBLE','MISSING-IDS','SELF-SUPERSEDES','TRIAL-PENDING')),
 'NEG-06','NEG-03-OWNER-PREFLIGHT',
 'NEG-03-OWNER-TRIGGER/UPDATE','NEG-03-OWNER-TRIGGER/DELETE',
 'FINAL-IN-TX','POST-ROLLBACK'
)
assert len(SOURCE_P59_EXPECTED)==35

@dataclass(frozen=True)
class Case:
    id: str
    role: str
    sql: str
    params: tuple[Any,...]=()
    kind: str='scalar'  # scalar, one_id, error, insert4, retry
    expected: Any=True
    sqlstate: str | None=None
    constraint: str | None=None
    after_rollback: bool=False

CASES=[]
def add(id, role, sql, params=(), kind='scalar', expected=True, sqlstate=None, constraint=None, after_rollback=False):
    CASES.append(Case(id,role,sql,tuple(params),kind,expected,sqlstate,constraint,after_rollback))

# Preflight role and trigger assertions are immutable scalar predicates.
add('PREFLIGHT/OWNER','owner',"SELECT ((current_user=pg_catalog.pg_get_userbyid(c.relowner) OR (SELECT COALESCE(rolsuper,false) FROM pg_catalog.pg_roles WHERE rolname=current_user)) AND pg_catalog.has_table_privilege(current_user,'public.r3_runs','UPDATE') AND pg_catalog.has_table_privilege(current_user,'public.r3_runs','DELETE')) AS ok FROM pg_catalog.pg_class c WHERE c.oid='public.r3_runs'::regclass")
add('PREFLIGHT/ROLES','owner',"SELECT pg_catalog.pg_has_role(session_user,'anon','SET') AND pg_catalog.pg_has_role(session_user,'authenticated','SET') AND pg_catalog.pg_has_role(session_user,'service_role','SET') AS ok")
add('PREFLIGHT/TRIGGER','owner',"SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.r3_runs'::regclass AND tgname='r3_runs_append_only' AND tgenabled IN ('O','A')) AS ok")
# Before testing compare independently collected baseline snapshot; catalog case is an additional fixed SQL assertion.
add('PREFLIGHT/BASELINE','owner',"SELECT count(*)::integer AS objects_n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S') AND left(c.relname,3)<>'r3_'",kind='baseline_count',expected=None)
add('CAT/RLS','owner',"SELECT COALESCE((SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid='public.r3_runs'::regclass),false) AS ok")
add('CAT/SECURITY-INVOKER','owner',"SELECT count(*)=2 AS ok FROM pg_catalog.pg_class WHERE oid IN ('public.r3_research_eligible'::regclass,'public.r3_evidence_readback'::regclass) AND 'security_invoker=true'=ANY(reloptions)")

# Fixture values use exactly four caller-independent immutable run IDs.
# Only safe synthetic placeholders; dummy digest strings deliberately NOT valid payload bytes.
INSERT_COLS='run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,payload_sha256,manifest,report,source_pointers,availability'
# All synthetic data is explicit, in one transaction; never use live or trial source records.
INS="INSERT INTO public.r3_runs ("+INSERT_COLS+") VALUES ("
PLACE="%s,'app','cmp','web','A',%s,%s,'PASS','CLEAN',%s,NULL,repeat('a',64),repeat('b',64),repeat('c',64),jsonb_build_object('run_id',%s::text),jsonb_build_object('run',jsonb_build_object('id',%s::text)),'{}'::jsonb,'{}'::jsonb"
FOUR="INSERT INTO public.r3_runs ("+INSERT_COLS+") VALUES "+", ".join('('+PLACE+')' for _ in IDS)+" RETURNING run_id"
FOUR_PARAMS=[]
for rid,kind,elig in zip(IDS,('RESEARCH','TRIAL','RESEARCH','PENDING_VALIDATION'),('ELIGIBLE','EXCLUDED','EXCLUDED','PENDING_VALIDATION')):
    FOUR_PARAMS.extend((rid,'1.0',kind,elig,rid,rid))
add('POS-INSERT','service_role',FOUR,FOUR_PARAMS,'insert4',list(IDS))

for group,role in [('NEG-01','anon'),('NEG-02','authenticated')]:
    add(group+'/SELECT',role,'SELECT run_id FROM public.r3_runs WHERE run_id=%s',(IDS[0],),'error',None,'42501')
    add(group+'/INSERT',role,INS+PLACE+')',(IDS[0],'1.0','RESEARCH','ELIGIBLE',IDS[0],IDS[0]),'error',None,'42501')
    add(group+'/UPDATE',role,'UPDATE public.r3_runs SET execution_outcome=%s WHERE run_id=%s',('FAIL',IDS[0]),'error',None,'42501')
    add(group+'/DELETE',role,'DELETE FROM public.r3_runs WHERE run_id=%s',(IDS[0],),'error',None,'42501')
    add(group+'/ELIGIBLE-VIEW',role,'SELECT run_id FROM public.r3_research_eligible WHERE run_id=%s',(IDS[0],),'error',None,'42501')
    add(group+'/READBACK-VIEW',role,'SELECT run_id FROM public.r3_evidence_readback WHERE run_id=%s',(IDS[0],),'error',None,'42501')
for action,sql,params in [('UPDATE','UPDATE public.r3_runs SET execution_outcome=%s WHERE run_id=%s',('FAIL',IDS[0])),('DELETE','DELETE FROM public.r3_runs WHERE run_id=%s',(IDS[0],))]:
    add('NEG-03-SERVICE/'+action,'service_role',sql,params,'error',None,'42501')

# One atomic UPSERT-like conflict-donothing statement then independent row and unchanged stored-digest check.
RETRY=INS+PLACE+') ON CONFLICT (run_id) DO NOTHING RETURNING run_id'
add('POS-RETRY','service_role',RETRY,(IDS[0],'1.0','RESEARCH','ELIGIBLE',IDS[0],IDS[0]),'retry',0)
add('NEG-04/HASH-CONFLICT','service_role',
    "INSERT INTO public.r3_runs ("+INSERT_COLS+") SELECT run_id,app_id,comparison_id,platform,stage,schema_version,experiment_kind,execution_outcome,integrity_verdict,aggregate_eligibility,supersedes_report,manifest_sha256,report_sha256,repeat('9',64),manifest,report,source_pointers,availability FROM public.r3_runs WHERE run_id=%s",(IDS[0],),'error',None,'23505','r3_runs_pkey')

# NEG-05: six distinct, NOT YET PRESENT synthetic run_ids. No PK collision is
# possible if the reserved-prefix preflight passes. Every candidate has a
# manifest and report run_id matching its new ID; each breaks ONE CHECK only.
# Legacy P59 label TRIAL-ELIGIBLE is preserved for exact 35-case coverage, but
# its isolated eligible_research_ids_ck control uses PENDING_VALIDATION/ELIGIBLE.
# Literal TRIAL/ELIGIBLE necessarily violates TWO checks and is prohibited.
BAD_CASES=(
 ('BAD-SCHEMA', "'2.0'", 'experiment_kind','aggregate_eligibility','app_id','supersedes_report','r3_runs_schema_version_ck'),
 ('BAD-ELIGIBILITY','schema_version','experiment_kind',"'UNKNOWN'",'app_id','supersedes_report','r3_runs_aggregate_eligibility_ck'),
 ('TRIAL-ELIGIBLE','schema_version',"'PENDING_VALIDATION'",'aggregate_eligibility','app_id','supersedes_report','r3_runs_eligible_research_ids_ck'),
 ('MISSING-IDS','schema_version','experiment_kind','aggregate_eligibility','NULL::text','supersedes_report','r3_runs_eligible_research_ids_ck'),
 ('SELF-SUPERSEDES','schema_version','experiment_kind','aggregate_eligibility','app_id','new_id','r3_runs_supersedes_ck'),
 ('TRIAL-PENDING','schema_version',"'TRIAL'","'PENDING_VALIDATION'",'app_id','supersedes_report','r3_runs_trial_excluded_ck'),
)
for (name,version,kind,elig,app_expr,supersedes_expr,cons),new_id in zip(BAD_CASES,NEG05_IDS):
    # SELECT from an existing valid research fixture, overriding only the single
    # intentional violation. SQL uses a single VALUES parameter for the NEW ID
    # and SQL JSONB setters keep both mandatory nested identifiers consistent.
    columns=['new_id',app_expr,'comparison_id','platform','stage',version,kind,
             'execution_outcome','integrity_verdict',elig,supersedes_expr,
             'manifest_sha256','report_sha256','payload_sha256',
             "jsonb_set(manifest,'{run_id}',to_jsonb(new_id),true)",
             "jsonb_set(report,'{run,id}',to_jsonb(new_id),true)",
             'source_pointers','availability']
    sql=("INSERT INTO public.r3_runs ("+INSERT_COLS+") "
         "SELECT "+','.join(columns)+" FROM (SELECT %s::text AS new_id, src.* "
         "FROM public.r3_runs AS src WHERE src.run_id=%s) AS source")
    add('NEG-05/'+name,'service_role',sql,(new_id,IDS[0]),'error',None,'23514',cons)

add('NEG-06','service_role',"SELECT run_id FROM public.r3_research_eligible WHERE run_id=ANY(%s::text[]) ORDER BY run_id",(list(IDS),),'one_id',IDS[0])
add('NEG-03-OWNER-PREFLIGHT','owner',CASES[0].sql)
for action,sql,params in [('UPDATE','UPDATE public.r3_runs SET execution_outcome=%s WHERE run_id=%s',('FAIL',IDS[0])),('DELETE','DELETE FROM public.r3_runs WHERE run_id=%s',(IDS[0],))]:
    add('NEG-03-OWNER-TRIGGER/'+action,'owner',sql,params,'error',None,'55000')
add('FINAL-IN-TX','owner','SELECT count(*)::integer FROM public.r3_runs WHERE run_id=ANY(%s::text[])',(list(IDS),),'scalar',4)
add('POST-ROLLBACK','owner','SELECT count(*)::integer FROM public.r3_runs WHERE run_id=ANY(%s::text[])',(list(IDS),),'scalar',0,after_rollback=True)

assert tuple(c.id for c in CASES)==SOURCE_P59_EXPECTED,(len(CASES),[(i,x.id,y) for i,(x,y) in enumerate(zip(CASES,SOURCE_P59_EXPECTED)) if x.id!=y])
assert len(CASES)==35

# An exact SQL permit-list, compiled into code. Unknown statement cannot be added
# by modifying caller JSON. Never evaluate SQL pulled from release artifacts.
SQL_ALLOWLIST=frozenset(hashlib.sha256(c.sql.encode()).hexdigest() for c in CASES)
def _case_blob(c:Case)->str:
    return json.dumps(dict(id=c.id,role=c.role,sql=c.sql,params=c.params,kind=c.kind,expected=c.expected,sqlstate=c.sqlstate,constraint=c.constraint,after_rollback=c.after_rollback),sort_keys=True,separators=(',',':'))
FROZEN_CASE_SPEC=tuple(_case_blob(c) for c in CASES)

def validate_cases(cases:list[Case],P59_notice_ids:tuple[str,...]) -> None:
    if tuple(c.id for c in cases)!=SOURCE_P59_EXPECTED or tuple(c.id for c in cases)!=P59_notice_ids:
        raise ValueError('COVERAGE_MISMATCH')
    if tuple(_case_blob(c) for c in cases)!=FROZEN_CASE_SPEC:
        raise ValueError('CASE_SPEC_REPLACED')
    if any(hashlib.sha256(c.sql.encode()).hexdigest() not in SQL_ALLOWLIST for c in cases):
        raise ValueError('SQL_NOT_ALLOWLISTED')
    for c in cases:
        if c.id.startswith('NEG-05/'):
            idx=NEG05_NAMES.index(c.id.removeprefix('NEG-05/'))
            if c.params!=(NEG05_IDS[idx],IDS[0]):raise ValueError('NEG05_ID_MISMATCH')
        if c.id!='POST-ROLLBACK' and c.after_rollback:raise ValueError('BAD_PHASE')
        if c.sql.lstrip().upper().startswith(('WITH ','DO ','CALL ','EXECUTE ','CREATE ','ALTER ','DROP ','GRANT ','REVOKE ','TRUNCATE ','COPY ','DELETE FROM pg_')):
            raise ValueError('UNSAFE_SQL')
        if ';' in c.sql or '--' in c.sql or '/*' in c.sql or '$$' in c.sql:
            raise ValueError('MULTI_SQL')
        if c.sql.startswith('INSERT INTO') and not c.sql.startswith('INSERT INTO public.r3_runs ('):
            raise ValueError('DML_OUTSIDE_SCOPE')
        if c.sql.startswith(('UPDATE ','DELETE ')) and not (c.sql.startswith('UPDATE public.r3_runs ') or c.sql.startswith('DELETE FROM public.r3_runs ')):
            raise ValueError('DML_OUTSIDE_SCOPE')
        if any(isinstance(p,str) and p.startswith('ocdb_tv1_') and p not in WRITE_IDS for p in c.params):
            raise ValueError('WRITE_ID_NOT_APPROVED')

def catalog_digest()->str:
    return hashlib.sha256(json.dumps([dict(id=c.id,role=c.role,sql=c.sql,params=c.params,kind=c.kind,expected=c.expected,sqlstate=c.sqlstate,constraint=c.constraint,after_rollback=c.after_rollback) for c in CASES],sort_keys=True,separators=(',',':')).encode()).hexdigest()
