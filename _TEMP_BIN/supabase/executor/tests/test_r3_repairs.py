"""R3 regressions; spawn-safe and deliberately uses no network or DB driver."""
from __future__ import annotations
import hashlib
import multiprocessing as mp
import os
import sys
import unittest
from dataclasses import dataclass
from unittest.mock import patch

from case_catalog import CASES,IDS,NEG05_IDS,NEG05_NAMES,WRITE_IDS,validate_cases,SOURCE_P59_EXPECTED
from executor_runtime import drive_child,main_worker,DbFailure,run_case
from tests.fake_adapter import FakeSession

# Top-level functions for multiprocessing spawn, including Windows.
def _early_child_close(pipe):
    pipe.close()

def _during_child_close(pipe):
    pipe.send({'type':'CONNECTED'})
    pipe.close()

def _abnormal_child_close(pipe):
    pipe.send({'type':'CONNECTED'})
    pipe.close()
    os._exit(7)

def _complete_but_abnormal(pipe):
    pipe.send({'type':'MAIN_DONE','status':'ROLLBACK_ACK'})
    pipe.close()
    os._exit(7)

class FaultedPipe:
    def __init__(self,base,break_at):self.base=base;self.break_at=break_at;self.n=0
    def poll(self,timeout=0):
        self.n+=1
        if self.n==self.break_at:raise BrokenPipeError(32,'Simulated Windows closed pipe')
        return self.base.poll(timeout)
    def recv(self):return self.base.recv()
    def close(self):return self.base.close()

class FaultedCtx:
    def __init__(self,ctx,at):self.ctx=ctx;self.at=at
    def Pipe(self,duplex=False):
        parent,child=self.ctx.Pipe(duplex=duplex)
        return FaultedPipe(parent,self.at),child
    def Process(self,**kw):return self.ctx.Process(**kw)

class TestR3Repair(unittest.TestCase):
    def test_six_unique_allowlisted_ids(self):
        self.assertEqual(len(IDS),4)
        self.assertEqual(len(NEG05_IDS),6)
        self.assertEqual(len(WRITE_IDS),10)
        self.assertTrue(set(IDS).isdisjoint(NEG05_IDS))
        self.assertEqual(tuple(c.id for c in CASES),SOURCE_P59_EXPECTED)
        validate_cases(CASES,SOURCE_P59_EXPECTED)
        for name,rid in zip(NEG05_NAMES,NEG05_IDS):
            c=next(c for c in CASES if c.id=='NEG-05/'+name)
            self.assertEqual(c.params,(rid,IDS[0]))
            self.assertEqual((c.sqlstate,c.kind),('23514','error'))
            self.assertTrue(c.constraint.startswith('r3_runs_'))
            self.assertIn('jsonb_set(manifest',c.sql)
            self.assertIn('jsonb_set(report',c.sql)
            self.assertIn('WHERE src.run_id=%s',c.sql)
            self.assertIn('INSERT INTO public.r3_runs',c.sql)

    def test_bad_write_id_rejected(self):
        from dataclasses import replace
        c=next(c for c in CASES if c.id=='NEG-05/BAD-SCHEMA')
        mod=[replace(t,params=('ocdb_tv1_20261019_not_allowed',IDS[0])) if t.id==c.id else t for t in CASES]
        with self.assertRaises(ValueError):validate_cases(mod,SOURCE_P59_EXPECTED)

    def test_bad_duplicate_neg05_id_rejected(self):
        from dataclasses import replace
        a=next(c for c in CASES if c.id=='NEG-05/BAD-SCHEMA')
        mod=[replace(c,params=a.params) if c.id=='NEG-05/BAD-ELIGIBILITY' else c for c in CASES]
        with self.assertRaises(ValueError):validate_cases(mod,SOURCE_P59_EXPECTED)

    def test_exact_constraints_independently_modeled(self):
        # A transparent *static* model of the migration's six CHECK predicates,
        # not an assertion about PostgreSQL's runtime or SQLSTATE behavior.
        scenarios={
          'BAD-SCHEMA':dict(schema_version='2.0'),
          'BAD-ELIGIBILITY':dict(eligibility='UNKNOWN'),
          'TRIAL-ELIGIBLE':dict(kind='PENDING_VALIDATION'),
          'MISSING-IDS':dict(app_id=None),
          'SELF-SUPERSEDES':dict(supersedes=True),
          'TRIAL-PENDING':dict(kind='TRIAL',eligibility='PENDING_VALIDATION'),
        }
        constraint_checks={
           'r3_runs_schema_version_ck':lambda d:d['schema_version']=='1.0',
           'r3_runs_aggregate_eligibility_ck':lambda d:d['eligibility'] in ('ELIGIBLE','EXCLUDED','PENDING_VALIDATION'),
           'r3_runs_eligible_research_ids_ck':lambda d:d['eligibility']!='ELIGIBLE' or (d['kind']=='RESEARCH' and bool(d['app_id']) and bool(d['comparison_id'])),
           'r3_runs_trial_excluded_ck':lambda d:d['kind']!='TRIAL' or d['eligibility']=='EXCLUDED',
           'r3_runs_supersedes_ck':lambda d:not d['supersedes'],
        }
        for name,overrides in scenarios.items():
            with self.subTest(name=name):
                row=dict(schema_version='1.0',eligibility='ELIGIBLE',kind='RESEARCH',app_id='app',comparison_id='cmp',supersedes=False)
                row.update(overrides)
                violated={n for n,test in constraint_checks.items() if not test(row)}
                expected=next(c.constraint for c in CASES if c.id=='NEG-05/'+name)
                self.assertEqual(violated,{expected})

    def test_each_six_negative_case_fake_sqlstate_and_constraint(self):
        sess=FakeSession(False,'')
        sess.stage=list(IDS);sess.role='owner'
        for name in NEG05_NAMES:
            c=next(c for c in CASES if c.id=='NEG-05/'+name)
            with self.subTest(name=name):
                case=run_case(sess,c)
                self.assertEqual(case['status'],'PASS')
                self.assertEqual(case['actual'],{'sqlstate':'23514','constraint':c.constraint})
        self.assertEqual(sess.stage,list(IDS))
        sess.execute('ROLLBACK');self.assertEqual(sess.stage,[])
        sess.close();self.assertTrue(sess.closed)

    def test_pipe_closes_before_poll_no_pass(self):
        events,status=drive_child(mp.get_context('spawn'),_early_child_close,(),3,1)
        self.assertEqual(events,[])
        self.assertNotEqual(status,'EXIT_ZERO')

    def test_pipe_closes_during_poll_preserves_result_and_fails(self):
        events,status=drive_child(mp.get_context('spawn'),_during_child_close,(),3,1)
        self.assertEqual([e['type'] for e in events],['CONNECTED'])
        self.assertNotEqual(status,'EXIT_ZERO')

    def test_abnormal_child_with_partial_data_fails(self):
        events,status=drive_child(mp.get_context('spawn'),_abnormal_child_close,(),3,1)
        self.assertEqual(status,'PROCESS_EXIT_FAIL')
        self.assertIn('CONNECTED',[e['type'] for e in events])

    def test_abnormal_exit_even_with_terminal_marker_fails(self):
        _,status=drive_child(mp.get_context('spawn'),_complete_but_abnormal,(),3,1)
        self.assertEqual(status,'PROCESS_EXIT_FAIL')

    def test_simulated_windows_poll_broken_before_receiving(self):
        events,status=drive_child(FaultedCtx(mp.get_context('spawn'),1),_during_child_close,(),3,1)
        self.assertNotEqual(status,'EXIT_ZERO')

    def test_simulated_windows_poll_broken_after_first_event(self):
        events,status=drive_child(FaultedCtx(mp.get_context('spawn'),2),_during_child_close,(),3,1)
        self.assertNotEqual(status,'EXIT_ZERO')
        # queued event may or may not have arrived before injected closure;
        # anything obtained remains preserved without fabricating results.
        self.assertTrue(all(e.get('type')=='CONNECTED' for e in events))

    @unittest.skipUnless(sys.platform=='win32','Windows-native child-pipe regression: requires Windows')
    def test_real_windows_spawn_close_before_and_during_poll(self):
        ctx=mp.get_context('spawn')
        for target in (_early_child_close,_during_child_close,_abnormal_child_close):
            with self.subTest(target=target.__name__):
                _,status=drive_child(ctx,target,(),3,1)
                self.assertNotEqual(status,'EXIT_ZERO')

if __name__=='__main__':unittest.main()

class TestPipeSendDefensive(unittest.TestCase):
    def test_broken_send_does_not_skip_rollback_cleanup(self):
        from executor_runtime import emit
        class BrokenSend:
            def send(self,_):raise BrokenPipeError(32,'closed pipe')
        self.assertFalse(emit(BrokenSend(),'ROLLBACK_ACK',pid=10))

    def test_io_error_send_is_not_pass(self):
        from executor_runtime import emit
        class FailedSend:
            def send(self,_):raise OSError(109,'Windows pipe ended')
        self.assertFalse(emit(FailedSend(),'CLOSE_ACK'))
