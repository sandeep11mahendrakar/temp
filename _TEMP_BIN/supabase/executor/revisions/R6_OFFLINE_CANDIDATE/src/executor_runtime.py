"""Disarmed, adapter-ready P59 hosted diagnostic controller — OFFLINE REVIEW ONLY.

No transport is selected or connected by this module. After independent AUD
approval, a separately approved session adapter may implement the DbSession
contract and be installed in an independently frozen executable build.

The approved Supabase migration tool's previous safety block MUST be cleared
by the platform's normal approval/access route. A signed release is NOT that
clearance by itself; never use a different transport to evade it.

All tests use a simulated adapter, not Postgres or Supabase.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import multiprocessing as mp
import queue
import time
from pathlib import Path
from typing import Any,Callable
from case_catalog import CASES, IDS, NEG05_IDS, WRITE_IDS, SOURCE_P59_EXPECTED,validate_cases

# IMPORTANT: Keep watchdog bounds frozen, not caller-selected from release JSON.
CONNECT_IDLE_LIMIT=3.0  # review/test values; production must be independently reviewed
CASE_IDLE_LIMIT=3.0
FINALIZE_IDLE_LIMIT=3.0
CLEANUP_LIMIT=4.0
KILL_GRACE=0.5

# SQL allowlist does not include user SQL. Catalog is snapshotted as hashed data;
# no raw table/view contents are retained. R3 fixture values are synthetic.
BASELINE_SQL="""SELECT c.relname,c.relkind::text,c.relrowsecurity,COALESCE(c.relacl::text,''),
 CASE WHEN c.relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(c.oid,true) ELSE '' END,
 COALESCE((SELECT string_agg(pg_catalog.pg_get_constraintdef(k.oid),',' ORDER BY k.conname) FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid),''),
 COALESCE((SELECT string_agg(pg_catalog.pg_get_indexdef(i.indexrelid),',' ORDER BY i.indexrelid) FROM pg_catalog.pg_index i WHERE i.indrelid=c.oid),''),
 COALESCE((SELECT string_agg(pg_catalog.pg_get_triggerdef(t.oid),',' ORDER BY t.tgname) FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),''),
 COALESCE((SELECT string_agg(a.attname||':'||a.atttypid::text||':'||a.attnotnull::text,',' ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'')
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname='public' AND left(c.relname,3)<>'r3_' AND c.relkind IN ('r','p','v','m','f','S') ORDER BY c.relname"""
FIXTURES_SQL='SELECT count(*)::integer FROM public.r3_runs WHERE run_id=ANY(%s::text[])'
PREFIX_COUNT_SQL="SELECT count(*)::integer FROM public.r3_runs WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_'"
RETRY_STATE_SQL='SELECT count(*)::integer,min(payload_sha256) FROM public.r3_runs WHERE run_id=%s'
READBACK_COUNT_SQL='SELECT count(*)::integer FROM public.r3_evidence_readback WHERE run_id=ANY(%s::text[])'
PID_SQL='SELECT pg_catalog.pg_backend_pid()::integer'
PID_GONE_SQL='SELECT count(*)::integer FROM pg_catalog.pg_stat_activity WHERE pid=%s'
RLS_ALL_SQL="SELECT count(*)=1 FROM pg_catalog.pg_class WHERE relname='r3_runs' AND relnamespace='public'::regnamespace AND relrowsecurity"

@dataclass
class QueryResult:
    rows: list[tuple]
    rowcount: int=0

class DbFailure(Exception):
    def __init__(self,sqlstate:str|None=None,constraint:str|None=None):
        self.sqlstate=sqlstate
        self.constraint=constraint
        super().__init__('REDACTED_DATABASE_ERROR')

# DbSession adapter interface:
# .execute(sql:str, params:tuple=()) -> QueryResult
# .close() -> None (must await full socket/session closure before returning)
# factory(readonly:bool) -> DbSession; must create NEW independent connection.
# This interface must be separately implemented, reviewed, pinned and authorized.

def raw(result:QueryResult)->tuple:
    if not isinstance(result,QueryResult):raise RuntimeError('INVALID_ADAPTER_RESULT')
    if len(result.rows)!=1 or not isinstance(result.rows[0],(tuple,list)):
        raise RuntimeError('EXPECTED_ONE_ROW')
    return tuple(result.rows[0])

def one(session,sql,params=()):return raw(session.execute(sql,params))

def fingerprint(session)->tuple[str,int]:
    rows=session.execute(BASELINE_SQL).rows
    if not isinstance(rows,list):raise RuntimeError('BAD_CATALOG')
    # Hash definitions in memory, do not persist raw definitions or sensitive data.
    blob=json.dumps(rows,default=str,sort_keys=True,separators=(',',':')).encode()
    return hashlib.sha256(blob).hexdigest(),len(rows)

def emit(pipe, event:str, **kw):
    # Messages are best effort: if the observer has closed its pipe, transaction
    # rollback/close MUST continue. Missing ACKs cause the parent to FAIL closed.
    try:
        pipe.send({'type':event,**kw})
        return True
    except (BrokenPipeError, EOFError, OSError):
        return False

def _safe_scalar(v):
    return v if type(v) in (bool,int) else None

def run_case(session,case,before_digest=None,baseline_n=None):
    # Single physical session; role switching inside existing transaction only.
    if case.role!='owner':session.execute('SET LOCAL ROLE '+case.role)
    session.execute('SAVEPOINT ocdb_case')
    got=None
    status='PASS'
    try:
        try:
            result=session.execute(case.sql,case.params)
            if case.kind=='error':
                got={'sqlstate':'00000','constraint':None,'rowcount':int(result.rowcount)}
                status='FAIL'
            elif case.kind in ('scalar','baseline_count'):
                value=raw(result)[0]
                expected=baseline_n if case.kind=='baseline_count' else case.expected
                if value!=expected:raise RuntimeError('SCALAR_MISMATCH')
                got={'value':_safe_scalar(value)}
            elif case.kind=='one_id':
                gotids=tuple(r[0] for r in result.rows)
                if gotids!=(case.expected,):raise RuntimeError('ELIGIBLE_MEMBERSHIP_MISMATCH')
                n=one(session,READBACK_COUNT_SQL,(list(IDS),))[0]
                if n!=4:raise RuntimeError('READBACK_COUNT_MISMATCH')
                got={'eligible_ids':list(gotids),'readback_count':n}
            elif case.kind=='insert4':
                actual={r[0] for r in result.rows}
                if actual!=set(IDS) or len(result.rows)!=4:raise RuntimeError('FIXTURE_IDS_MISMATCH')
                got={'inserted_ids_count':4}
            elif case.kind=='retry':
                if len(result.rows)!=0:raise RuntimeError('RETRY_INSERTED_ROW')
                n,after=one(session,RETRY_STATE_SQL,(IDS[0],))
                if n!=1 or after!=before_digest:raise RuntimeError('RETRY_DIGEST_CHANGED')
                got={'inserted_count':0,'row_count':1,'digest_unchanged':True}
            else:raise RuntimeError('UNKNOWN_CASE_KIND')
        except DbFailure as e:
            if case.kind!='error':raise
            got={'sqlstate':e.sqlstate,'constraint':e.constraint}
            if e.sqlstate!=case.sqlstate or (case.constraint is not None and e.constraint!=case.constraint):
                status='FAIL'
            session.execute('ROLLBACK TO SAVEPOINT ocdb_case')
        session.execute('RELEASE SAVEPOINT ocdb_case')
        return {'case_id':case.id,'role':case.role,'expected_sqlstate':case.sqlstate,'expected_constraint':case.constraint,'actual':got,'status':status}
    finally:
        if case.role!='owner':
            # RESET LOCAL ROLE is part of transaction; original failure propagates
            session.execute('RESET ROLE')

def main_worker(pipe, adapter_factory:Callable,baseline_approved_hash:str, P59_ids:tuple[str,...]):
    session=None;began=False;pid=None;status='FAIL'; phase='CONNECT';n=0
    try:
        validate_cases(CASES,P59_ids)
        session=adapter_factory(False)
        emit(pipe,'CONNECTED')
        phase='BEGIN';session.execute('BEGIN');began=True
        emit(pipe,'TRANSACTION_BEGAN')
        phase='TIMEOUTS';session.execute("SET LOCAL statement_timeout='2500ms'");session.execute("SET LOCAL lock_timeout='2000ms'");session.execute("SET LOCAL idle_in_transaction_session_timeout='3000ms'")
        pid=one(session,PID_SQL)[0]
        if type(pid)!=int or pid<=0:raise RuntimeError('INVALID_BACKEND_PID')
        emit(pipe,'PID',pid=pid)
        phase='BASELINE'; baseline_hash,baseline_n=fingerprint(session)
        if baseline_hash!=baseline_approved_hash:raise RuntimeError('BASELINE_MISMATCH')
        emit(pipe,'BASELINE_OK',baseline_sha256=baseline_hash,object_count=baseline_n)
        phase='FIXTURE_COLLISION';check=one(session,PREFIX_COUNT_SQL)[0]
        if check!=0:raise RuntimeError('FIXTURE_COLLISION')
        emit(pipe,'FIXTURE_COLLISION_CLEAR')
        before_digest=None
        for c in CASES:
            if c.after_rollback:continue
            phase='CASE:'+c.id
            if c.id=='POS-RETRY':
                nrow,before_digest=one(session,RETRY_STATE_SQL,(IDS[0],))
                if nrow!=1:raise RuntimeError('RETRY_PRECONDITION')
            res=run_case(session,c,before_digest,baseline_n)
            n+=1
            emit(pipe,'CASE',**res)
            if res['status']!='PASS':raise RuntimeError('CASE_RESULT_MISMATCH')
        if n!=34:raise RuntimeError('WRONG_CASE_COUNT')
        phase='FINAL_ROLLBACK';session.execute('ROLLBACK');began=False
        emit(pipe,'ROLLBACK_ACK',pid=pid)
        status='ROLLBACK_ACK'
    except BaseException as exc:
        emit(pipe,'ERROR',phase=phase,error_class=type(exc).__name__)
    finally:
        if session is not None:
            if began:
                try:
                    phase='FAILURE_ROLLBACK';session.execute('ROLLBACK');began=False
                    emit(pipe,'ROLLBACK_ACK',pid=pid)
                except BaseException as exc:emit(pipe,'ROLLBACK_FAIL',error_class=type(exc).__name__)
            try:
                phase='CLOSE';session.close();emit(pipe,'CLOSE_ACK',pid=pid)
            except BaseException as exc:emit(pipe,'CLOSE_FAIL',error_class=type(exc).__name__)
        emit(pipe,'MAIN_DONE',status=status)
        pipe.close()

def cleanup_worker(pipe,adapter_factory:Callable,pid:int|None,baseline_approved_hash:str):
    session=None;began=False
    try:
        session=adapter_factory(True)
        emit(pipe,'FRESH_CONNECTED')
        session.execute('BEGIN READ ONLY');began=True
        session.execute("SET LOCAL statement_timeout='2500ms'")
        after,n=fingerprint(session)
        rows=one(session,PREFIX_COUNT_SQL)[0]
        oldpid=one(session,PID_GONE_SQL,(pid,))[0] if type(pid)==int else None
        cat=one(session,RLS_ALL_SQL)[0]
        if rows!=0 or after!=baseline_approved_hash or oldpid!=0 or cat is not True:
            raise RuntimeError('FRESH_CHECK_MISMATCH')
        emit(pipe,'FRESH_ASSERTIONS',fixtures_remaining=rows,baseline_preserved=True,old_backend_absent=True,rls_enabled=True,baseline_count=n)
        emit(pipe,'CASE',case_id='POST-ROLLBACK',role='owner',expected_sqlstate=None,expected_constraint=None,actual={'fixture_count':0,'baseline_preserved':True},status='PASS')
        session.execute('ROLLBACK');began=False
        emit(pipe,'FRESH_ROLLBACK_ACK')
    except BaseException as exc:
        emit(pipe,'FRESH_ERROR',error_class=type(exc).__name__)
    finally:
        if session is not None:
            if began:
                try:session.execute('ROLLBACK');emit(pipe,'FRESH_ROLLBACK_ACK')
                except BaseException as exc:emit(pipe,'FRESH_ROLLBACK_FAIL',error_class=type(exc).__name__)
            try:session.close();emit(pipe,'FRESH_CLOSE_ACK')
            except BaseException as exc:emit(pipe,'FRESH_CLOSE_FAIL',error_class=type(exc).__name__)
        emit(pipe,'CLEANUP_DONE')
        pipe.close()

def _stop_child(p):
    if p.is_alive():
        p.terminate();p.join(KILL_GRACE)
        if p.is_alive():p.kill();p.join(KILL_GRACE)

def drive_child(ctx,entry,args,total_limit:float,idle_limit:float)->tuple[list[dict],str]:
    """Bounded IPC; Windows closed pipes may raise BrokenPipeError from poll.

    Preserve already received results; never interpret missing terminal ACKs
    or a nonzero child exit as success, including a pipe-close race.
    """
    parent,child=ctx.Pipe(duplex=False)
    p=None
    events=[];start=time.monotonic();last=start;outcome='EXIT_UNKNOWN'
    started=False;closed_pipe=False
    terminal='MAIN_DONE' if entry is main_worker else 'CLEANUP_DONE'
    try:
        p=ctx.Process(target=entry,args=(child,*args),daemon=False)
        try:
            p.start();started=True
        finally:
            # The child owns its endpoint after spawn; parent never retains it.
            child.close()
        while True:
            now=time.monotonic()
            if now-start>total_limit or now-last>idle_limit:
                outcome='WATCHDOG_TIMEOUT';break
            try:
                ready=parent.poll(0.05)
            except (EOFError,BrokenPipeError,OSError):
                closed_pipe=True;break
            if ready:
                try:
                    event=parent.recv()
                except (EOFError,BrokenPipeError,OSError):
                    closed_pipe=True;break
                if not isinstance(event,dict) or not isinstance(event.get('type'),str):
                    outcome='MALFORMED_EVENT';break
                events.append(event);last=time.monotonic()
            elif not p.is_alive():
                # Drain all available queued events even if the child closed
                # between the readiness probe and the recv; one broken pipe
                # must not discard successfully received results.
                while True:
                    try:
                        ready=parent.poll(0)
                    except (EOFError,BrokenPipeError,OSError):
                        closed_pipe=True;break
                    if not ready:break
                    try:event=parent.recv()
                    except (EOFError,BrokenPipeError,OSError):
                        closed_pipe=True;break
                    if not isinstance(event,dict) or not isinstance(event.get('type'),str):
                        outcome='MALFORMED_EVENT';break
                    events.append(event)
                break
        if outcome=='EXIT_UNKNOWN':
            p.join(KILL_GRACE)  # allow graceful exit; no unbounded wait
        if started:_stop_child(p)
        if outcome=='EXIT_UNKNOWN':
            terminal_ok=sum(e.get('type')==terminal for e in events)==1
            if p.exitcode!=0:
                outcome='PROCESS_EXIT_FAIL'
            elif not terminal_ok:
                outcome='PIPE_CLOSED_INCOMPLETE' if closed_pipe else 'MISSING_TERMINAL_EVENT'
            else:
                outcome='EXIT_ZERO'
    finally:
        if started:_stop_child(p)
        try:child.close()
        except (BrokenPipeError,EOFError,OSError):pass
        try:parent.close()
        except (BrokenPipeError,EOFError,OSError):pass
    return events,outcome

def execute_review_only(adapter_factory,approved_baseline_sha:str,P59_ids:tuple[str,...], *,main_max_s=15.0,cleanup_max_s=6.0,ctx=None)->dict:
    """Offline-test entrypoint; deliberately no DSN, Supabase or production CLI.

    A separately authorized, pinned adapter must be installed to make hosted
    execution possible; this function does not approve or discover a route.
    """
    validate_cases(CASES,P59_ids)
    if not isinstance(approved_baseline_sha,str) or len(approved_baseline_sha)!=64 or any(x not in '0123456789abcdef' for x in approved_baseline_sha):raise ValueError('BASELINE_DIGEST_INVALID')
    ctx=ctx or mp.get_context('spawn')
    try:
        main,main_code=drive_child(ctx,main_worker,(adapter_factory,approved_baseline_sha,P59_ids),main_max_s,CASE_IDLE_LIMIT)
    except Exception:
        main,main_code=[], 'DRIVER_EXCEPTION'
    gotpid=next((x.get('pid') for x in main if x.get('type')=='PID'),None)
    # Always launch fresh cleanup, including failed, stalled or SIGKILLed child.
    # When no PID is known, cleanup explicitly fails closed; never claim closure.
    try:
        fresh,fresh_code=drive_child(ctx,cleanup_worker,(adapter_factory,gotpid,approved_baseline_sha),cleanup_max_s,CLEANUP_LIMIT)
    except Exception:
        fresh,fresh_code=[], 'FRESH_DRIVER_EXCEPTION'
    got_ids=[x['case_id'] for x in main if x['type']=='CASE']
    strict_case_ids=list(SOURCE_P59_EXPECTED[:-1])
    successful_main=(main_code=='EXIT_ZERO' and got_ids==strict_case_ids and all(x.get('status')=='PASS' for x in main if x['type']=='CASE') and
                     sum(x['type']=='ROLLBACK_ACK' for x in main)==1 and sum(x['type']=='CLOSE_ACK' for x in main)==1 and
                     not any(x['type'] in ('ERROR','ROLLBACK_FAIL','CLOSE_FAIL') for x in main))
    successful_fresh=(fresh_code=='EXIT_ZERO' and [x['case_id'] for x in fresh if x['type']=='CASE']==['POST-ROLLBACK'] and sum(x['type']=='FRESH_ASSERTIONS' for x in fresh)==1 and sum(x['type']=='FRESH_ROLLBACK_ACK' for x in fresh)==1 and sum(x['type']=='FRESH_CLOSE_ACK' for x in fresh)==1 and not any(x['type'] in ('FRESH_ERROR','FRESH_ROLLBACK_FAIL','FRESH_CLOSE_FAIL') for x in fresh))
    successful_main=successful_main and sum(x.get('type')=='MAIN_DONE' and x.get('status')=='ROLLBACK_ACK' for x in main)==1
    successful_fresh=successful_fresh and sum(x.get('type')=='CLEANUP_DONE' for x in fresh)==1
    state='PASS_OFFLINE_CONTROL_FLOW_ONLY' if successful_main and successful_fresh else 'FAIL'
    # Events contain no SQL or row payloads, only allowlisted boolean/count/ID summaries.
    return {'status':state,'main_watchdog':main_code,'fresh_watchdog':fresh_code,'main_events':main,'fresh_events':fresh,
            'case_count':len(got_ids)+int(successful_fresh),'required_case_count':35,
            'transport_retry_hash_proof':'NOT_COVERED','stored_envelope_digest_proof':'NOT_COVERED',
            'hosted_proof':'NOT_RUN', 'migration_apply':'NOT_ATTEMPTED'}
