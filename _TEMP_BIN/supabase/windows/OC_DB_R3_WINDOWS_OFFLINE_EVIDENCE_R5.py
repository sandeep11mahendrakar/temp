#!/usr/bin/env python3
"""OC-DB R5 independent local runtime evidence collector. NO remote/hosted access.

Usage on Windows:
  py -3 OC_DB_R3_WINDOWS_OFFLINE_EVIDENCE_R5.py "C:\\path\\OC_DB_P59_EXECUTOR_FROZEN_R3_AUD_REVIEW.zip"

Reads and verifies the exact frozen R3 ZIP, unpacks it to a temporary directory,
runs ONLY fixed offline tests, and saves raw output outside the archive.
No global install; offline-only local npm cache materialization into a
private disposable extraction. No network, credentials, or hosted SQL.
Known-pattern evidence is sanitized BEFORE persistent writes; detections fail closed.
Regex-only filters cannot guarantee detection of every possible credential format.
"""
from __future__ import annotations

import argparse
import csv
import io
import getpass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from zipfile import ZipFile

EXPECTED_ZIP_SHA256 = "cae1405f07c68467914c2297443199c704a3e5df7d6f987244603fa85d5f5c01"
EXPECTED_AGGREGATE = "9b661be5edfb3c327514c62717b48ab1078fabb95fa01a050385cd4b3547d3f6"
EXPECTED_MIGRATION = "b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6"
EXPECTED_MANIFEST_COUNT = 37
EXPECTED_ZIP_COUNT = 39
# Original archived fake-adapter hash and exact reviewed R5 local-only replacement.
ORIGINAL_FAKE_SHA256 = "d4e6245b2c2ca1222d4c95f6b965cd37100f7b02ede30ed9c01bc7e615837fe1"
R5_FAKE_SHA256 = "32cbb6ad7c0deb0de9202404c10a3eac1e03524017c73ad9844e91d8f2ffb329"
R5_TEST_SHA256 = "dc42401d2a90b9b6a648908be23f1f905b83a34f9fe53fefa2e3486b62e0b3c7"
SECRET_NAME_PATTERN = re.compile(r"(?:SUPABASE|SERVICE_ROLE|DATABASE_URL|PGPASSWORD|POSTGRES_PASSWORD|API_KEY|API_TOKEN|AUTHORIZATION|OPENAI_API_KEY|GITHUB_TOKEN)", re.I)
SECRET_VALUE_PATTERNS = [
    re.compile(rb"sb_secret_[A-Za-z0-9_-]{8,}"),
    re.compile(rb"Bearer\s+[A-Za-z0-9_.-]{16,}", re.I),
    re.compile(rb"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(rb"-----BEGIN\s+(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]


# Token patterns are intentionally conservative. All matches are counted and
# replaced in memory before writing evidence; original matched bytes are NEVER
# written to the output folder. Unexpected matches invalidate the run.
SECRET_VALUE_PATTERNS += [
    re.compile(rb"(?:postgres(?:ql)?|https?)://[^\s\"'<>]+:[^\s@\"'<>]+@", re.I),
    # Synthetic GitHub PAT families (classic/OAuth/user/server/refresh/fine-grained).
    # Deliberately no word-boundary assertions: arbitrary text may be
    # immediately adjacent to an embedded token (e.g. prefixghp_<payload>).
    # A boundary would silently persist such tokens. These are heuristic
    # detectors, not proof that all credential formats can be recognized.
    re.compile(rb"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})"),
    # OpenAI project/service-account and legacy sk-* credential families.
    re.compile(rb"sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}"),
    re.compile(rb"\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    re.compile(rb"(?i)(?:SUPABASE_SERVICE_KEY|PGPASSWORD|DATABASE_URL|API_KEY|API_TOKEN|GITHUB_TOKEN|OPENAI_API_KEY)\s*[=:]\s*[^\s,;\"']{8,}"),
]


def redact_bytes(raw: bytes) -> tuple[bytes, list[int]]:
    counts = []
    result = raw
    for pattern in SECRET_VALUE_PATTERNS:
        count = len(pattern.findall(result))
        counts.append(count)
        result = pattern.sub(b"[REDACTED_SECRET]", result)
    return result, counts


def restrict_private(path: Path, directory: bool = True) -> None:
    # Never continue if evidence ACL cannot be restricted to the process owner.
    if os.name == "nt":
        identity = subprocess.run(["whoami", "/user", "/fo", "csv", "/nh"],
                                  stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  timeout=8, check=True)
        row = next(csv.reader(io.StringIO(identity.stdout.decode("utf-8-sig", "replace").strip())))
        sid = row[-1].strip()
        if not re.fullmatch(r"S-1-(?:[0-9]+-)+[0-9]+", sid):
            raise RuntimeError("OWNER_SID_UNAVAILABLE")
        ace = "*" + sid + (":(OI)(CI)F" if directory else ":F")
        subprocess.run(["icacls", str(path), "/inheritance:r", "/grant:r", ace],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=12, check=True)
    else:
        path.chmod(0o700 if directory else 0o600)


def safe_save(out: Path, filename: str, raw: bytes) -> list[int]:
    clean, counts = redact_bytes(raw)
    path = out / filename
    with path.open("xb") as file:
        file.write(clean)
    restrict_private(path, False)
    return counts


def safe_json(out: Path, filename: str, value: dict) -> list[int]:
    return safe_save(out, filename, (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf8"))


def snapshot_windows_tree(pid: int) -> tuple[dict[int, str], bool]:
    # ProcessId + CreationDate prevent PID-reuse false positives. Query is
    # read-only and PID scoped; cannot kill any process on its own.
    command = ("Get-CimInstance Win32_Process | Select-Object ProcessId,"
               "ParentProcessId,CreationDate | ConvertTo-Json -Compress")
    try:
        p = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
                           capture_output=True, timeout=12, check=True)
        rows = json.loads(p.stdout.decode("utf8-sig", "replace"))
        if isinstance(rows, dict):
            rows = [rows]
        if not isinstance(rows, list):
            return {}, False
        info = {int(x["ProcessId"]): (int(x["ParentProcessId"]), str(x["CreationDate"])) for x in rows}
        tracked = {pid}
        for _ in range(len(info) + 1):
            added = {p for p, (parent, _) in info.items() if parent in tracked}
            if added.issubset(tracked):
                break
            tracked |= added
        return {p: info[p][1] for p in tracked if p in info}, True
    except (OSError, subprocess.SubprocessError, ValueError, TypeError, KeyError):
        return {}, False


def close_windows_tree(proc: subprocess.Popen) -> dict:
    before, before_ok = snapshot_windows_tree(proc.pid)
    try:
        action = subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                                capture_output=True, timeout=12, check=False)
        taskkill_exit = action.returncode
    except (OSError, subprocess.SubprocessError):
        taskkill_exit = None
    if proc.poll() is None:
        try:
            proc.kill()
        except OSError:
            pass
    try:
        proc.wait(timeout=8)
    except (OSError, subprocess.TimeoutExpired):
        pass
    # Even taskkill success is insufficient if any tracked PID survives.
    after, after_ok = snapshot_windows_tree(proc.pid)
    live = sorted(p for p, creation in before.items() if after.get(p) == creation)
    return {"taskkill_exit": taskkill_exit, "pre_snapshot_ok": before_ok,
            "post_snapshot_ok": after_ok, "tracked_pids": sorted(before),
            "survivor_pids": live, "cleanup_confirmed": before_ok and after_ok and
            not live and taskkill_exit == 0 and proc.poll() is not None}


EXPECTED_NOTICE_CASES = (
    'PREFLIGHT/OWNER', 'PREFLIGHT/ROLES', 'PREFLIGHT/TRIGGER', 'PREFLIGHT/BASELINE',
    'CAT/RLS', 'CAT/SECURITY-INVOKER', 'POS-INSERT',
    *('NEG-01/' + x for x in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ELIGIBLE-VIEW', 'READBACK-VIEW')),
    *('NEG-02/' + x for x in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ELIGIBLE-VIEW', 'READBACK-VIEW')),
    'NEG-03-SERVICE/UPDATE', 'NEG-03-SERVICE/DELETE', 'POS-RETRY', 'NEG-04/HASH-CONFLICT',
    'NEG-05/BAD-SCHEMA', 'NEG-05/BAD-ELIGIBILITY', 'NEG-05/TRIAL-ELIGIBLE',
    'NEG-05/MISSING-IDS', 'NEG-05/SELF-SUPERSEDES', 'NEG-05/TRIAL-PENDING',
    'NEG-06', 'NEG-03-OWNER-PREFLIGHT', 'NEG-03-OWNER-TRIGGER/UPDATE',
    'NEG-03-OWNER-TRIGGER/DELETE', 'FINAL-IN-TX', 'POST-ROLLBACK'
)
EXPECTED_CONSTRAINTS = {
    'NEG-04/HASH-CONFLICT': ('23505', 'r3_runs_pkey'),
    'NEG-05/BAD-SCHEMA': ('23514', 'r3_runs_schema_version_ck'),
    'NEG-05/BAD-ELIGIBILITY': ('23514', 'r3_runs_aggregate_eligibility_ck'),
    'NEG-05/TRIAL-ELIGIBLE': ('23514', 'r3_runs_eligible_research_ids_ck'),
    'NEG-05/MISSING-IDS': ('23514', 'r3_runs_eligible_research_ids_ck'),
    'NEG-05/SELF-SUPERSEDES': ('23514', 'r3_runs_supersedes_ck'),
    'NEG-05/TRIAL-PENDING': ('23514', 'r3_runs_trial_excluded_ck'),
}
for role in ('NEG-01', 'NEG-02'):
    for action in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ELIGIBLE-VIEW', 'READBACK-VIEW'):
        EXPECTED_CONSTRAINTS[role + '/' + action] = ('42501', None)
for case in ('NEG-03-SERVICE/UPDATE', 'NEG-03-SERVICE/DELETE'):
    EXPECTED_CONSTRAINTS[case] = ('42501', None)
for case in ('NEG-03-OWNER-TRIGGER/UPDATE', 'NEG-03-OWNER-TRIGGER/DELETE'):
    EXPECTED_CONSTRAINTS[case] = ('55000', None)


def parse_notice(message: str) -> tuple[str, dict[str, str]]:
    parts = message.split(' | ')
    attrs = {}
    for part in parts[1:]:
        if '=' in part:
            key, value = part.split('=', 1)
            attrs[key] = value
    return parts[0], attrs


def validate_p59_evidence(profile: str, evidence_dir: Path) -> dict:
    """Strict independent schema/result check; never trust self-declared exit alone."""
    details = {"profile": profile, "ok": False, "errors": [], "secret_counts": [], "case_count": 0}
    files = {}
    for name in ('run.json', 'notices.json', 'results.json'):
        file = evidence_dir / name
        if not file.is_file():
            details['errors'].append('MISSING_' + name.upper())
            return details
        raw = file.read_bytes()
        _, counts = redact_bytes(raw)
        details['secret_counts'].extend(counts)
        if any(counts):
            details['errors'].append('SECRET_DETECTED_' + name.upper())
            return details
        try:
            files[name] = json.loads(raw)
        except (ValueError, UnicodeError):
            details['errors'].append('INVALID_' + name.upper())
            return details
    run, notices, results = files['run.json'], files['notices.json'], files['results.json']
    if not isinstance(run, dict) or not isinstance(notices, list) or not notices or not isinstance(results, list) or not results:
        details['errors'].append('INVALID_EVIDENCE_TYPES')
        return details
    post = run.get('postcheck') or {}
    correct = (run.get('mode') == 'LOCAL_ISOLATED' and
               run.get('expectedBaseline') == profile and run.get('exit') == 0 and
               run.get('rollback', {}).get('attempted') is True and run.get('rollback', {}).get('ok') is True and
               run.get('close', {}).get('attempted') is True and run.get('close', {}).get('ok') is True and
               run.get('postcheck_closed') is True and post.get('fresh_connection') is True and
               post.get('fixture_count') == 0 and post.get('same_baseline') is True and
               post.get('same_team_rows') is True and
               run.get('baseline', {}).get('objects_n') == (0 if profile == 'zero' else 6) and
               not run.get('errors'))
    if not correct:
        details['errors'].append('RUN_CONTRACT_FAILURE')
    messages = [n.get('message') for n in notices if isinstance(n, dict) and isinstance(n.get('message'), str)]
    observed = {}
    for message in messages:
        cid, attrs = parse_notice(message)
        if cid in EXPECTED_NOTICE_CASES:
            observed.setdefault(cid, []).append((message, attrs))
    if set(observed) != set(EXPECTED_NOTICE_CASES):
        details['errors'].append('CASE_IDS_MISSING_OR_EXTRA')
    for case in EXPECTED_NOTICE_CASES:
        items = observed.get(case, [])
        n = 2 if case == 'CAT/SECURITY-INVOKER' else 1
        if len(items) != n or any(not msg.endswith(' | PASS') for msg, _ in items):
            details['errors'].append('NOTICE_COUNT_OR_PASS_' + case)
        if case in EXPECTED_CONSTRAINTS:
            state, constraint = EXPECTED_CONSTRAINTS[case]
            for _, attrs in items:
                if attrs.get('expected') != state or attrs.get('actual') != state:
                    details['errors'].append('SQLSTATE_' + case)
                if constraint and attrs.get('constraint') != constraint:
                    details['errors'].append('CONSTRAINT_' + case)
    # Cross-check emitted cases against the independently retained notice stream.
    cases = run.get('cases')
    if not isinstance(cases, list) or len(cases) != len(notices):
        details['errors'].append('RUN_CASES_ABSENT_OR_COUNT')
    else:
        for rcase, notice in zip(cases, notices):
            if not isinstance(rcase, dict) or rcase.get('case_id') != parse_notice(notice.get('message', ''))[0] or rcase.get('pass') is not True:
                details['errors'].append('RUN_CASES_NOTICE_MISMATCH')
                break
    case_rows = [row for chunk in results if isinstance(chunk, dict) for stmt in chunk.get('statements', [])
                 if isinstance(stmt, dict) for row in stmt.get('rows', []) if isinstance(row, dict)]
    ids = [row.get('case_id') for row in case_rows]
    for mandatory in ('CAT/RLS', 'CAT/VIEWS', 'POS-INSERT', 'POS-RETRY', 'NEG-06', 'FINAL-IN-TX', 'POST-ROLLBACK'):
        if mandatory not in ids:
            details['errors'].append('RESULTS_MISSING_' + mandatory)
    if not any(row.get('case_id') == 'CAT/RLS' and row.get('rls_on') is True for row in case_rows):
        details['errors'].append('RLS_ASSERTION_MISSING')
    if {row.get('relname') for row in case_rows if row.get('case_id') == 'CAT/VIEWS' and
           'security_invoker=true' in (row.get('reloptions') or [])} != {'r3_evidence_readback', 'r3_research_eligible'}:
        details['errors'].append('INVOKER_ASSERTION_MISSING')
    if not any(row.get('case_id') == 'POS-INSERT' and int(row.get('fixture_count', -1)) == 4 for row in case_rows):
        details['errors'].append('FIXTURE_COUNT_MISSING')
    if not any(row.get('case_id') == 'POS-RETRY' and int(row.get('row_count', -1)) == 1 for row in case_rows):
        details['errors'].append('RETRY_COUNT_MISSING')
    retry = observed.get('POS-RETRY', [])
    if len(retry) != 1 or retry[0][1].get('digest_unchanged') != 'true' or retry[0][1].get('inserted') != '0' or retry[0][1].get('row_count') != '1':
        details['errors'].append('RETRY_DIGEST_MISSING')
    insert = observed.get('POS-INSERT', [])
    if len(insert) != 1 or insert[0][1].get('fixture_count') != '4':
        details['errors'].append('INSERT_FOUR_MISSING')
    final = observed.get('FINAL-IN-TX', [])
    if len(final) != 1 or final[0][1].get('fixtures') != '4':
        details['errors'].append('FINAL_FOUR_MISSING')
    postnotice = observed.get('POST-ROLLBACK', [])
    if len(postnotice) != 1 or postnotice[0][1].get('fixture_count') != '0':
        details['errors'].append('POST_ZERO_MISSING')
    if not any(row.get('case_id') == 'POST-ROLLBACK' and int(row.get('fixture_count', -1)) == 0 for row in case_rows):
        details['errors'].append('ROLLBACK_RESULT_MISSING')
    if not all(isinstance(x, dict) and isinstance(x.get('statements'), list) for x in results):
        details['errors'].append('RESULT_CHUNKS_INVALID')
    details['case_count'] = len(observed)
    details['ok'] = not details['errors']
    return details


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def check_archive(path: Path) -> dict:
    before = sha256(path.read_bytes())
    if before != EXPECTED_ZIP_SHA256:
        raise ValueError("R3_ARCHIVE_SHA256_MISMATCH")
    with ZipFile(path) as z:
        names = z.namelist()
        if len(names) != EXPECTED_ZIP_COUNT or len(set(names)) != len(names):
            raise ValueError("R3_ARCHIVE_ENTRY_SET_MISMATCH")
        if z.testzip() is not None:
            raise ValueError("R3_ARCHIVE_CRC_FAILURE")
        for entry in z.infolist():
            p = PurePosixPath(entry.filename)
            if entry.is_dir() or p.is_absolute() or ".." in p.parts or "\\" in entry.filename:
                raise ValueError("UNSAFE_ARCHIVE_MEMBER")
            if entry.external_attr >> 16 & 0o170000 == 0o120000:
                raise ValueError("SYMLINK_NOT_ALLOWED")
            if entry.file_size > 20_000_000:
                raise ValueError("OVERSIZED_ARCHIVE_MEMBER")
        lines = z.read("FILE_SHA256_MANIFEST.txt").decode("utf8").splitlines()
        entries = []
        for ln in lines:
            m = re.fullmatch(r"([0-9a-f]{64})\s+(\d+)\s{2}(.+)", ln)
            if not m:
                raise ValueError("MANIFEST_FORMAT_FAIL")
            digest, length, name = m.groups()
            content = z.read(name)
            if len(content) != int(length) or sha256(content) != digest:
                raise ValueError("MANIFEST_FILE_MISMATCH:" + name)
            entries.append((name, digest))
        if len(entries) != EXPECTED_MANIFEST_COUNT or len(set(n for n, _ in entries)) != len(entries):
            raise ValueError("MANIFEST_COUNT_MISMATCH")
        if set(names) != set(n for n, _ in entries) | {"FILE_SHA256_MANIFEST.txt", "FROZEN_PACKAGE_METADATA.json"}:
            raise ValueError("MANIFEST_COVERAGE_MISMATCH")
        aggregate = sha256("\n".join(sorted(f"{name}|{digest}" for name, digest in entries)).encode())
        if aggregate != EXPECTED_AGGREGATE:
            raise ValueError("AGGREGATE_MISMATCH")
        migration = sha256(z.read("current_p59/database/r3_companion.sql"))
        if migration != EXPECTED_MIGRATION:
            raise ValueError("MIGRATION_MISMATCH")
    return {"zip_sha256": before, "zip_entries": len(names), "file_hashes_verified": len(entries),
            "aggregate_sha256": aggregate, "migration_sha256": migration}


def local_environment() -> dict:
    """Build a minimal child environment without forwarding credential variables."""
    allow = ("SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "PATH", "TEMP", "TMP",
             "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "APPDATA",
             "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMW6432", "NUMBER_OF_PROCESSORS",
             "PROCESSOR_ARCHITECTURE", "LANG", "LC_ALL", "TZ")
    env = {key: value for key, value in os.environ.items()
           if key.upper() in {name.upper() for name in allow} and not SECRET_NAME_PATTERN.search(key)}
    env["PYTHONPATH"] = os.pathsep.join(["src", "."])
    env["NODE_OPTIONS"] = ""  # do not inherit injected require/loader hooks
    return env


def kill_tree(proc: subprocess.Popen) -> dict:
    if os.name == "nt":
        return close_windows_tree(proc)
    if proc.poll() is None:
        try:
            proc.kill()
            proc.wait(timeout=8)
        except (OSError, subprocess.SubprocessError):
            pass
    return {"cleanup_confirmed": proc.poll() is not None}


def run_step(name: str, cmd: list[str], root: Path, out: Path,
             env: dict, seconds: int) -> dict:
    stdout, stderr, code, status = b"", b"", None, "INTERNAL_FAILURE"
    proc = None
    cleanup = {"cleanup_confirmed": True, "required": False}
    try:
        proc = subprocess.Popen(cmd, cwd=root, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            stdout, stderr = proc.communicate(timeout=seconds)
            code, status = proc.returncode, "EXITED"
        except subprocess.TimeoutExpired:
            cleanup = kill_tree(proc)
            cleanup['required'] = True
            try:
                stdout, stderr = proc.communicate(timeout=12)
            except subprocess.TimeoutExpired:
                cleanup = kill_tree(proc)
                cleanup['required'] = True
                stdout, stderr = b"", b"TIMEOUT_UNREAPED_PROCESS"
            code, status = 124, "TIMEOUT_KILLED"
    except OSError as exc:
        code, status = 127, "EXEC_START_FAILED:" + type(exc).__name__
    finally:
        if proc is not None and proc.poll() is None:
            cleanup = kill_tree(proc)
            cleanup['required'] = True
    # Redaction and detection run in memory, BEFORE persistent writing.
    out_counts = safe_save(out, name + ".stdout.sanitized.txt", stdout)
    err_counts = safe_save(out, name + ".stderr.sanitized.txt", stderr)
    args = []
    argv_counts = [0] * len(SECRET_VALUE_PATTERNS)
    for arg in cmd:
        cleaned, found = redact_bytes(str(arg).encode('utf8'))
        args.append(cleaned.decode('utf8', 'replace'))
        argv_counts = [prior + count for prior, count in zip(argv_counts, found)]
    counts = [a + b + c for a, b, c in zip(out_counts, err_counts, argv_counts)]
    if any(counts) or not cleanup['cleanup_confirmed']:
        status = "SECRET_DETECTED" if any(counts) else "UNCONFIRMED_PROCESS_CLEANUP"
    return {"step": name, "argv": args, "exit_code": code, "status": status,
            "timeout_seconds": seconds, "secret_pattern_counts": counts,
            "cleanup": cleanup,
            "sanitized_stdout": name + ".stdout.sanitized.txt",
            "sanitized_stderr": name + ".stderr.sanitized.txt"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("r3_zip", type=Path, help="Unchanged audited R3 ZIP")
    ap.add_argument("--output-parent", type=Path, default=Path.cwd(), help="Where to create a NEW evidence folder")
    ap.add_argument("--local-adapter-patch", type=Path, default=Path(__file__).resolve().parent / "patches" / "fake_adapter.py", help="Reviewed fake adapter for disposable local extraction only")
    ap.add_argument("--local-patch-test", type=Path, default=Path(__file__).resolve().parent / "patches" / "test_local_adapter_patch_r5.py", help="Reviewed native Windows regression for disposable extraction only")
    args = ap.parse_args()
    archive = args.r3_zip.expanduser().resolve()
    if not archive.is_file():
        print("INPUT_R3_ZIP_MISSING", file=sys.stderr)
        return 2
    args.output_parent.mkdir(parents=True, exist_ok=True)
    out = args.output_parent.resolve() / ("OC_DB_R3_LOCAL_EVIDENCE_" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    out.mkdir(exist_ok=False)
    restrict_private(out)
    status = {"status": "NOT_APPROVED", "context": "OFFLINE_LOCAL_ONLY", "hosted_sql": "NOT_RUN",
              "migration": "NOT_APPLIED", "windows_proven": False, "pglite_proven": False,
              "evidence_folder": str(out), "runtime": {"platform": platform.platform(),
              "system": platform.system(), "python": sys.version, "machine": platform.machine()},
              "steps": []}
    summary = out / "SUMMARY.json"
    def record() -> None:
        if summary.exists():
            summary.unlink()
        counts = safe_json(out, "SUMMARY.json", status)
        if any(counts):
            raise RuntimeError("SUMMARY_SECRET_DETECTED")
    try:
        status["input_integrity"] = check_archive(archive)
        if os.name != "nt":
            status["status"] = "BLOCKED_REQUIRES_NATIVE_WINDOWS"
            record()
            print("NATIVE_WINDOWS_REQUIRED; no tests launched", file=sys.stderr)
            return 77
        with tempfile.TemporaryDirectory(prefix="ocdb-r3-offline-") as temp:
            root = Path(temp)
            restrict_private(root)
            with ZipFile(archive) as z:
                z.extractall(root)
            # Apply a pinned local TEST DOUBLE correction in disposable extract only.
            # Do not update, rehash, or re-freeze R3 executable/catalog/migration.
            target_fake = root / "tests" / "fake_adapter.py"
            replacement = args.local_adapter_patch.resolve()
            target_test = root / "tests" / "test_local_adapter_patch_r5.py"
            test_patch = args.local_patch_test.resolve()
            if (sha256(target_fake.read_bytes()) != ORIGINAL_FAKE_SHA256 or
                sha256(replacement.read_bytes()) != R5_FAKE_SHA256 or
                sha256(test_patch.read_bytes()) != R5_TEST_SHA256 or target_test.exists()):
                raise ValueError("UNREVIEWED_LOCAL_TEST_PATCH_REFUSED")
            target_fake.write_bytes(replacement.read_bytes())
            target_test.write_bytes(test_patch.read_bytes())
            status["local_fake_adapter_patch"] = {
                "scope": "TEMP_EXTRACT_TEST_DOUBLE_ONLY",
                "original_sha256": ORIGINAL_FAKE_SHA256,
                "replacement_sha256": R5_FAKE_SHA256,
                "native_test_sha256": R5_TEST_SHA256
            }
            env = local_environment()
            env["TV1_TEST_EVIDENCE_ROOT"] = str(root / "tv1_case_evidence")
            runtime_dir = root / "current_p59" / "tools" / ".tv1-runtime"
            # Only inside this disposable extraction: create package.json from the
            # exact pinned lock and try the local npm cache. NO remote fetches.
            lock = json.loads((runtime_dir / "package-lock.json").read_text("utf8"))
            if (lock["packages"][""]["dependencies"] != {"@electric-sql/pglite": "0.5.10"} or
                lock["packages"]["node_modules/@electric-sql/pglite"]["version"] != "0.5.10"):
                raise ValueError("PGLITE_LOCK_VERSION_MISMATCH")
            package_json = {"name": "capstone-tv1-local-runtime", "version": "1.0.0",
                            "private": True, "dependencies": {"@electric-sql/pglite": "0.5.10"}}
            (runtime_dir / "package.json").write_text(json.dumps(package_json) + "\n", encoding="utf8")
            empty_npmrc = root / "offline-empty-user.npmrc"
            empty_npmrc_global = root / "offline-empty-global.npmrc"
            empty_npmrc.write_text("", encoding="utf8")
            empty_npmrc_global.write_text("", encoding="utf8")
            env.update({"npm_config_offline": "true", "npm_config_audit": "false",
                        "npm_config_fund": "false", "npm_config_ignore_scripts": "true",
                        "npm_config_update_notifier": "false", "npm_config_userconfig": str(empty_npmrc),
                        "npm_config_globalconfig": str(empty_npmrc_global)})
            status["steps"].append(run_step("pglite_pinned_npm_cache_only",
                ["npm.cmd", "ci", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
                runtime_dir, out, env, 120))
            # If offline npm cache lacks the exact pinned artifact, no fallback
            # network installation is attempted; PGlite proof will fail closed.
            steps = [
                ("python_unittest", [sys.executable, "-m", "unittest", "tests.test_frozen_executor", "tests.test_r3_repairs", "tests.test_local_adapter_patch_r5", "-v"], 240),
                ("p59_source_review", [sys.executable, "src/offline_review.py"], 60),
                ("simulated_rollback_probe", [sys.executable, "src/offline_probe.py"], 120),
                ("neg05_node_syntax", ["node", "--check", "tests/neg05_pglite_local_only.cjs"], 30),
                ("neg05_real_local_pglite", ["node", "tests/neg05_pglite_local_only.cjs"], 180),
                ("p59_runner_syntax", ["node", "--check", "current_p59/tools/tv1LocalRunner.js"], 30),
                ("p59_tests_syntax", ["node", "--check", "current_p59/tools/tv1LocalRunner.test.js"], 30),
                ("p59_real_local_tests", ["node", "--test", "current_p59/tools/tv1LocalRunner.test.js"], 240),
                ("p59_zero_local_sql", ["node", "current_p59/tools/tv1LocalRunner.js", "--self-check",
                   "--expected-baseline", "zero", "--evidence-root", str(root / "p59_positive_zero")], 240),
                ("p59_six_local_sql", ["node", "current_p59/tools/tv1LocalRunner.js", "--self-check",
                   "--expected-baseline", "six", "--fixture-baseline", "six",
                   "--evidence-root", str(root / "p59_positive_six")], 240),
            ]
            status["runtime"]["node_version"] = "NOT_READ"  # captured by separately bounded native step
            status["steps"].append(run_step("node_version", ["node", "--version"], root, out, env, 15))
            for name, cmd, timeout in steps:
                status["steps"].append(run_step(name, cmd, root, out, env, timeout))
            # Never treat a skipped dependency or one passing synthetic step as a pass.
            def ok(name: str) -> bool:
                return any(s["step"] == name and s["exit_code"] == 0 and
                           not any(s["secret_pattern_counts"]) and s["cleanup"]["cleanup_confirmed"] and s["status"] == "EXITED" for s in status["steps"])
            py_log = (out / "python_unittest.stderr.sanitized.txt").read_text("utf8", errors="replace")
            windows_test = "test_real_windows_spawn_close_before_and_during_poll"
            windows_ran = (windows_test in py_log and
                           not any(windows_test in line and "... skipped" in line for line in py_log.splitlines()))
            r5_windows_test = "test_dead_child_handle_open_but_process_inactive"
            r5_windows_ran = (r5_windows_test in py_log and
                not any(r5_windows_test in line and "... skipped" in line for line in py_log.splitlines()))
            status["windows_proven"] = ok("python_unittest") and windows_ran and r5_windows_ran
            pglite_log = (out / "neg05_real_local_pglite.stdout.sanitized.txt").read_text("utf8", errors="replace")
            expected_constraints = {
                "NEG-05/BAD-SCHEMA": "r3_runs_schema_version_ck",
                "NEG-05/BAD-ELIGIBILITY": "r3_runs_aggregate_eligibility_ck",
                "NEG-05/TRIAL-ELIGIBLE": "r3_runs_eligible_research_ids_ck",
                "NEG-05/MISSING-IDS": "r3_runs_eligible_research_ids_ck",
                "NEG-05/SELF-SUPERSEDES": "r3_runs_supersedes_ck",
                "NEG-05/TRIAL-PENDING": "r3_runs_trial_excluded_ck",
            }
            try:
                observed = json.loads(pglite_log)
                results = observed.get("results", [])
                exact = (len(results) == 6 and
                         {item.get("case_id") for item in results} == set(expected_constraints) and
                         all(item.get("pass") is True and item.get("actual_sqlstate") == "23514" and
                             item.get("actual_constraint") == expected_constraints[item["case_id"]] and
                             item.get("expected_constraint") == expected_constraints[item["case_id"]]
                             for item in results))
                cleanup_ok = observed.get("fixture_count_after_rollback") == 0 and observed.get("baseline_preserved") is True
                pglite_result = observed.get("pass") is True and exact and cleanup_ok
            except (ValueError, KeyError, TypeError, AttributeError):
                pglite_result = False
            status["pglite_proven"] = ok("neg05_real_local_pglite") and pglite_result
            def fresh_local_sql_ok(profile: str) -> bool:
                if not ok(f"p59_{profile}_local_sql"):
                    return False
                candidate = root / f"p59_positive_{profile}"
                result = validate_p59_evidence(profile, candidate)
                status[f"p59_{profile}_validation"] = result
                # Only sanitized outputs are retained. Original files remain
                # in the private disposable extraction until it is deleted.
                for name in ('run.json', 'notices.json', 'results.json'):
                    path = candidate / name
                    if path.is_file():
                        counts = safe_save(out, f"p59_{profile}_{name}", path.read_bytes())
                        if any(counts):
                            result['ok'] = False
                            result['errors'].append('SECRET_IN_RETAINED_' + name.upper())
                return result['ok']
            status["p59_zero_proven"] = fresh_local_sql_ok("zero")
            status["p59_six_proven"] = fresh_local_sql_ok("six")
            if (status["windows_proven"] and status["pglite_proven"] and ok("p59_real_local_tests") and
                status["p59_zero_proven"] and status["p59_six_proven"] and
                all(s["exit_code"] == 0 and s["status"] == "EXITED" and s["cleanup"]["cleanup_confirmed"] and not any(s["secret_pattern_counts"]) for s in status["steps"])):
                status["status"] = "LOCAL_EVIDENCE_COLLECTED_INDEPENDENT_AUD_REQUIRED"
            else:
                status["status"] = "INCOMPLETE_OR_FAILED_LOCAL_EVIDENCE"
        status["input_integrity_after"] = sha256(archive.read_bytes())
        if status["input_integrity_after"] != EXPECTED_ZIP_SHA256:
            status["status"] = "INPUT_ARCHIVE_CHANGED_REFUSE"
        record()
        return 0 if status["status"] == "LOCAL_EVIDENCE_COLLECTED_INDEPENDENT_AUD_REQUIRED" else 1
    except Exception as exc:
        status["status"] = "FAIL_CLOSED_EXCEPTION"
        status["error_type"] = type(exc).__name__
        # Do not print exception detail; it might contain user-controlled data.
        record()
        print("FAIL_CLOSED_EXCEPTION:" + type(exc).__name__, file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
