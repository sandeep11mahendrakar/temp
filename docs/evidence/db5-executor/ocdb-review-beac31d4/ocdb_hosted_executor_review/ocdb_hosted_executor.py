#!/usr/bin/env python3
"""OC-DB review artifact: fail-closed single-session synthetic TV-1 diagnostic runner.

NOT approved for hosted use. Requires independent review of the exact P59 case plan,
external SUB/owner clearance for the chosen transport, and an approved release record.
No migration is applied here. No transport or stored-envelope digest proof is claimed.

The caller supplies a reviewed JSON case plan (which is NOT bundled). The runner
executes individual parameterized SQL cases in exactly one BEGIN/ROLLBACK session,
uses SAVEPOINT around each expected failure, closes the session in a finally,
then opens a NEW read-only connection for non-persistence + backend closure checks.
It never commits. It never logs SQL, arguments, DSNs, errors' messages, or rows
other than explicitly allowlisted synthetic diagnostic scalar results.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Callable

TARGET = "xvizjawcpafdqrygzvcx"
MIGRATION_SHA256 = "b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6"
DB_HOST = f"db.{TARGET}.supabase.co"
SAFE_FIELDS = frozenset({
    "run_id", "fixture_count", "eligible_count", "readback_count", "duplicate_retry_row_count",
    "count", "inserted", "unchanged_digest", "rls_enabled", "invoker_enabled",
    "trial_count", "pending_count", "excluded_count", "eligible_id", "is_valid",
    "fixture_remaining", "baseline_preserved", "privileged", "owner_trigger_enabled",
    "has_update", "has_delete", "can_set_roles", "num_tables", "num_views"
})
SQLSTATE_RE = re.compile(r"^[0-9A-Z]{5}$")
CONSTRAINT_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
CASE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_./-]{1,79}$")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,79}$")
ALLOWED_ROLES = {"owner", "anon", "authenticated", "service_role"}
# This is a conservative guard, not a substitute for human/auditor SQL review.
BLOCK_SQL = re.compile(r"\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|TRUNCATE|VACUUM|CALL|RESET|DISCARD|EXECUTE|PREPARE|DEALLOCATE)\b", re.I)
DML = re.compile(r"^\s*(INSERT|UPDATE|DELETE)\b", re.I)

# Never print the catalog's definition text; hash it for baseline preservation.
BASELINE_SQL = """
SELECT c.relname, c.relkind::text AS kind, c.relrowsecurity,
       COALESCE(c.relacl::text,''),
       CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) ELSE '' END AS definition,
       COALESCE((SELECT jsonb_agg(jsonb_build_array(a.attname, a.atttypid::text,
         a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)::text
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
         WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]') AS columns,
       COALESCE((SELECT jsonb_agg(pg_get_constraintdef(k.oid) ORDER BY k.conname)::text
         FROM pg_constraint k WHERE k.conrelid=c.oid),'[]') AS constraints,
       COALESCE((SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid)::text
         FROM pg_index i WHERE i.indrelid=c.oid),'[]') AS indexes,
       COALESCE((SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname)::text
         FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]') AS triggers
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND left(c.relname,3)<>'r3_'
  AND c.relkind IN ('r','p','v','m','f')
ORDER BY c.relname
""".strip()

FIXTURE_COUNT_SQL = "SELECT count(*) AS fixture_remaining FROM public.r3_runs WHERE run_id = ANY(%s::text[])"
PID_CLOSED_SQL = "SELECT count(*) AS open_count FROM pg_catalog.pg_stat_activity WHERE pid = %s"


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_statement(stmt: str, mutation_id: str | None, ids: set[str]) -> None:
    require(isinstance(stmt,str) and stmt.strip(), "empty SQL case")
    require(";" not in stmt and "--" not in stmt and "/*" not in stmt and "$$" not in stmt,
            "case must be one bare statement; SQL comments, procedural blocks and delimiters prohibited")
    require(BLOCK_SQL.search(stmt) is None, "transaction/control/DDL token prohibited in case SQL")
    m = DML.match(stmt)
    if m:
        require(bool(re.search(r"\bpublic\.r3_runs\b", stmt, re.I)), "mutation outside R3 table")
        require(mutation_id is not None and mutation_id in ids, "mutation lacks approved synthetic fixture ID")
        if m.group(1).upper() in ("UPDATE", "DELETE"):
            require(bool(re.search(r"\bWHERE\s+run_id\s*=",stmt,re.I)),
                    "UPDATE/DELETE must filter by synthetic run_id")
    else:
        require(mutation_id is None, "fixture_id supplied for non-DML case")
        require(bool(re.match(r"^\s*(SELECT|WITH)\b",stmt,re.I)), "only SELECT/WITH or fixture DML")


def validate_plan(plan: dict[str,Any]) -> None:
    require(plan.get("format") == 1, "unsupported case-plan format")
    require(plan.get("target_ref") == TARGET, "target ref mismatch")
    require(plan.get("environment") == "personal-dev/main", "environment mismatch")
    require(plan.get("migration_sha256") == MIGRATION_SHA256, "migration custody mismatch")
    ids=plan.get("fixture_ids")
    prefix=plan.get("synthetic_prefix")
    require(isinstance(prefix,str) and prefix.startswith("ocdb_tv1_") and ID_RE.fullmatch(prefix), "bad synthetic prefix")
    require(isinstance(ids,list) and len(ids)==4 and len(set(ids))==4, "require exactly 4 fixture IDs")
    require(all(isinstance(x,str) and ID_RE.fullmatch(x) and x.startswith(prefix) for x in ids),
            "fixture IDs must be distinct approved synthetic IDs")
    cases=plan.get("cases")
    require(isinstance(cases,list) and len(cases)>=16, "missing per-subcase approved plan (>=16 cases)")
    seen=set()
    for c in cases:
        require(isinstance(c,dict) and isinstance(c.get("id"),str) and CASE_RE.fullmatch(c["id"]), "invalid case ID")
        require(c["id"] not in seen,"duplicate case ID")
        seen.add(c["id"])
        require(c.get("role") in ALLOWED_ROLES, "unrecognized role")
        require(isinstance(c.get("params",[]),list), "params must be a JSON list")
        validate_statement(c.get("sql"), c.get("fixture_id"), set(ids))
        if c.get("fixture_id") is not None:
            require(c["fixture_id"] in c.get("params",[]), "synthetic run_id must appear in bound params")
        e=c.get("expect")
        require(isinstance(e,dict) and e.get("kind") in ("error","rows","rowcount"), "missing expected result")
        if e["kind"]=="error":
            require(isinstance(e.get("sqlstate"),str) and SQLSTATE_RE.fullmatch(e["sqlstate"]), "bad expected SQLSTATE")
            if e.get("constraint") is not None:
                require(bool(CONSTRAINT_RE.fullmatch(e["constraint"])), "bad expected constraint")
        elif e["kind"]=="rows":
            require(isinstance(e.get("rows"),list),"expected rows not supplied")
            for row in e["rows"]:
                require(isinstance(row,dict) and row.keys()<=SAFE_FIELDS,"unsafe result fields")
                for key,value in row.items():
                    safe_value(key,value,set(ids))
        else:
            require(isinstance(e.get("rowcount"),int) and e["rowcount"]>=0, "bad expected rowcount")
    for group in ("NEG-01/","NEG-02/","NEG-03/","NEG-04/","NEG-05/","NEG-06/",
                  "POS-INSERT/","POS-RETRY/","CAT/","PREFLIGHT/"):
        require(any(cid.startswith(group) for cid in seen),f"missing group {group}")


def safe_value(key: str, value: Any, approved_ids:set[str]) -> Any:
    if isinstance(value,bool):
        return value
    if isinstance(value,int) and not isinstance(value,bool):
        return value
    if value is None:
        return None
    if key in ("run_id","eligible_id") and isinstance(value,str) and value in approved_ids:
        return value
    # No opaque strings, JSON payloads, hashes, SQL text, secrets or arbitrary IDs in output.
    raise ValueError("non-scalar or non-synthetic result field")


def rows_from_cursor(cursor: Any, approved_ids:set[str]) -> list[dict[str,Any]]:
    desc=cursor.description
    require(desc is not None, "row query returned no columns")
    fields=[getattr(c,"name",c[0] if isinstance(c,(tuple,list)) else None) for c in desc]
    require(len(fields)==len(set(fields)) and all(x in SAFE_FIELDS for x in fields),"unknown/duplicate result columns")
    rows=cursor.fetchall()
    require(len(rows)<=12,"too many rows for sanitized evidence")
    return [{f:safe_value(f,v,approved_ids) for f,v in zip(fields,record)} for record in rows]


def sqlstate_of(e:Exception) -> str | None:
    value=getattr(e,"sqlstate",None) or getattr(e,"pgcode",None)
    return value if isinstance(value,str) and SQLSTATE_RE.fullmatch(value) else None


def constraint_of(e:Exception) -> str | None:
    value=getattr(getattr(e,"diag",None),"constraint_name",None)
    return value if isinstance(value,str) and CONSTRAINT_RE.fullmatch(value) else None


def snapshot(conn:Any) -> dict[str,Any]:
    cur=conn.execute(BASELINE_SQL)
    rows=cur.fetchall()
    canonical=json.dumps(rows,sort_keys=True,default=str,separators=(",",":"))
    return {"object_count":len(rows),"fingerprint_sha256":sha256(canonical.encode("utf-8"))}


def run_one(conn:Any,c:dict[str,Any],n:int,ids:set[str]) -> dict[str,Any]:
    ident=c["id"]
    role=c["role"]
    expected=c["expect"]
    savepoint=f"ocdb_case_{n:04d}"
    # All of SAVEPOINT, ROLE and ROLLBACK are generated here, never from the case plan.
    conn.execute(f"SAVEPOINT {savepoint}")
    status="FAIL"
    actual:dict[str,Any]={"sqlstate":"00000","constraint":None}
    raised:Exception | None=None
    try:
        if role!="owner":
            conn.execute(f"SET LOCAL ROLE {role}")
        try:
            cur=conn.execute(c["sql"],c.get("params",[]))
            actual["rowcount"]=cur.rowcount
            if expected["kind"]=="rows":
                actual["rows"]=rows_from_cursor(cur,ids)
        except Exception as e:
            raised=e
            actual={"sqlstate":sqlstate_of(e),"constraint":constraint_of(e),
                    "error_class":type(e).__name__}
        if expected["kind"]=="error":
            status="PASS" if raised is not None and actual["sqlstate"]==expected["sqlstate"] and (
                    expected.get("constraint") is None or actual["constraint"]==expected["constraint"]) else "FAIL"
        elif raised is None and expected["kind"]=="rows":
            status="PASS" if actual.get("rows")==expected["rows"] else "FAIL"
        elif raised is None and expected["kind"]=="rowcount":
            status="PASS" if actual.get("rowcount")==expected["rowcount"] else "FAIL"
    finally:
        if raised is not None or status!="PASS":
            conn.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
        conn.execute(f"RELEASE SAVEPOINT {savepoint}")
        if role!="owner":
            conn.execute("RESET ROLE")
    return {"case_id":ident,"role":role,"expected":{k:expected[k] for k in expected if k in ("kind","sqlstate","constraint","rowcount","rows")},
            "raw":actual,"status":status}


def execute_plan(plan:dict[str,Any],open_connection:Callable[[bool],Any]) -> dict[str,Any]:
    """Injection-friendly; open_connection(read_only) must open a BRAND-NEW connection.

    Status PASS requires successful main BEGIN, same-session ROLLBACK, close,
    subsequent fresh read-only cleanup, baseline match and old PID absence.
    """
    validate_plan(plan)
    result={"kind":"OCDB_TV1_HOSTED_DIAGNOSTIC","status":"FAIL", "generated_at_utc":utcnow(),
            "target_ref":TARGET,"migration_sha256":MIGRATION_SHA256,
            "scope":"SQL_NEG_AND_CATALOG_ONLY", "transport_retry_proof":"NOT_COVERED",
            "stored_envelope_digest_proof":"NOT_COVERED","cases":[],
            "tx":{"began":False,"same_session_rollback":"NOT_ATTEMPTED", "closed":"NOT_ATTEMPTED"},
            "fresh_cleanup":{"status":"NOT_ATTEMPTED"},"fatal_code":None}
    main=None; pid=None; baseline=None; begun=False; phase="CONNECT"
    try:
        main=open_connection(False)
        phase="BEGIN"
        main.execute("BEGIN")
        begun=True;result["tx"]["began"]=True
        main.execute("SET LOCAL statement_timeout TO '15000ms'")
        main.execute("SET LOCAL idle_in_transaction_session_timeout TO '60000ms'")
        phase="PID"
        pid_row=main.execute("SELECT pg_backend_pid() AS pid").fetchone()
        require(isinstance(pid_row[0],int),"missing backend pid")
        pid=pid_row[0]
        phase="BASELINE"
        baseline=snapshot(main)
        result["baseline_before"]=baseline
        phase="CASES"
        ids=set(plan["fixture_ids"])
        for n,c in enumerate(plan["cases"],1):
            case=run_one(main,c,n,ids)
            result["cases"].append(case)
            if case["status"]!="PASS":
                raise RuntimeError("CASE_MISMATCH")
    except BaseException as exc:
        # Includes KeyboardInterrupt/SystemExit: normal interrupts also reach cleanup.
        # SIGKILL or a host crash cannot be trapped and MUST be externally reconciled.
        # No error messages or SQL text: database errors might include credentials/payloads.
        result["fatal_code"]=f"{phase}:{type(exc).__name__}"
    finally:
        if main is not None:
            if begun:
                try:
                    main.execute("ROLLBACK")
                    result["tx"]["same_session_rollback"]="ACKNOWLEDGED"
                except Exception as exc:
                    result["tx"]["same_session_rollback"]="FAILED"
                    result["rollback_error_class"]=type(exc).__name__
            try:
                main.close()
                result["tx"]["closed"]="CALLED"
            except Exception as exc:
                result["tx"]["closed"]="FAILED"
                result["close_error_class"]=type(exc).__name__

    # A connection must be closed before new-session verification starts.
    check=None; checking=False; cleanup={"status":"FAIL","fresh_connection":False,
                                       "old_backend_pid_closed":False,"fixtures_remaining":None,
                                       "baseline_preserved":False}
    try:
        check=open_connection(True)
        require(check is not main, "reused main connection for cleanup")
        cleanup["fresh_connection"]=True
        check.execute("BEGIN READ ONLY")
        checking=True
        after=snapshot(check)
        cleanup["baseline_after"]=after
        cleanup["baseline_preserved"]=baseline is not None and after==baseline
        fixture_row=check.execute(FIXTURE_COUNT_SQL,(plan["fixture_ids"],)).fetchone()
        cleanup["fixtures_remaining"]=int(fixture_row[0])
        require(pid is not None,"missing original backend PID")
        pid_row=check.execute(PID_CLOSED_SQL,(pid,)).fetchone()
        cleanup["old_backend_pid_closed"]=(int(pid_row[0])==0)
        cleanup["status"]="PASS" if cleanup["baseline_preserved"] and cleanup["fixtures_remaining"]==0 and cleanup["old_backend_pid_closed"] else "FAIL"
    except Exception as exc:
        cleanup["error_class"]=type(exc).__name__
        cleanup["status"]="FAIL"
    finally:
        if check is not None:
            if checking:
                try:
                    check.execute("ROLLBACK")
                    cleanup["read_only_rollback"]="ACKNOWLEDGED"
                except Exception as exc:
                    cleanup["read_only_rollback"]="FAILED"
                    cleanup["status"]="FAIL"
            try:
                check.close()
                cleanup["closed"]="CALLED"
            except Exception as exc:
                cleanup["closed"]="FAILED"
                cleanup["status"]="FAIL"
    result["fresh_cleanup"]=cleanup
    allcases=len(result["cases"])==len(plan["cases"]) and all(x["status"]=="PASS" for x in result["cases"])
    if (allcases and result["tx"]["same_session_rollback"]=="ACKNOWLEDGED"
            and result["tx"]["closed"]=="CALLED" and cleanup["status"]=="PASS"
            and cleanup.get("closed")=="CALLED" and cleanup.get("read_only_rollback")=="ACKNOWLEDGED"):
        result["status"]="PASS_SQL_DIAGNOSTICS_ONLY"
    result["case_count"]={"observed":len(result["cases"]),"required":len(plan["cases"])}
    return result


def assert_approved_transport(dsn:str,plan_sha:str,release:dict[str,Any]) -> None:
    # These checks cannot authenticate a human signature. The auditor and SUB
    # must verify the release separately before invoking the CLI.
    u=urlparse(dsn)
    require(u.scheme in ("postgres","postgresql") and u.hostname==DB_HOST,
            "connection does not target approved exact project host")
    require(release.get("target_ref")==TARGET and release.get("environment")=="personal-dev/main",
            "release target mismatch")
    require(release.get("migration_sha256")==MIGRATION_SHA256,"release migration mismatch")
    require(release.get("plan_sha256")==plan_sha,"release plan hash mismatch")
    require(release.get("hosted_executor_approved") is True and release.get("safety_block_cleared") is True,
            "no explicit hosted executor/tool clearance")
    require(release.get("operator")=="OC-DB" and release.get("sub_scope_release")=="RECORDED",
            "operator/scope release not recorded")
    require(release.get("transport")=="DIRECT_POSTGRES_PSYCO-PG3_APPROVED",
            "transport not explicitly approved")


def main() -> int:
    parser=argparse.ArgumentParser(description="OC-DB unapproved hosted harness; --execute-hosted requires separate clearance")
    parser.add_argument("--plan",required=True,help="exact independently reviewed plan JSON (not bundled)")
    parser.add_argument("--reviewed-plan-sha256",required=True,help="out-of-band auditor-verified SHA256")
    parser.add_argument("--release-file",required=True,help="independently authenticated release record; operator must verify")
    parser.add_argument("--output",required=True,help="write sanitized JSON; NOT stdout")
    parser.add_argument("--execute-hosted",action="store_true",help="explicit only AFTER independent approval")
    args=parser.parse_args()
    if not args.execute_hosted:
        print("REFUSED: --execute-hosted absent; no network/DB action",file=sys.stderr)
        return 3
    plan_raw=Path(args.plan).read_bytes()
    plan_hash=sha256(plan_raw)
    if plan_hash!=args.reviewed_plan_sha256:
        print("REFUSED: reviewed plan hash mismatch",file=sys.stderr)
        return 3
    plan=json.loads(plan_raw)
    validate_plan(plan)
    release=json.loads(Path(args.release_file).read_text(encoding="utf-8"))
    dsn=os.environ.get("OCDB_DATABASE_URL","")
    if not dsn:
        print("REFUSED: database environment variable absent",file=sys.stderr)
        return 3
    assert_approved_transport(dsn,plan_hash,release)
    # Reserve output file BEFORE any connection. A crash keeps an INCOMPLETE record,
    # not silent loss of evidence. Use exclusive creation; no overwrite.
    out=Path(args.output)
    require(not out.is_symlink(),"output symlink forbidden")
    with out.open("x",encoding="utf-8") as f:
        json.dump({"status":"INCOMPLETE","target_ref":TARGET,"generated_at_utc":utcnow()},f)
        f.write("\n");f.flush();os.fsync(f.fileno())
    # Import and connect only after all gates, preserving zero network on validation failure.
    try:
        import psycopg  # must be installed and pinned by the approved operator
        def connection_factory(read_only:bool):
            # STRICT TLS hostname verification. Do not print DSN or driver errors.
            return psycopg.connect(dsn,autocommit=True,connect_timeout=8,sslmode="verify-full")
        result=execute_plan(plan,connection_factory)
    except BaseException as e:
        result={"status":"FAIL","fatal_code":"STARTUP:"+type(e).__name__,
                "target_ref":TARGET,"generated_at_utc":utcnow(),"cases":[],
                "transport_retry_proof":"NOT_COVERED","stored_envelope_digest_proof":"NOT_COVERED"}
    # Atomically replace INCOMPLETE with final sanitized evidence from a temp file.
    tmp=out.with_name(out.name+".finished.tmp")
    with tmp.open("x",encoding="utf-8") as f:
        json.dump(result,f,indent=2,sort_keys=True)
        f.write("\n");f.flush();os.fsync(f.fileno())
    os.replace(tmp,out)
    print("HOSTED_DIAGNOSTICS_STATUS="+result["status"]+"; evidence file created; no credential values logged")
    return 0 if result["status"]=="PASS_SQL_DIAGNOSTICS_ONLY" else 1


if __name__=="__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print("REFUSED:"+type(exc).__name__+" (details withheld)",file=sys.stderr)
        sys.exit(3)
