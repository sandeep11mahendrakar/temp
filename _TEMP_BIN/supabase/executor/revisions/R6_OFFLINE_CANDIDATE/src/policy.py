"""Compiled review policy. Changing this file requires a new signed digest.

An on-disk manifest is an inventory, never an authority or a trust anchor.
The production release signer and platform attestor are intentionally absent.
"""
SOURCE_PATHS = (
    'entry.py', 'src/policy.py', 'src/closure.py', 'src/approved_entry.py',
    'src/platform_clearance_gate.py', 'src/hosted_session_adapter.py',
    'src/session_allowlist.py', 'src/release_auth.py', 'src/case_catalog.py',
    'src/executor_runtime.py',
)
DATA_PATHS = ('data/case_plan.json', 'data/migration.sql', 'dependency.lock.json')
STDLIB_IMPORTS = frozenset((
    '__future__', 'ast', 'base64', 'datetime', 'hashlib', 'importlib.metadata',
    'json', 'multiprocessing', 'os', 'pathlib', 'queue', 're', 'stat',
    'sys', 'sysconfig', 'time', 'typing', 'dataclasses',
))
THIRD_PARTY_IMPORTS = frozenset((
    'cryptography.hazmat.primitives.asymmetric.ed25519', 'cryptography.exceptions',
))
DEPENDENCIES = {'cryptography': '50.0.0', 'cffi': '2.1.1', 'pycparser': '3.0'}
PLAN_SHA256 = '037215b0a2cb5e8df50e99e7bd56c1c015883f04bf0c964a22b62c37789ff2e2'
MIGRATION_SHA256 = 'b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6'
