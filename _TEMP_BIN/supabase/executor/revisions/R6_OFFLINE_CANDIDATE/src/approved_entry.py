"""Separate candidate entry. No test-root or adapter injection in production API."""
from pathlib import Path
import json
import sys
from closure import artifact_inventory, sha, canonical
from policy import PLAN_SHA256, MIGRATION_SHA256, SOURCE_PATHS
from platform_clearance_gate import require_external_clearance
from hosted_session_adapter import HostedSessionAdapter
from session_allowlist import GuardedSession
from executor_runtime import execute_review_only
from case_catalog import catalog_digest, SOURCE_P59_EXPECTED


def verify_candidate(root, envelope):
    root = Path(root).absolute()
    if root != Path(__file__).absolute().parents[1]:
        raise ValueError('EXECUTING_ROOT_MISMATCH')
    for relative in SOURCE_PATHS:
        if not relative.startswith('src/'):
            continue
        module = sys.modules.get(Path(relative).stem)
        if module is not None and Path(getattr(module, '__file__', '')).absolute() != root / relative:
            raise ValueError('LOADED_MODULE_ORIGIN_MISMATCH')
    inventory = artifact_inventory(root)  # actual bytes + installed dependency lock
    if catalog_digest() != PLAN_SHA256:
        raise ValueError('COMPILED_PLAN_DRIFT')
    plan = json.loads((root / 'data/case_plan.json').read_bytes())
    normalized = [dict(id=c['id'], role=c['role'], sql=c['sql'], params=c['params'],
                       kind=c['kind'], expected=c['expected'], sqlstate=c['expected_sqlstate'],
                       constraint=c['expected_constraint'], after_rollback=c['after_rollback'])
                  for c in plan['cases']]
    if sha(canonical(normalized)) != PLAN_SHA256:
        raise ValueError('CASE_PLAN_FILE_DRIFT')
    if sha((root / 'data/migration.sql').read_bytes()) != MIGRATION_SHA256:
        raise ValueError('MIGRATION_DRIFT')
    # Load third-party verifier only after actual dependency bytes were checked.
    from release_auth import verify_release
    return verify_release(envelope, inventory['sha256'], PLAN_SHA256)


def gate_then_run(root, envelope, external_authorization=None):
    claims = verify_candidate(root, envelope)
    require_external_clearance(claims, external_authorization)
    factory = HostedSessionAdapter(claims, external_authorization)
    # Intentionally unreachable. Any approved future adapter must also install
    # a spawn-safe GuardedSession factory in a newly reviewed revision.
    raise RuntimeError('SPAWN_SAFE_HOSTED_FACTORY_NOT_INSTALLED')
