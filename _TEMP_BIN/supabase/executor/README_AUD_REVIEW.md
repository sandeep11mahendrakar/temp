# OC-DB P59 — Frozen Executor Repair R3 — INDEPENDENT AUD REVIEW REQUEST

**Status:** OFFLINE PREPARATION / UNEXECUTED / NOT APPROVED / DB-5 BLOCKED.
**Submit to:** `AUD:AUD-1` (and independent AUD-2 TV-1 evaluator after hosted proof), by SUB as ordinary coordination; this package does not send an INTERCOM message or self-issue ACCEPT.

## Source custody and unchanged migration

- Approved target identity (owner/SUB only): `capstone-r3-dev`, `xvizjawcpafdqrygzvcx`, `qwgbhcakpfwytcrryuxd`, region `ap-south-1`, personal dev, shared=N, main project. OC-DB operator designation does **not** clear the safety-blocked apply tool.
- Migration `current_p59/database/r3_companion.sql` unchanged. SHA-256: `b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6`.
- P59 pinned local source revision unchanged: `87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9`; `src/offline_review.py` reports 7/7 files, 35/35 IDs.
- This package cannot apply a migration, connect to Supabase, connect to any network or authorize a new transport. No credentials or production trusted release key are included (`TRUST_ROOTS={}`).
- Previous R2 ZIP remains untouched and REJECT is documented in `R2_REJECT_HISTORY.md`.

## R3 fixes for the two REJECT findings

1. **Windows IPC closure**: `src/executor_runtime.py` handles `BrokenPipeError`, `EOFError` and `OSError` from BOTH `poll()` and `recv()`, including while draining pending messages after child exit. Available events are retained. Clean zero-exit, exactly one terminal event and complete case/evidence ACKs are all mandatory for PASS. Nonzero exit, incomplete events, malformed event, send failures, stalled rollback or close => FAIL. Child `emit()` is best effort so pipe shutdown does not bypass transaction rollback/close. Existing process and cleanup watchdogs remain bounded.
2. **NEG-05 isolation**: `src/case_catalog.py` defines four successful base fixture IDs **plus six new, disjoint explicitly allowlisted invalid-attempt IDs**. Each NEG-05 uses the eligible source's field values, assigns its own new run_id, updates manifest and report nested IDs and changes one intended constraint predicate. All six expect driver SQLSTATE `23514` and exact named constraint; no row-ID primary-key collision and no reliance on constraint evaluation order. The reserved prefix collision/cleanup queries already cover all ten IDs.

**AUD decision needed on source naming:** The original P59 label `NEG-05/TRIAL-ELIGIBLE` remains unchanged in the 35-case list, but *literal* TRIAL+ELIGIBLE necessarily violates TWO constraints. To uniquely test the intended `eligible_research_ids` CHECK, R3 uses `PENDING_VALIDATION+ELIGIBLE`. The test assertion ID has historical wording; AUD should accept the explicit semantic correction or request a separately approved renamed source case. This R3 package makes no claim to a unique literal TRIAL+ELIGIBLE constraint failure.

## Changed/new paths compared with rejected R2

- Changed: `src/executor_runtime.py`; `src/case_catalog.py`; `EXECUTABLE_CASE_PLAN.json`; `P59_ATOMIC_CASE_MAPPING.md`; `README_AUD_REVIEW.md`; `FILE_SHA256_MANIFEST.txt`; `FROZEN_PACKAGE_METADATA.json`.
- Added: `tests/test_r3_repairs.py`; `tests/neg05_pglite_local_only.cjs`; `src/offline_probe.py`; `R2_REJECT_HISTORY.md`; `R3_REPAIR_SUMMARY_AND_AUD_REQUEST.md`; `artifacts/R3_*` (verbatim outputs, version report).
- Historical R2 evidence retained and named: `artifacts/R2_HISTORICAL_*` (unchanged file content).
- All files under `current_p59/`, original migration and `release_auth.py` remain byte-identical.

## Exact offline commands and observed limits

Run from the extracted package root, on Linux with Python 3.13.5 and cryptography 46.0.4 (see `artifacts/R3_RUNTIME_VERSIONS.json`):

```sh
PYTHONPATH=src:. python -m unittest tests.test_frozen_executor tests.test_r3_repairs -v
PYTHONPATH=src:. python src/offline_review.py
PYTHONPATH=src:. python src/offline_probe.py
node tests/neg05_pglite_local_only.cjs
```

- First command: **exit 0; 46 tests; 45 PASS, 1 SKIPPED (Windows-only)**; full raw output in `artifacts/R3_FULL_UNITTEST_RAW_LINUX.txt`.
- Second command: **exit 0; 7/7 source hashes, 35 exact case IDs**; output in `artifacts/R3_SOURCE_INTEGRITY_RAW_LINUX.txt`.
- Third command: **exit 0; fake 35/35 control-flow, rollback ACK, close ACK, fresh read-only cleanup fixture count 0 and baseline unchanged**; output in `artifacts/R3_FAKE_TRANSACTION_CLEANUP_RAW_LINUX.txt`. These are simulated adapter observations ONLY.
- Fourth command: **exit 77 SKIPPED**. The exact pinned PGlite 0.5.10 dependency is not installed in this offline container; there is no local PostgreSQL server. The six revised constraints **have NOT been exercised against real local PostgreSQL/PGlite**, so real SQLSTATE+constraint verification remains unproved. See `artifacts/R3_NEG05_PGLITE_ATTEMPT_RAW_LINUX.txt`. The local-only script is included for subsequent independent offline execution with pinned PGlite.
- **Windows is unavailable in this session**. Simulated Windows BrokenPipeError on poll and child closure with spawned processes were tested on Linux. A real Windows subprocess run, its output and exit codes **are required** before claiming Windows fixed; **NOT RUN** here.

On the owner's Windows offline workstation, reviewer can use the following exact PowerShell commands, after setting up only the pinned local dependencies:

```powershell
Set-Location <EXTRACTED_R3_PACKAGE_PATH>
$env:PYTHONPATH = "src;."
py -3 -m unittest tests.test_frozen_executor tests.test_r3_repairs -v
py -3 src/offline_review.py
py -3 src/offline_probe.py
node tests/neg05_pglite_local_only.cjs
```

These are **instructions, not performed commands**. Capture raw stdout/stderr and `$LASTEXITCODE`, including Windows-specific regression and PostgreSQL/PGlite output, before sending for independent AUD review.

## Review boundaries

- Every hosted SQL result and `TV-1 ACCEPT` remains **NOT RUN / NOT ISSUED**.
- Only an independently approved adapter and explicit platform tool clearance may be considered; a signed test record cannot bypass the prior restriction.
- The independently approved hosted adapter must handle real session closure, session-local role changes, SQLSTATE/constraint capture, rollback after any error, fresh cleanup and baseline preservation. Fake tests cannot certify database or network behavior.
- Transport retry/hash proof and source-byte payload digest recomputation are separate requirements and are not covered here.
- Post-rollback cleanup is fail-closed if a fixture remains, baseline drifts, the old PID persists, a watchdog fires, or a required case/ACK is missing. Power loss cannot guarantee cleanup; separate operational reconciliation is required.

**Request to AUD:** Review R3 source diff, ten-ID allowlist, six single-constraint attempts and retained case names, pipe error handling, test artifacts and integrity manifest; request native Windows and local PGlite proof before endorsing Windows/SQLSTATE fixes. No ACCEPT, apply release or DB-5 DONE is requested or implied.
