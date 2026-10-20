"""Stateful fake adapter; never imports network packages or Supabase clients."""
from __future__ import annotations
import os,time
from dataclasses import dataclass
from case_catalog import CASES,IDS
from executor_runtime import (QueryResult,DbFailure,BASELINE_SQL,PID_SQL,PID_GONE_SQL,
 FIXTURES_SQL,PREFIX_COUNT_SQL,RETRY_STATE_SQL,READBACK_COUNT_SQL,RLS_ALL_SQL)

@dataclass
class FakeFactory:
    fault:str=''
    IS_OFFLINE_TEST_DOUBLE=True
    def __call__(self,readonly:bool):
        return FakeSession(readonly,self.fault)

class FakeSession:
    def __init__(self,readonly,fault):
        self.readonly=readonly;self.fault=fault;self.role='owner';self.stage=[];self.open=True;self.pid=os.getpid();self.closed=False
    def execute(self,sql,params=()):
        if not self.open:raise RuntimeError('closed')
        params=tuple(params)
        if self.readonly and self.fault=='cleanup' and sql==BASELINE_SQL:time.sleep(25)
        if not self.readonly and self.fault=='execute' and sql==CASES[6].sql:time.sleep(25)
        if sql=='ROLLBACK' and self.fault=='rollback' and not self.readonly:time.sleep(25)
        if sql.startswith('SET LOCAL ROLE '):
            self.role=sql.split(' ')[-1];return QueryResult([])
        if sql=='RESET ROLE':self.role='owner';return QueryResult([])
        if sql in ('BEGIN','BEGIN READ ONLY') or sql.startswith('SET LOCAL ') or sql.startswith('SAVEPOINT ') or sql.startswith('ROLLBACK TO SAVEPOINT ') or sql.startswith('RELEASE SAVEPOINT '):return QueryResult([])
        if sql=='ROLLBACK':self.stage=[];return QueryResult([])
        if sql==PID_SQL:return QueryResult([(self.pid,)])
        if sql==PID_GONE_SQL:
            try:os.kill(params[0],0);up=True
            except (ProcessLookupError,PermissionError):up=False
            return QueryResult([(int(up),)])
        if sql==BASELINE_SQL:return QueryResult([],0)
        if sql==FIXTURES_SQL:return QueryResult([(len(set(self.stage).intersection(set(params[0]))),)])
        if sql==PREFIX_COUNT_SQL:return QueryResult([(len(self.stage),)])
        if sql==RETRY_STATE_SQL:
            count=int(params[0] in self.stage)
            return QueryResult([(count, 'c'*64 if count else None)])
        if sql==READBACK_COUNT_SQL:return QueryResult([(len(set(self.stage).intersection(set(params[0]))),)])
        if sql==RLS_ALL_SQL:return QueryResult([(True,)])
        if sql in (CASES[0].sql,CASES[1].sql,CASES[2].sql,CASES[4].sql,CASES[5].sql):return QueryResult([(True,)])
        if sql==CASES[3].sql:return QueryResult([(0,)])
        if sql==CASES[6].sql:
            if self.role!='service_role':raise RuntimeError('fixture role wrong')
            self.stage=list(IDS)
            return QueryResult([(x,) for x in IDS],4)
        if sql==CASES[21].sql:return QueryResult([],0) # retry
        if sql==CASES[29].sql:return QueryResult([(IDS[0],)]) # eligible
        if sql==CASES[33].sql:return QueryResult([(4,)]) # final
        case=next((c for c in CASES if c.sql==sql and c.params==params and c.role==self.role and c.kind=='error'),None)
        if case:
            if self.fault=='wrong_state' and case.id=='NEG-01/SELECT':raise DbFailure('00001',None)
            if self.fault=='unexpected_success' and case.id=='NEG-01/SELECT':return QueryResult([],0)
            return (_ for _ in ()).throw(DbFailure(case.sqlstate,case.constraint))
        raise RuntimeError('FAKE_UNMAPPED_SQL')
    def close(self):
        if self.fault=='close' and not self.readonly:time.sleep(25)
        self.open=False;self.closed=True
