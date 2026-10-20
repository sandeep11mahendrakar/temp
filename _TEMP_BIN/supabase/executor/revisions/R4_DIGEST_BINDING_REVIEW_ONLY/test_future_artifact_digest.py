"""Offline mutation tests for FUTURE proposal only. No network, DB or credentials."""
from __future__ import annotations
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import importlib.util
import tempfile
import unittest

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from future_artifact_digest import PINNED_MODULES, ReleasePinError, artifact_digest

ROOT = Path(__file__).resolve().parents[2]  # executor/ when housed at executor/revisions/<review>/
RELEASE_AUTH = ROOT / 'src' / 'release_auth.py'

class TestFuturePin(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for item in PINNED_MODULES:
            p = self.root / item
            p.parent.mkdir(parents=True, exist_ok=True)
            if item == 'src/future_artifact_digest.py':
                p.write_bytes((Path(__file__).parent / 'future_artifact_digest.py').read_bytes())
            else:
                p.write_text('# synthetic test-only code for ' + item + '\n')

    def test_repeatable_digest(self):
        digest = artifact_digest(self.root)
        self.assertEqual(len(digest), 64)
        self.assertEqual(digest, artifact_digest(self.root))

    def test_mutation_rejection_all_pinned_sources(self):
        original = artifact_digest(self.root)
        for name in PINNED_MODULES:
            with self.subTest(source=name):
                p = self.root / name
                before = p.read_bytes()
                p.write_bytes(before + b'# hostile modification\n')
                self.assertNotEqual(original, artifact_digest(self.root))
                p.write_bytes(before)
                self.assertEqual(original, artifact_digest(self.root))

    def test_missing_adapter_and_clearance_gate_fail_closed(self):
        for name in ('src/hosted_session_adapter.py', 'src/platform_clearance_gate.py'):
            with self.subTest(source=name):
                p = self.root / name
                b = p.read_bytes(); p.unlink()
                with self.assertRaises(ReleasePinError):artifact_digest(self.root)
                p.write_bytes(b)

    def test_symlink_rejected(self):
        p = self.root / 'src' / 'approved_entry.py'
        target = self.root / 'indirect.py'
        target.write_text('offline only\n')
        p.unlink()
        try:
            p.symlink_to(target)
        except (OSError, NotImplementedError):
            self.skipTest('Symlinks unavailable in this environment')
        with self.assertRaises(ReleasePinError):artifact_digest(self.root)

    def test_existing_signed_claim_rejects_mutated_entry_and_adapter(self):
        # Load frozen verification unchanged. Test-only ephemeral public key injection.
        self.assertTrue(RELEASE_AUTH.is_file(), 'Frozen R3 release_auth.py not mounted at expected executor/src path')
        spec = importlib.util.spec_from_file_location('r3_release_auth_testonly', RELEASE_AUTH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        private = Ed25519PrivateKey.generate()
        public = private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        baseline = artifact_digest(self.root)
        now = datetime.now(timezone.utc)
        plan = 'a' * 64
        fields = {
            'schema':2,'release_id':'test-release-001',
            'target_ref':module.TARGET,'organization':'qwgbhcakpfwytcrryuxd',
            'project_name':'capstone-r3-dev','environment':'personal-dev','shared':False,
            'branch':'main','operator':'OC-DB','migration_sha256':module.MIGRATION,
            'p59_revision':module.P59_REV,'plan_sha256':plan,'artifact_sha256':baseline,
            'transport':'EXPLICITLY_REVIEWED_HOSTED_SESSION_ADAPTER',
            'scope_handoff_id':'test-handoff-id', 'owner_approval_id':'test-approval-id',
            'aud_executor_approval_id':'test-aud-id','platform_tool_clearance_id':'test-clearance-id',
            'approved_baseline_sha256':'b'*64,
            'not_before_utc':(now-timedelta(minutes=1)).isoformat(),
            'expires_utc':(now+timedelta(minutes=10)).isoformat(),
        }
        envelope={'signed':fields,'key_id':'test-only-key',
                  'signature_base64':base64.b64encode(private.sign(module.canonical(fields))).decode('ascii')}
        self.assertEqual(module.verify_release(envelope,baseline,plan,roots={'test-only-key':public},now=now),fields)
        for name in ('src/approved_entry.py', 'src/hosted_session_adapter.py', 'src/platform_clearance_gate.py'):
            with self.subTest(name=name):
                p=self.root/name;original=p.read_bytes()
                p.write_bytes(original+b'# mutation\n')
                changed=artifact_digest(self.root)
                self.assertNotEqual(changed,baseline)
                with self.assertRaisesRegex(module.ReleaseRejected,'RELEASE_BINDING_MISMATCH'):
                    module.verify_release(envelope,changed,plan,roots={'test-only-key':public},now=now)
                p.write_bytes(original)

if __name__ == '__main__':unittest.main()
