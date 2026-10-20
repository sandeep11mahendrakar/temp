from __future__ import annotations
import base64,datetime,hashlib,json,os,sys,unittest
from pathlib import Path
from dataclasses import replace
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'src'));sys.path.insert(0,str(ROOT))
from case_catalog import CASES,IDS,SOURCE_P59_EXPECTED,validate_cases,catalog_digest
from bundle_auth import pin_sources,artifact_digest
from release_auth import verify_release,ReleaseRejected,canonical
from executor_runtime import execute_review_only,BASELINE_SQL
from tests.fake_adapter import FakeFactory

class TestFrozen(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.sources=pin_sources(ROOT)
    def test_01_sources_pinned(self):self.assertEqual(self.sources['p59_files_count'],7);self.assertEqual(self.sources['cases_exact'],35)
    def test_02_case_exact(self):self.assertEqual(tuple(c.id for c in CASES),SOURCE_P59_EXPECTED)
    def test_03_missing(self):
        with self.assertRaisesRegex(ValueError,'COVERAGE_MISMATCH'):validate_cases(CASES[:-1],SOURCE_P59_EXPECTED)
    def test_04_extra(self):
        with self.assertRaisesRegex(ValueError,'COVERAGE_MISMATCH'):validate_cases(CASES+[CASES[-1]],SOURCE_P59_EXPECTED)
    def test_05_replaced(self):
        changed=CASES.copy();changed[7]=replace(changed[7],sql='WITH x AS (DELETE FROM public.r3_runs RETURNING *) SELECT * FROM x')
        with self.assertRaisesRegex(ValueError,'CASE_SPEC_REPLACED'):validate_cases(changed,SOURCE_P59_EXPECTED)
    def test_06_role_replaced(self):
        changed=CASES.copy();changed[7]=replace(changed[7],role='owner')
        with self.assertRaisesRegex(ValueError,'CASE_SPEC_REPLACED'):validate_cases(changed,SOURCE_P59_EXPECTED)
    def test_07_bad_write_id(self):
        changed=CASES.copy();changed[6]=replace(changed[6],params=('ocdb_tv1_20261019_OTHER',))
        with self.assertRaisesRegex(ValueError,'CASE_SPEC_REPLACED'):validate_cases(changed,SOURCE_P59_EXPECTED)
    def test_08_function_path(self):
        changed=CASES.copy();changed[6]=replace(changed[6],sql="SELECT dangerous_function()")
        with self.assertRaisesRegex(ValueError,'CASE_SPEC_REPLACED'):validate_cases(changed,SOURCE_P59_EXPECTED)
    def test_09_release_unsigned_rejected(self):
        with self.assertRaises(ReleaseRejected):verify_release({'approved':True},artifact_digest(ROOT),catalog_digest())
    def make_release(self):
        key=Ed25519PrivateKey.generate();pub=key.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
        now=datetime.datetime.now(datetime.timezone.utc)
        claims={'schema':2,'release_id':'TEST_RELEASE_20261019','target_ref':'xvizjawcpafdqrygzvcx','organization':'qwgbhcakpfwytcrryuxd','project_name':'capstone-r3-dev','environment':'personal-dev','shared':False,'branch':'main','operator':'OC-DB','migration_sha256':'b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6','p59_revision':self.sources['p59_revision'],'plan_sha256':catalog_digest(),'artifact_sha256':artifact_digest(ROOT),'transport':'EXPLICITLY_REVIEWED_HOSTED_SESSION_ADAPTER','scope_handoff_id':'TEST_HANDOFF_ID','owner_approval_id':'TEST_OWNER_APPROVAL','aud_executor_approval_id':'TEST_AUD_APPROVAL','platform_tool_clearance_id':'TEST_PLATFORM_CLEARANCE','approved_baseline_sha256':hashlib.sha256(b'[]').hexdigest(),'not_before_utc':(now-datetime.timedelta(minutes=1)).isoformat(),'expires_utc':(now+datetime.timedelta(hours=1)).isoformat()}
        envelope={'signed':claims,'key_id':'TEST_NOT_PRODUCTION','signature_base64':base64.b64encode(key.sign(canonical(claims))).decode()}
        return envelope,{'TEST_NOT_PRODUCTION':pub},key
    def test_10_unpinned_release_refused(self):
        env,_,_=self.make_release()
        with self.assertRaisesRegex(ReleaseRejected,'NO_PINNED_TRUST_ROOT'):verify_release(env,artifact_digest(ROOT),catalog_digest())
    def test_11_signed_test_release(self):
        env,roots,key=self.make_release()
        self.assertEqual(verify_release(env,artifact_digest(ROOT),catalog_digest(),roots)['target_ref'],'xvizjawcpafdqrygzvcx')
    def test_12_wrong_release_binding(self):
        env,roots,key=self.make_release()
        with self.assertRaisesRegex(ReleaseRejected,'RELEASE_BINDING_MISMATCH'):verify_release(env,'0'*64,catalog_digest(),roots)
        with self.assertRaisesRegex(ReleaseRejected,'RELEASE_BINDING_MISMATCH'):verify_release(env,artifact_digest(ROOT),'0'*64,roots)
    def test_13_tampered_signature(self):
        env,roots,key=self.make_release();env['signed']['operator']='W2'
        with self.assertRaises(ReleaseRejected):verify_release(env,artifact_digest(ROOT),catalog_digest(),roots)
    def test_14_extra_permission_fields(self):
        env,roots,key=self.make_release();env['signed']['self_approve']=True
        with self.assertRaisesRegex(ReleaseRejected,'WRONG_RELEASE_FIELDS'):verify_release(env,artifact_digest(ROOT),catalog_digest(),roots)
    def test_15_expires(self):
        env,roots,key=self.make_release();future=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=2)
        with self.assertRaisesRegex(ReleaseRejected,'RELEASE_TIME_INVALID'):verify_release(env,artifact_digest(ROOT),catalog_digest(),roots,now=future)
    def simulate(self,fault=''):
        baseline=hashlib.sha256(b'[]').hexdigest()
        return execute_review_only(FakeFactory(fault),baseline,tuple(self.sources['source_notice_ids']),main_max_s=3.5,cleanup_max_s=3.5)
    def test_16_fake_positive(self):
        res=self.simulate();self.assertEqual(res['status'],'PASS_OFFLINE_CONTROL_FLOW_ONLY',[(x.get('type'),x.get('phase'),x.get('error_class')) for x in res['main_events'] if x.get('type')=='ERROR']);self.assertEqual(res['case_count'],35)
        self.assertEqual([c['case_id'] for c in res['main_events'] if c['type']=='CASE'],list(SOURCE_P59_EXPECTED[:-1]))
        self.assertEqual([c['case_id'] for c in res['fresh_events'] if c['type']=='CASE'],['POST-ROLLBACK'])
    def test_17_expected_states_present(self):
        res=self.simulate(); m={c['case_id']:c for c in res['main_events'] if c['type']=='CASE'}
        self.assertEqual(m['NEG-05/TRIAL-PENDING']['actual']['constraint'],'r3_runs_trial_excluded_ck')
        self.assertEqual(m['NEG-01/SELECT']['actual']['sqlstate'],'42501')
        self.assertEqual(m['NEG-03-OWNER-TRIGGER/UPDATE']['actual']['sqlstate'],'55000')
    def test_18_wrong_sqlstate_fail_closed(self):
        res=self.simulate('wrong_state');self.assertEqual(res['status'],'FAIL');self.assertTrue(any(x['type']=='ERROR' for x in res['main_events']));self.assertTrue(any(x['type']=='FRESH_ASSERTIONS' for x in res['fresh_events']))
    def test_18b_sqlstate_evidence_on_mismatch(self):
        res=self.simulate('wrong_state');ev=[x for x in res['main_events'] if x['type']=='CASE' and x['case_id']=='NEG-01/SELECT']
        self.assertEqual(len(ev),1);self.assertEqual(ev[0]['status'],'FAIL')
        self.assertEqual(ev[0]['actual']['sqlstate'],'00001')
    def test_18c_unexpected_sql_success_evidence(self):
        res=self.simulate('unexpected_success');ev=[x for x in res['main_events'] if x['type']=='CASE' and x['case_id']=='NEG-01/SELECT']
        self.assertEqual(len(ev),1);self.assertEqual(ev[0]['status'],'FAIL')
        self.assertEqual(ev[0]['actual']['sqlstate'],'00000')
    def test_19_execute_watchdog(self):
        res=self.simulate('execute');self.assertEqual(res['status'],'FAIL');self.assertEqual(res['main_watchdog'],'WATCHDOG_TIMEOUT');self.assertTrue(any(x['type']=='FRESH_ASSERTIONS' for x in res['fresh_events']))
    def test_20_rollback_watchdog(self):
        res=self.simulate('rollback');self.assertEqual(res['status'],'FAIL');self.assertEqual(res['main_watchdog'],'WATCHDOG_TIMEOUT');self.assertTrue(any(x['type']=='FRESH_ASSERTIONS' for x in res['fresh_events']))
    def test_21_close_watchdog(self):
        res=self.simulate('close');self.assertEqual(res['status'],'FAIL');self.assertEqual(res['main_watchdog'],'WATCHDOG_TIMEOUT');self.assertTrue(any(x['type']=='FRESH_ASSERTIONS' for x in res['fresh_events']))
    def test_22_cleanup_watchdog(self):
        res=self.simulate('cleanup');self.assertEqual(res['status'],'FAIL');self.assertEqual(res['fresh_watchdog'],'WATCHDOG_TIMEOUT')
    def test_23_no_prod_trust_anchor(self):
        from release_auth import TRUST_ROOTS
        self.assertEqual(TRUST_ROOTS,{})
    def test_24_no_dsn_or_connection_import(self):
        src=(ROOT/'src/executor_runtime.py').read_text()
        self.assertNotIn('psycopg.connect(',src)
        self.assertNotIn('supabase.create_client(',src)
    def test_25_fixture_ids_exact_four(self):
        self.assertEqual(len(IDS),4);self.assertEqual(len(set(IDS)),4)
    def test_26_signed_but_unapproved_route_refused(self):
        from approved_entry import gate_then_run, RouteNotApproved
        env,roots,_=self.make_release()
        class NoRoute:
            IS_OFFLINE_TEST_DOUBLE=False
        with self.assertRaisesRegex(RouteNotApproved,'PLATFORM_CLEARANCE_UNVERIFIABLE'):
            gate_then_run(ROOT,env,NoRoute(),roots=roots)
    def test_27_crypto_tamper(self):
        env,roots,key=self.make_release()
        env['signed']['owner_approval_id']='TEST_OTHER_OWNER'
        with self.assertRaisesRegex(ReleaseRejected,'BAD_SIGNATURE'):
            verify_release(env,artifact_digest(ROOT),catalog_digest(),roots)
    def test_28_mutated_p59_source_rejected(self):
        import shutil,tempfile
        with tempfile.TemporaryDirectory() as d:
            tmp=Path(d);shutil.copytree(ROOT/'current_p59',tmp/'current_p59')
            path=tmp/'current_p59/database/TV1_Diagnostics_R3.sql'
            path.write_bytes(path.read_bytes()+b'\n')
            with self.assertRaisesRegex(ValueError,'P59_SOURCE_HASH_MISMATCH'):
                pin_sources(tmp)
    def test_29_extra_p59_id_refused(self):
        with self.assertRaisesRegex(ValueError,'COVERAGE_MISMATCH'):
            validate_cases(CASES,SOURCE_P59_EXPECTED+('NEG-07/BAD',))
    def test_30_subcase_raw_output_all_scoped(self):
        res=self.simulate();events=[c for c in res['main_events']+res['fresh_events'] if c['type']=='CASE']
        self.assertEqual(len(events),35)
        for x in events:
            self.assertEqual(x['status'],'PASS')
            self.assertNotIn('sql',x)
            self.assertNotIn('dsn',x)
            self.assertNotIn('payload',x)
        self.assertEqual(res['transport_retry_hash_proof'],'NOT_COVERED')
        self.assertEqual(res['stored_envelope_digest_proof'],'NOT_COVERED')

if __name__=='__main__':unittest.main()
