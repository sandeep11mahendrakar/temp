"""Offline in-memory transport tests ONLY: no psycopg import, network, CLI or database."""
import json
import unittest
from types import SimpleNamespace

import ocdb_hosted_executor as x

IDS=[f"ocdb_tv1_mock_{i}" for i in range(4)]

class FakePgError(Exception):
    def __init__(self,code,constraint=None):
        super().__init__("Never expose error message: SENSITIVE_SENTINEL_NOT_A_REAL_KEY")
        self.sqlstate=code
        self.diag=SimpleNamespace(constraint_name=constraint)

class FakeCursor:
    def __init__(self,columns=None,rows=None,rowcount=0):
        self.description=[SimpleNamespace(name=c) for c in columns] if columns else None
        self._rows=rows or []
        self.rowcount=rowcount
    def fetchall(self):return list(self._rows)
    def fetchone(self):return self._rows[0]

class FakeConnection:
    def __init__(self,read_only=False,inject=None):
        self.read_only=read_only
        self.inject=inject or {}
        self.calls=[]
        self.closed=False
        self.role="owner"
    def execute(self,sql,params=None):
        self.calls.append((sql,params))
        if sql=="ROLLBACK" and self.inject.get("fail_main_rollback") and not self.read_only:
            raise FakePgError("08006")
        if sql in ("BEGIN","BEGIN READ ONLY") or sql.startswith("SAVEPOINT ") or sql.startswith("RELEASE SAVEPOINT ") or sql.startswith("ROLLBACK TO SAVEPOINT ") or sql.startswith("SET LOCAL statement_timeout") or sql.startswith("SET LOCAL idle_in_transaction_session_timeout") or sql=="ROLLBACK":
            return FakeCursor()
        if sql.startswith("SET LOCAL ROLE "):
            self.role=sql.split()[-1];return FakeCursor()
        if sql=="RESET ROLE":
            self.role="owner";return FakeCursor()
        if sql=="SELECT pg_backend_pid() AS pid":
            return FakeCursor(["pid"],[[93031]])
        if sql==x.BASELINE_SQL:
            if self.read_only and self.inject.get("baseline_drift"):
                return FakeCursor(["ignored"],[["changed_baseline","v","true"]])
            return FakeCursor(["ignored"],[[f"baseline_{i}","r","false"] for i in range(6)] if self.inject.get("six_baseline") else [])
        if sql==x.FIXTURE_COUNT_SQL:
            return FakeCursor(["fixture_remaining"],[[self.inject.get("leftover_rows",0)]])
        if sql==x.PID_CLOSED_SQL:
            if self.inject.get("cleanup_sql_error"):raise FakePgError("42501")
            return FakeCursor(["open_count"],[[1 if self.inject.get("pid_still_open") else 0]])
        if self.inject.get("interrupt") and not self.read_only and sql.startswith("SELECT 1 AS eligible_count"):
            raise KeyboardInterrupt()
        if self.inject.get("unexpected") and not self.read_only and sql.startswith("SELECT 1 AS eligible_count"):
            raise FakePgError("XX000")
        if self.role in ("anon","authenticated"):
            raise FakePgError("42501")
        if sql.startswith("UPDATE public.r3_runs") and self.role=="service_role":
            raise FakePgError("42501")
        if sql.startswith("INSERT INTO public.r3_runs") and sql.endswith("RETURNING run_id"):
            raise FakePgError("23505","r3_runs_pkey")
        if sql.startswith("INSERT INTO public.r3_runs") and sql.endswith("RETURNING 1"):
            raise FakePgError("23514","r3_runs_schema_version_ck")
        if sql.startswith("INSERT INTO public.r3_runs"):
            return FakeCursor(rowcount=0)
        if sql.startswith("SELECT 4 AS fixture_count"):
            return FakeCursor(["fixture_count"],[[4]],1)
        if sql.startswith("SELECT 1 AS eligible_count"):
            return FakeCursor(["eligible_count"],[[1]],1)
        if sql.startswith("SELECT 1 AS count"):
            return FakeCursor(["count"],[[1]],1)
        if sql.startswith("SELECT true AS unchanged_digest"):
            return FakeCursor(["unchanged_digest"],[[True]],1)
        if sql.startswith("SELECT true AS rls_enabled"):
            return FakeCursor(["rls_enabled"],[[True]],1)
        if sql.startswith("SELECT true AS invoker_enabled"):
            return FakeCursor(["invoker_enabled"],[[True]],1)
        if sql.startswith("SELECT true AS privileged"):
            return FakeCursor(["privileged"],[[True]],1)
        raise AssertionError("fake only supports explicitly reviewed testing SQL type")
    def close(self):
        if self.inject.get("fail_main_close") and not self.read_only:
            raise FakePgError("08006")
        self.closed=True

def case(id,role,sql,expected,fixture=None):
    return {"id":id,"role":role,"sql":sql,"params":[fixture] if fixture else [],
            "expect":expected,**({"fixture_id":fixture} if fixture else {})}

def plan():
    err=lambda code,constraint=None:{"kind":"error","sqlstate":code,**({"constraint":constraint} if constraint else {})}
    rows=lambda **kw:{"kind":"rows","rows":[kw]}
    return {"format":1,"target_ref":x.TARGET,"environment":"personal-dev/main",
      "migration_sha256":x.MIGRATION_SHA256,"fixture_ids":IDS,"synthetic_prefix":"ocdb_tv1_mock_",
      "cases":[
        case("PREFLIGHT/OWNER","owner","SELECT true AS privileged",rows(privileged=True)),
        case("CAT/RLS","owner","SELECT true AS rls_enabled",rows(rls_enabled=True)),
        case("CAT/VIEW1","owner","SELECT true AS invoker_enabled",rows(invoker_enabled=True)),
        case("CAT/VIEW2","owner","SELECT true AS invoker_enabled",rows(invoker_enabled=True)),
        case("POS-INSERT/COUNT","owner","SELECT 4 AS fixture_count",rows(fixture_count=4)),
        case("NEG-01/SELECT","anon","SELECT 1 AS count FROM public.r3_runs",err("42501")),
        case("NEG-02/SELECT","authenticated","SELECT 1 AS count FROM public.r3_runs",err("42501")),
        case("NEG-03/SERVICE-UPDATE","service_role","UPDATE public.r3_runs SET app_id = 'no' WHERE run_id = %s",err("42501"),IDS[0]),
        case("NEG-04/CONFLICT","owner","INSERT INTO public.r3_runs (run_id) VALUES (%s) RETURNING run_id",err("23505","r3_runs_pkey"),IDS[0]),
        case("NEG-05/SCHEMA","owner","INSERT INTO public.r3_runs (run_id) VALUES (%s) RETURNING 1",err("23514","r3_runs_schema_version_ck"),IDS[1]),
        case("NEG-06/VIEW","owner","SELECT 1 AS eligible_count",rows(eligible_count=1)),
        case("POS-RETRY/INSERT","owner","INSERT INTO public.r3_runs (run_id) VALUES (%s) ON CONFLICT DO NOTHING",{"kind":"rowcount","rowcount":0},IDS[0]),
        case("POS-RETRY/COUNT","owner","SELECT 1 AS count",rows(count=1)),
        case("POS-RETRY/DIGEST","owner","SELECT true AS unchanged_digest",rows(unchanged_digest=True)),
        case("NEG-01/READBACK","anon","SELECT 1 AS count FROM public.r3_runs",err("42501")),
        case("NEG-02/READBACK","authenticated","SELECT 1 AS count FROM public.r3_runs",err("42501")),
      ]}

def run_fake(inject=None):
    connections=[]
    def opener(ro):
        c=FakeConnection(read_only=ro,inject=inject)
        connections.append(c)
        return c
    output=x.execute_plan(plan(),opener)
    return output,connections

class HostedHarnessContractTests(unittest.TestCase):
    def test_expected_sqlstate_savepoint_recovery_close_and_fresh_readback(self):
        result, conns=run_fake()
        self.assertEqual(result["status"],"PASS_SQL_DIAGNOSTICS_ONLY")
        self.assertEqual(len(result["cases"]),16)
        self.assertEqual(len(conns),2)
        self.assertTrue(conns[0].closed and conns[1].closed)
        calls=[c[0] for c in conns[0].calls]
        self.assertEqual(calls.count("BEGIN"),1)
        self.assertEqual(calls.count("ROLLBACK"),1)
        self.assertNotIn("COMMIT",calls)
        self.assertTrue(any(c.startswith("ROLLBACK TO SAVEPOINT") for c in calls))
        self.assertEqual(conns[1].calls[0][0],"BEGIN READ ONLY")
        self.assertEqual(result["fresh_cleanup"]["fixtures_remaining"],0)
        self.assertTrue(result["fresh_cleanup"]["old_backend_pid_closed"])
        self.assertEqual(result["fresh_cleanup"]["status"],"PASS")
        self.assertEqual(result["cases"][8]["raw"]["sqlstate"],"23505")
        self.assertEqual(result["cases"][8]["raw"]["constraint"],"r3_runs_pkey")
        self.assertTrue(all(r["status"]=="PASS" for r in result["cases"]))
    def test_six_object_baseline_also_preserved(self):
        r,_=run_fake({"six_baseline":True})
        self.assertEqual(r["status"],"PASS_SQL_DIAGNOSTICS_ONLY")
        self.assertEqual(r["baseline_before"]["object_count"],6)
    def test_unexpected_error_still_rolls_back_closes_and_rechecks(self):
        r,conns=run_fake({"unexpected":True})
        self.assertEqual(r["status"],"FAIL")
        self.assertEqual(r["tx"]["same_session_rollback"],"ACKNOWLEDGED")
        self.assertTrue(conns[0].closed)
        self.assertEqual(r["fresh_cleanup"]["status"],"PASS")
        self.assertTrue(len(r["cases"])<16)
    def test_failed_rollback_does_not_block_close_and_cleanup(self):
        r,conns=run_fake({"fail_main_rollback":True})
        self.assertEqual(r["status"],"FAIL")
        self.assertEqual(r["tx"]["same_session_rollback"],"FAILED")
        self.assertTrue(conns[0].closed)
        self.assertEqual(r["fresh_cleanup"]["status"],"PASS")
    def test_failed_close_never_qualifies_as_pass(self):
        r,_=run_fake({"fail_main_close":True})
        self.assertEqual(r["tx"]["closed"],"FAILED")
        self.assertEqual(r["status"],"FAIL")
    def test_leftover_synthetic_rows_fails_closed(self):
        r,_=run_fake({"leftover_rows":1})
        self.assertEqual(r["fresh_cleanup"]["fixtures_remaining"],1)
        self.assertEqual(r["status"],"FAIL")
    def test_still_open_pid_fails_closed(self):
        r,_=run_fake({"pid_still_open":True})
        self.assertEqual(r["fresh_cleanup"]["old_backend_pid_closed"],False)
        self.assertEqual(r["status"],"FAIL")
    def test_keyboard_interrupt_attempts_rollback_close_and_fresh_check(self):
        r,conns=run_fake({"interrupt":True})
        self.assertEqual(r["status"],"FAIL")
        self.assertEqual(r["tx"]["same_session_rollback"],"ACKNOWLEDGED")
        self.assertTrue(conns[0].closed and conns[1].closed)
        self.assertEqual(r["fresh_cleanup"]["status"],"PASS")
    def test_baseline_drift_fails_closed(self):
        r,_=run_fake({"baseline_drift":True})
        self.assertFalse(r["fresh_cleanup"]["baseline_preserved"])
        self.assertEqual(r["status"],"FAIL")
    def test_cleanup_query_failure_fails_closed(self):
        r,conns=run_fake({"cleanup_sql_error":True})
        self.assertEqual(r["fresh_cleanup"]["status"],"FAIL")
        self.assertTrue(conns[1].closed)
        self.assertEqual(r["status"],"FAIL")
    def test_secret_in_exception_is_never_printed(self):
        r,_=run_fake({"unexpected":True})
        self.assertNotIn("SENSITIVE_SENTINEL_NOT_A_REAL_KEY",json.dumps(r))
        self.assertNotIn("DATABASE_URL",json.dumps(r))
    def test_plan_cannot_change_transaction_control(self):
        p=plan()
        p["cases"][0]["sql"]="COMMIT"
        with self.assertRaises(ValueError):x.validate_plan(p)
    def test_host_transport_must_have_separate_approval(self):
        release={"target_ref":x.TARGET,"environment":"personal-dev/main","migration_sha256":x.MIGRATION_SHA256,"plan_sha256":"a"*64,"operator":"OC-DB","sub_scope_release":"RECORDED","transport":"DIRECT_POSTGRES_PSYCO-PG3_APPROVED","hosted_executor_approved":True,"safety_block_cleared":False}
        with self.assertRaises(ValueError):x.assert_approved_transport("postgresql://user:password@"+x.DB_HOST+"/postgres","a"*64,release)
        release["safety_block_cleared"]=True
        x.assert_approved_transport("postgresql://user:password@"+x.DB_HOST+"/postgres","a"*64,release)
        with self.assertRaises(ValueError):x.assert_approved_transport("postgresql://user:password@db.some-other-project.supabase.co/postgres","a"*64,release)

if __name__=="__main__":unittest.main(verbosity=2)
