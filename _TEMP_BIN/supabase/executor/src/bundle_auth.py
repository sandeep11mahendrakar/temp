"""Immutable source and case provenance. Offline-only authentication."""
from __future__ import annotations
import hashlib,json,re
from pathlib import Path
from case_catalog import SOURCE_P59_EXPECTED,catalog_digest,validate_cases,CASES

P59_REL='docs/evidence/tv1-runner-review/20261019193033-sub-r6/SUB_SNAPSHOT.json'
P59_REV='87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9'

def hashbytes(b:bytes)->str:return hashlib.sha256(b).hexdigest()

def pin_sources(bundle_root:Path)->dict:
    src=bundle_root/'current_p59'; manifest=json.loads((src/P59_REL).read_text())
    assert manifest['revision']==P59_REV,'P59_REVISION_MISMATCH'
    lines=[]
    for obj in manifest['files']:
        path=obj['path'];raw=(src/path).read_bytes();digest=hashbytes(raw)
        if digest!=obj['sha256']:raise ValueError('P59_SOURCE_HASH_MISMATCH:'+path)
        lines.append(path+'|'+digest)
    agg=hashbytes('\n'.join(sorted(lines)).encode())
    if agg!=P59_REV:raise ValueError('P59_AGGREGATE_MISMATCH')
    sql=(src/'database/TV1_Diagnostics_R3.sql').read_text()
    ids=tuple(re.findall(r"RAISE NOTICE\s+'([^']+?)\s+\|",sql))
    validate_cases(CASES,ids)
    return {'p59_revision':agg,'p59_files_count':len(lines),'cases_exact':len(ids),'case_plan_sha256':catalog_digest(),'source_notice_ids':ids}

def artifact_digest(bundle_root:Path)->str:
    # Specifically freeze executor+case catalog+release verification+trusted interface.
    paths=('src/case_catalog.py','src/release_auth.py','src/executor_runtime.py','src/bundle_auth.py')
    rows=[p+'|'+hashbytes((bundle_root/p).read_bytes()) for p in paths]
    return hashbytes('\n'.join(rows).encode())
