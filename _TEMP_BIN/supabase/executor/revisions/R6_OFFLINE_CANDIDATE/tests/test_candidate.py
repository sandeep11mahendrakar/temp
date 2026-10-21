"""R6 offline regressions. Fakes, not Supabase/Postgres execution evidence."""
from __future__ import annotations
import base64
import copy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
import multiprocessing as mp
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from closure import (artifact_inventory, dependency_inventory, source_closure, file_hash,
                     ClosureRejected, canonical, sha)
from policy import SOURCE_PATHS, DATA_PATHS, PLAN_SHA256
from release_auth import verify_release, ReleaseRejected, TRUST_ROOTS
from platform_clearance_gate import require_external_clearance, PlatformBlocked
from hosted_session_adapter import HostedSessionAdapter
from approved_entry import verify_candidate, gate_then_run
from case_catalog import (CASES, IDS, NEG05_IDS, NEG05_NAMES, SOURCE_P59_EXPECTED,
                          validate_cases, catalog_digest)
from executor_runtime import (execute_review_only, drive_child, main_worker, emit,
                              BASELINE_SQL, PREFIX_COUNT_SQL, DbFailure, QueryResult)
from session_allowlist import GuardedSession
from tests.fake_adapter import FakeFactory, FakeSession

ROOT = Path(__file__).absolute().parents[1]
BASELINE = hashlib.sha256(b'[]').hexdigest()


def signed_release(digest, **updates):
    key = Ed25519PrivateKey.generate()
    now = datetime.now(timezone.utc)
    claims = dict(schema=2, release_id='SYNTHETIC_RELEASE_ONLY', target_ref='xvizjawcpafdqrygzvcx',
                  organization='qwgbhcakpfwytcrryuxd', project_name='capstone-r3-dev',
                  environment='personal-dev', shared=False, branch='main', operator='OC-DB',
                  migration_sha256='b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6',
                  p59_revision='87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9',
                  plan_sha256=PLAN_SHA256, artifact_sha256=digest,
                  transport='EXPLICITLY_REVIEWED_HOSTED_SESSION_ADAPTER',
                  scope_handoff_id='SYNTHETIC_SCOPE', owner_approval_id='SYNTHETIC_OWNER',
                  aud_executor_approval_id='SYNTHETIC_AUD', platform_tool_clearance_id='SYNTHETIC_PLATFORM',
                  approved_baseline_sha256=BASELINE,
                  not_before_utc=(now-timedelta(minutes=1)).isoformat(),
                  expires_utc=(now+timedelta(minutes=10)).isoformat())
    claims.update(updates)
    envelope = dict(signed=claims, key_id='EPHEMERAL_TEST_ONLY',
                    signature_base64=base64.b64encode(key.sign(canonical(claims))).decode())
    public = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return envelope, {'EPHEMERAL_TEST_ONLY': public}


def early_close(pipe):
    pipe.close()


def abnormal_child(pipe):
    pipe.send({'type': 'CONNECTED'})
    pipe.close()
    os._exit(7)


class BrokenPipeParent:
    def __init__(self, parent): self.parent = parent
    def poll(self, timeout=0): raise BrokenPipeError()
    def close(self): self.parent.close()


class BrokenContext:
    def Pipe(self, duplex=False):
        parent, child = mp.get_context('spawn').Pipe(duplex=duplex)
        return BrokenPipeParent(parent), child
    def Process(self, **kwargs): return mp.get_context('spawn').Process(**kwargs)


class FailureFactory:
    IS_OFFLINE_TEST_DOUBLE = True
    def __init__(self, fault): self.fault = fault
    def __call__(self, readonly):
        if self.fault == 'connect' and not readonly: raise RuntimeError('FAKE_CONNECT_FAILURE')
        return FailureSession(readonly, self.fault)


class FailureSession(FakeSession):
    def execute(self, sql, params=()):
        if self.fault == 'child_exit' and not self.readonly and sql == CASES[6].sql:
            os._exit(9)
        if self.fault == 'rollback_error' and not self.readonly and sql == 'ROLLBACK':
            raise RuntimeError('FAKE_ROLLBACK_FAILURE')
        if self.readonly and self.fault == 'residual' and sql == PREFIX_COUNT_SQL:
            return QueryResult([(1,)])
        if self.readonly and self.fault == 'baseline_drift' and sql == BASELINE_SQL:
            return QueryResult([('changed',)])
        return super().execute(sql, params)
    def close(self):
        if self.fault == 'close_error' and not self.readonly: raise RuntimeError('FAKE_CLOSE_FAILURE')
        super().close()


class GuardedFakeFactory:
    IS_OFFLINE_TEST_DOUBLE = True
    def __call__(self, readonly): return GuardedSession(FakeSession(readonly, ''), readonly)


class SourceBindingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='fake-only-', dir=ROOT / 'evidence')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'candidate'
        shutil.copytree(ROOT / 'src', self.root / 'src')
        shutil.copytree(ROOT / 'data', self.root / 'data')
        for p in ('entry.py', 'dependency.lock.json'): shutil.copyfile(ROOT / p, self.root / p)

    def inventory(self): return artifact_inventory(self.root, verify_dependencies=False)

    def test_complete_graph_and_stable_digest(self):
        first = self.inventory()
        self.assertEqual(first, self.inventory())
        self.assertEqual(set(first['files']), set(SOURCE_PATHS + DATA_PATHS))
        self.assertIn('src/policy.py', first['imports']['src/closure.py'])
        self.assertIn('src/session_allowlist.py', first['imports']['src/approved_entry.py'])

    def test_signed_release_rejects_each_source_and_transitive_import_mutation(self):
        original = self.inventory()['sha256']
        envelope, roots = signed_release(original)
        verify_release(envelope, original, PLAN_SHA256, roots=roots)
        for relative in SOURCE_PATHS:
            with self.subTest(path=relative):
                p = self.root / relative; before = p.read_bytes()
                p.write_bytes(before + b'\n# isolated tamper\n')
                changed = self.inventory()['sha256']
                self.assertNotEqual(changed, original)
                with self.assertRaisesRegex(ReleaseRejected, 'RELEASE_BINDING_MISMATCH'):
                    verify_release(envelope, changed, PLAN_SHA256, roots=roots)
                p.write_bytes(before)

    def test_signed_release_rejects_changed_lockfile_plan_migration(self):
        original = self.inventory()['sha256']; envelope, roots = signed_release(original)
        for relative in DATA_PATHS:
            with self.subTest(path=relative):
                p = self.root / relative; before = p.read_bytes()
                p.write_bytes(before + b' ')
                with self.assertRaises(ReleaseRejected):
                    verify_release(envelope, self.inventory()['sha256'], PLAN_SHA256, roots=roots)
                p.write_bytes(before)

    def test_missing_each_required_file(self):
        for relative in SOURCE_PATHS + DATA_PATHS:
            with self.subTest(path=relative):
                p = self.root / relative; dest = p.with_suffix(p.suffix + '.missing')
                p.rename(dest)
                with self.assertRaises((ClosureRejected, OSError)): self.inventory()
                dest.rename(p)

    def test_unexpected_import_module_dynamic_import_and_binary(self):
        p = self.root / 'src/approved_entry.py'; before = p.read_bytes()
        for appended in (b'\nimport socket\n', b'\n__import__("socket")\n', b'\nimport not_reviewed\n'):
            p.write_bytes(before + appended)
            with self.assertRaises(ClosureRejected): self.inventory()
        p.write_bytes(before)
        extra = self.root / 'src/transitive_import.py'; extra.write_text('x=1\n')
        with self.assertRaises(ClosureRejected): self.inventory()

    def test_no_caller_source_list_argument(self):
        with self.assertRaises(TypeError): artifact_inventory(self.root, paths=['entry.py'])

    def test_symlink_and_parent_junction(self):
        if os.name == 'nt':
            self.skipTest('Windows native junction creation denied EPERM; retained R3 raw; reparse rejection tested with injected filesystem metadata')
        # Windows junctions need no developer-mode symlink privilege.
        outside = Path(self.temp.name) / 'elsewhere'
        outside.mkdir()
        linked = self.root / 'src'
        linked.rename(outside / 'src')
        if os.name == 'nt':
            run = subprocess.run(['node', '-e',
                'require("node:fs").symlinkSync(process.argv[1],process.argv[2],"junction")',
                str(outside / 'src'), str(linked)], capture_output=True)
            self.assertEqual(run.returncode, 0, run.stderr.decode(errors='replace'))
        else:
            linked.symlink_to(outside / 'src', target_is_directory=True)
        with self.assertRaises(ClosureRejected): self.inventory()

    def test_direct_and_ancestor_reparse_metadata_rejected(self):
        from types import SimpleNamespace
        original = Path.lstat
        for target in (self.root / 'src/approved_entry.py', self.root / 'src', self.root):
            with self.subTest(path=target.name):
                def reparse(path):
                    if path == target:
                        return SimpleNamespace(st_mode=stat.S_IFREG if path.suffix else stat.S_IFDIR,
                                               st_reparse_tag=0xA0000003)
                    return original(path)
                with patch.object(Path, 'lstat', reparse):
                    with self.assertRaises(ClosureRejected): self.inventory()

    def test_dependency_inventory_matches_review_lock(self):
        artifact_inventory(self.root)

    def test_changed_package_bytes_and_native_transitive_dependency_rejected(self):
        lock = json.loads((ROOT / 'dependency.lock.json').read_bytes())
        members = []
        for name, token in (('cryptography', '_rust'), ('cffi', '_cffi_backend'), ('pycparser', 'c_parser.py')):
            matches = [p for p in lock['distributions'][name]['files'] if token in p and p.endswith(('.pyd', '.so', '.py'))]
            self.assertTrue(matches, name)
            members.append(matches[0])
        original_read = Path.read_bytes
        for member in members:
            with self.subTest(dependency=member):
                def altered_read(path):
                    raw = original_read(path)
                    return raw + b'TEST_TAMPER' if path.as_posix().endswith(member) else raw
                with patch.object(Path, 'read_bytes', altered_read):
                    with self.assertRaisesRegex(ClosureRejected, 'DEPENDENCY_LOCK_MISMATCH'):
                        artifact_inventory(self.root)

    def test_missing_dependency_and_unrecorded_package_file_refused(self):
        with patch('closure.importlib.metadata.distributions', return_value=[]):
            with self.assertRaisesRegex(ClosureRejected, 'DEPENDENCY_MISSING_OR_AMBIGUOUS'): artifact_inventory(self.root)
        original = Path.rglob
        def added_file(path, pattern):
            yield from original(path, pattern)
            if path.name == 'cryptography':
                # Existing unrecorded .py file is injected into enumeration only.
                yield ROOT / 'entry.py'
        with patch.object(Path, 'rglob', added_file):
            with self.assertRaises((ClosureRejected, ValueError)): artifact_inventory(self.root)

    def test_cached_bytecode_is_also_bound(self):
        lock = json.loads((ROOT / 'dependency.lock.json').read_bytes())
        members = [p for p in lock['distributions']['cryptography']['files'] if p.endswith('.pyc')]
        self.assertTrue(members)
        self.assertTrue(any(p.endswith('.pyc') for p in lock['runtime_files']))
        original = Path.read_bytes
        def changed(path):
            raw = original(path)
            return raw + b'TEST_CACHE_TAMPER' if path.as_posix().endswith(members[0]) else raw
        with patch.object(Path, 'read_bytes', changed):
            with self.assertRaisesRegex(ClosureRejected, 'DEPENDENCY_LOCK_MISMATCH'):
                artifact_inventory(self.root)


class ReleaseAndClearanceTests(unittest.TestCase):
    def test_caller_root_and_loaded_module_origin_must_match_executing_code(self):
        with self.assertRaisesRegex(ValueError, 'EXECUTING_ROOT_MISMATCH'):
            verify_candidate(ROOT / 'data', {})
        with patch.object(sys.modules['case_catalog'], '__file__', str(ROOT / 'outside.py')):
            with self.assertRaisesRegex(ValueError, 'LOADED_MODULE_ORIGIN_MISMATCH'):
                verify_candidate(ROOT, {})

    def test_no_real_signer_and_no_injected_roots_in_entry_api(self):
        self.assertEqual(TRUST_ROOTS, {})
        with self.assertRaises(TypeError): verify_candidate(ROOT, {}, roots={'caller': b'fake'})

    def test_invalid_signature_rejected(self):
        envelope, roots = signed_release('a'*64)
        envelope['signature_base64'] = base64.b64encode(b'\0'*64).decode()
        with self.assertRaisesRegex(ReleaseRejected, 'BAD_SIGNATURE'):
            verify_release(envelope, 'a'*64, PLAN_SHA256, roots=roots)

    def test_target_digest_plan_expiry_and_authorization_rejection(self):
        for update in ({'target_ref': 'wrong'}, {'artifact_sha256': 'b'*64},
                       {'plan_sha256': 'c'*64}, {'expires_utc': '2000-01-01T00:00:00Z'},
                       {'owner_approval_id': ''}, {'platform_tool_clearance_id': ''},
                       {'operator': 'W2'}, {'transport': 'OTHER_SQL_TRANSPORT'}):
            with self.subTest(change=next(iter(update))):
                envelope, roots = signed_release('a'*64, **update)
                with self.assertRaises(ReleaseRejected): verify_release(envelope, 'a'*64, PLAN_SHA256, roots=roots)

    def test_actual_entry_validates_on_disk_bytes_before_signature(self):
        # A genuine locally checked candidate still has no independent signer.
        inventory = artifact_inventory(ROOT)
        envelope, roots = signed_release(inventory['sha256'])
        with self.assertRaisesRegex(ReleaseRejected, 'NO_PINNED_TRUST_ROOT'):
            verify_candidate(ROOT, envelope)

    def test_missing_mismatched_and_fabricated_external_clearance_never_open(self):
        for supplied in (None, {}, {'approved': True}, {'target_ref': 'wrong'}, object()):
            with self.subTest(kind=type(supplied).__name__):
                with self.assertRaises(PlatformBlocked): require_external_clearance({}, supplied)
                with self.assertRaises(PlatformBlocked): HostedSessionAdapter({}, supplied)
        instance = HostedSessionAdapter.__new__(HostedSessionAdapter)
        with self.assertRaises(PlatformBlocked): instance(False)

    def test_signed_release_is_not_platform_clearance(self):
        envelope, roots = signed_release('a'*64)
        claims = verify_release(envelope, 'a'*64, PLAN_SHA256, roots=roots)
        with self.assertRaises(PlatformBlocked): require_external_clearance(claims, {'approved': True})

    def test_cli_stays_blocked_and_redacts_errors(self):
        run = subprocess.run([sys.executable, '-I', '-S', '-B', str(ROOT / 'entry.py')], capture_output=True, text=True)
        self.assertEqual(run.returncode, 2)
        self.assertEqual(run.stdout.strip(), 'BLOCKED_OFFLINE_CANDIDATE_NO_EXTERNAL_RELEASE_OR_PLATFORM_CLEARANCE')
        self.assertEqual(run.stderr, '')


class RuntimeTests(unittest.TestCase):
    def simulate(self, factory=None):
        return execute_review_only(factory or FakeFactory(), BASELINE, SOURCE_P59_EXPECTED,
                                   main_max_s=3.5, cleanup_max_s=3.5)

    def test_exact_35_cases_through_guarded_adapter(self):
        res = self.simulate(GuardedFakeFactory())
        self.assertEqual(res['status'], 'PASS_OFFLINE_CONTROL_FLOW_ONLY', res)
        events = [x for x in res['main_events'] + res['fresh_events'] if x['type'] == 'CASE']
        self.assertEqual(tuple(x['case_id'] for x in events), SOURCE_P59_EXPECTED)
        self.assertEqual(res['case_count'], 35)
        self.assertEqual(res['hosted_proof'], 'NOT_RUN')

    def test_six_neg05_constraints_and_unique_ids(self):
        self.assertEqual(len(set(NEG05_IDS)), 6)
        self.assertTrue(set(IDS).isdisjoint(NEG05_IDS))
        session = FakeSession(False, ''); session.stage = list(IDS)
        from executor_runtime import run_case
        for name, rid in zip(NEG05_NAMES, NEG05_IDS):
            c = next(c for c in CASES if c.id == 'NEG-05/' + name)
            self.assertEqual(c.params, (rid, IDS[0]))
            result = run_case(session, c)
            self.assertEqual(result['actual'], dict(sqlstate='23514', constraint=c.constraint))
        session.execute('ROLLBACK'); self.assertEqual(session.stage, [])
        session.close(); self.assertTrue(session.closed)

    def test_each_neg05_breaks_one_independent_predicate(self):
        predicates = {
            'r3_runs_schema_version_ck': lambda d: d['schema'] == '1.0',
            'r3_runs_aggregate_eligibility_ck': lambda d: d['elig'] in ('ELIGIBLE','EXCLUDED','PENDING_VALIDATION'),
            'r3_runs_eligible_research_ids_ck': lambda d: d['elig'] != 'ELIGIBLE' or (d['kind']=='RESEARCH' and bool(d['app']) and bool(d['comparison'])),
            'r3_runs_trial_excluded_ck': lambda d: d['kind'] != 'TRIAL' or d['elig'] == 'EXCLUDED',
            'r3_runs_supersedes_ck': lambda d: not d['self_ref'],
        }
        changes = [dict(schema='2.0'), dict(elig='UNKNOWN'), dict(kind='PENDING_VALIDATION'),
                   dict(app=None), dict(self_ref=True), dict(kind='TRIAL',elig='PENDING_VALIDATION')]
        for name, change in zip(NEG05_NAMES, changes):
            with self.subTest(case=name):
                row = dict(schema='1.0',elig='ELIGIBLE',kind='RESEARCH',app='app',comparison='cmp',self_ref=False)
                row.update(change)
                expected = next(c.constraint for c in CASES if c.id == 'NEG-05/' + name)
                self.assertEqual({n for n, check in predicates.items() if not check(row)}, {expected})

    def test_sql_role_params_and_case_plan_allowlist(self):
        session = GuardedSession(FakeSession(False, ''))
        for sql, params in (('SET LOCAL ROLE postgres', ()), ('SELECT dangerous_function()', ()),
                            (CASES[6].sql, ('wrong_id',)), ('ROLLBACK; DELETE FROM public.runs', ())):
            with self.assertRaises(ValueError): session.execute(sql, params)
        for field, value in (('role', 'postgres'), ('sql', 'DELETE FROM public.runs')):
            changed = CASES.copy(); changed[0] = replace(CASES[0], **{field: value})
            with self.assertRaises(ValueError): validate_cases(changed, SOURCE_P59_EXPECTED)
        with self.assertRaises(ValueError): validate_cases(CASES[:-1], SOURCE_P59_EXPECTED)

    def test_watchdog_timeout_and_fresh_cleanup(self):
        res = self.simulate(FakeFactory('execute'))
        self.assertEqual(res['status'], 'FAIL')
        self.assertEqual(res['main_watchdog'], 'WATCHDOG_TIMEOUT')
        self.assertTrue(any(x['type'] == 'FRESH_ASSERTIONS' for x in res['fresh_events']))

    def test_rollback_and_close_failure_and_fresh_cleanup(self):
        for fault in ('rollback_error', 'close_error', 'rollback', 'close', 'wrong_state'):
            with self.subTest(fault=fault):
                res = self.simulate(FailureFactory(fault))
                self.assertEqual(res['status'], 'FAIL')
                self.assertTrue(any(x['type'] == 'FRESH_CONNECTED' for x in res['fresh_events']))
                self.assertTrue(any(x['type'] == 'FRESH_ASSERTIONS' for x in res['fresh_events']))

    def test_residual_fixtures_and_baseline_drift_fail(self):
        for fault in ('residual', 'baseline_drift'):
            with self.subTest(fault=fault):
                res = self.simulate(FailureFactory(fault))
                self.assertEqual(res['status'], 'FAIL')
                self.assertTrue(any(x['type'] == 'FRESH_ERROR' for x in res['fresh_events']))
                self.assertTrue(any(x['type'] == 'FRESH_CLOSE_ACK' for x in res['fresh_events']))

    def test_connect_failure_and_abnormal_child_still_launch_cleanup(self):
        for fault in ('connect', 'child_exit'):
            with self.subTest(fault=fault):
                res = self.simulate(FailureFactory(fault))
                self.assertEqual(res['status'], 'FAIL')
                self.assertTrue(any(x['type'] == 'FRESH_CONNECTED' for x in res['fresh_events']))

    def test_startup_exception_still_attempts_fresh_cleanup(self):
        import executor_runtime
        original = executor_runtime.drive_child
        def startup_failure(ctx, target, args, total, idle):
            if target is main_worker: raise OSError('FAKE_PROCESS_START_FAILED')
            return original(ctx, target, args, total, idle)
        with patch('executor_runtime.drive_child', startup_failure):
            res = self.simulate()
        self.assertEqual(res['status'], 'FAIL')
        self.assertEqual(res['main_watchdog'], 'DRIVER_EXCEPTION')
        self.assertTrue(any(x['type'] == 'FRESH_CONNECTED' for x in res['fresh_events']))

    def test_process_construction_failure_closes_both_pipe_handles(self):
        from unittest.mock import Mock
        parent, child = Mock(), Mock()
        context = Mock()
        context.Pipe.return_value = (parent, child)
        context.Process.side_effect = OSError('FAKE_CONSTRUCTION_FAILURE')
        with self.assertRaises(OSError): drive_child(context, main_worker, (), 3, 1)
        parent.close.assert_called_once()
        child.close.assert_called_once()

    def test_malformed_pid_ipc_still_attempts_fresh_cleanup(self):
        import executor_runtime
        original = executor_runtime.drive_child
        def malformed(ctx, target, args, total, idle):
            if target is main_worker: return [{'type':'PID'}], 'MALFORMED_EVENT'
            return original(ctx, target, args, total, idle)
        with patch('executor_runtime.drive_child', malformed): res = self.simulate()
        self.assertEqual(res['status'], 'FAIL')
        self.assertTrue(any(x['type'] == 'FRESH_CONNECTED' for x in res['fresh_events']))

    def test_child_failure_and_broken_ipc_never_pass(self):
        for target in (early_close, abnormal_child):
            events, status = drive_child(mp.get_context('spawn'), target, (), 3, 1)
            self.assertNotEqual(status, 'EXIT_ZERO')
        events, status = drive_child(BrokenContext(), early_close, (), 3, 1)
        self.assertNotEqual(status, 'EXIT_ZERO')

    def test_cleanup_watchdog_and_start_failure_stay_fail(self):
        res = self.simulate(FakeFactory('cleanup'))
        self.assertEqual(res['status'], 'FAIL')
        self.assertEqual(res['fresh_watchdog'], 'WATCHDOG_TIMEOUT')

    def test_broken_send_does_not_skip_rollback_and_close(self):
        class BrokenPipe:
            def send(self, value): raise BrokenPipeError()
            def close(self): pass
        session = FakeSession(False, '')
        main_worker(BrokenPipe(), lambda readonly: session, BASELINE, SOURCE_P59_EXPECTED)
        self.assertEqual(session.stage, [])
        self.assertTrue(session.closed)


if __name__ == '__main__': unittest.main()
