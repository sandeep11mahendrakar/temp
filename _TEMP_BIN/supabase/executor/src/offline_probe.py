#!/usr/bin/env python3
"""Synthetic adapter control-flow evidence ONLY; not PostgreSQL or hosted proof."""
from __future__ import annotations
import hashlib,json
from bundle_auth import pin_sources
from executor_runtime import execute_review_only
from tests.fake_adapter import FakeFactory
from pathlib import Path

if __name__=='__main__':
    root=Path(__file__).resolve().parent.parent
    source=pin_sources(root)
    result=execute_review_only(FakeFactory(),hashlib.sha256(b'[]').hexdigest(),tuple(source['source_notice_ids']))
    out={'category':'SIMULATED_ONLY','driver':'FakeFactory','status':result['status'],
         'case_count':result['case_count'],'required_case_count':35,
         'watchdogs':{'main':result['main_watchdog'],'fresh':result['fresh_watchdog']},
         'rollback_acks':sum(e['type']=='ROLLBACK_ACK' for e in result['main_events']),
         'close_acks':sum(e['type']=='CLOSE_ACK' for e in result['main_events']),
         'fresh_rollback_acks':sum(e['type']=='FRESH_ROLLBACK_ACK' for e in result['fresh_events']),
         'fresh_close_acks':sum(e['type']=='FRESH_CLOSE_ACK' for e in result['fresh_events']),
         'fresh_assertions':[e for e in result['fresh_events'] if e['type']=='FRESH_ASSERTIONS'],
         'neg05':[e for e in result['main_events'] if e['type']=='CASE' and e['case_id'].startswith('NEG-05/')],
         'hosted_proof':result['hosted_proof'],'migration_apply':result['migration_apply']}
    print(json.dumps(out,indent=2,sort_keys=True))
    raise SystemExit(0 if result['status']=='PASS_OFFLINE_CONTROL_FLOW_ONLY' else 1)
