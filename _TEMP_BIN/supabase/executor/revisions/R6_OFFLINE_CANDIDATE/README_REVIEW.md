# R6 offline executor candidate

STATUS | LOCAL CANDIDATE; independent AUD pending. DB-5 BLOCKED; TV-1 UNVERIFIED; NO APPLY AUTHORIZATION.
OWNER | OC-DB; direct owner pasted assignment on 2026-10-21. Only this new revision and appended Supabase relay are in scope.
SYNC | GitHub main b4ba9fce24fd6f9e774fdfe679ee30144333b17a read through GitHub connection before work. See evidence/BASELINE.json.
PRIOR | R5 correspondence, P71 source/checklist and R4 proposal accepted offline. This candidate does not reissue those verdicts.
HISTORY | Frozen executor, P59, migration, R4/R5 and SOURCE_MANIFEST remain unchanged. The migration here is an exact data copy.
LIMIT | Historical driver_sha256=null remains UNVERIFIABLE. No historical evidence has been replaced or relabeled.

## Review surface

ENTRY | entry.py -> approved_entry.verify_candidate -> actual on-disk source/data/lock digest -> signed-release check -> platform gate.
CLOSURE | policy.SOURCE_PATHS defines the reviewed module universe. closure.source_closure parses every module's imports and traverses from entry.py.
REJECT | Missing/unexpected modules, unreviewed imports, dynamic import/eval/exec, altered paths, links/reparse points, data drift and dependency drift fail closed.
DIGEST | SHA256(domain prefix + canonical JSON of path/hash inventory and import edges). Exact recipe lives in closure.artifact_inventory.
AUTH | An inventory or lock is not authorization. Altered inventories need the original independent signer's signature; no production public root is configured.
DEPS | Installed cryptography/cffi/pycparser distributions, bytecode caches, native binaries, metadata and cffi helper are hashed. No dependency files are packaged.
RUNTIME | Python executable, stdlib including caches, extensions and runtime DLLs are locked. External immutable launcher/OS trust remains required; self-hashing cannot authenticate a replaced verifier.
LAUNCH | Use isolated Python without site startup hooks: python -I -S -B entry.py. No credentials, release path, transport or SQL arguments are accepted.
LOCK | dependency.lock.json is an observed Windows environment inventory for review, not a portable dependency installer or signer approval.
VERSIONS | New candidate uses installed Python3.12.10; cryptography50.0.0/cffi2.1.1/pycparser3.0. No install was performed. Original R3 dependency46.0.4 remains untouched.
PORTABILITY | Different Python/package bytes must reject the lock. Do not regenerate it to turn a failed authorization into PASS; another reviewed revision is required.
PLAN | Original 35-case plan normalized and matched to the accepted semantic digest 037215b0a2cb5e8df50e99e7bd56c1c015883f04bf0c964a22b62c37789ff2e2.
SQL | GuardedSession forwards only exact compiled SQL/parameter pairs; unknown roles, statements and parameters reject. No caller SQL is loaded from a release.
RUNTIME-DELTA | Runtime copy attempts fresh cleanup after driver/startup exceptions and closes both IPC endpoints on construction failure. Catalog/release verifier copies retain original bytes.
NEG05 | Six distinct negative IDs; legacy TRIAL-ELIGIBLE denotes PENDING_VALIDATION+ELIGIBLE. Literal TRIAL+ELIGIBLE is not asserted.
MOCKS | tests/fake_adapter.py derives from the retained R5 Windows fake. Every passing case/SQLSTATE/constraint here is simulated control-flow evidence.

## Reproduce offline

ROOT | Run from repository root. No network, database, credentials, package installs or external signing keys required.
TEST | python -I -B _TEMP_BIN/supabase/executor/revisions/R6_OFFLINE_CANDIDATE/run_tests.py
CHECK | Raw command vectors, exits and stdout/stderr are retained in evidence/. Failed attempts remain visible; final receipt identifies the submitted run.
SYNTAX | ast.parse is used without creating pycache. The production source closure rejects executable source cache additions.
MUTATION | Each candidate module and data/lock member is altered in disposable copies; original signed synthetic claims reject changed digests.
DEPS-NEG | Package/native transitive bytes are altered at the read boundary using mocks; installed package files are never edited.
IPC | Spawned fake children cover abnormal exit, broken pipes, startup exceptions, watchdogs, rollback/close errors and fresh cleanup.
LINK-LIMIT | Native Windows junction creation denied EPERM in this sandbox (retained R3 raw). Physical link test skipped; direct/root/ancestor reparse refusal tested with injected filesystem metadata. AUD must validate native link refusal separately.
CLEANUP | Fresh checks run after failures. Unknown PID, residual fixtures, baseline drift, cleanup errors or missing ACKs remain FAIL.
FILES | SHA256_MANIFEST.json pins source, tests, lock, documentation and evidence (excluding the manifest itself). ARTIFACT_INVENTORY.json pins executable closure.

## External blockers

B1 | No independently pinned production release signer/public trust root or signed release. Test signing keys exist in memory only and are never saved.
B2 | No supplied platform attestation format/verifier or normal tool/access clearance. platform_clearance_gate unconditionally rejects every input.
B3 | No actual permitted hosted SQL/session adapter. HostedSessionAdapter defines the contract but cannot construct/connect, even with fabricated approval fields.
B4 | No immutable external launch/runtime attestation or approved spawn-safe hosted factory. A future connected release needs both independently reviewed.
B5 | Remote relay commit was rejected by automatic approval review under the project no-push rule. No candidate commit/push or remote review request is claimed.
NEXT | AUD reviews the local pin and reruns tests independently. Publication requires explicit approval after the automatic-review rejection is resolved.
BOUND | No DB-5 apply, hosted TV-1, H8 upload, browser/model/site run, alternative SQL transport or retry of the safety-blocked operation occurred.

## AUD checklist

AUD | Check manifest bytes, complete local import graph and dependency/runtime inventory; reject any candidate code outside the signed closure.
AUD | Mutate entry/gate/adapter/policy/transitive modules/lockfiles; confirm digest/signature refusal. Check missing/extra files and junction rejection.
AUD | Rerun offline tests in the locked Windows runtime; distinguish raw simulated results from hosted evidence. Review unknown-PID cleanup failures.
AUD | Check no test-root/adapter injection exists in production entry API; public signer roots remain empty and platform gate remains unconditional.
AUD | Require a separately authenticated transport/attestation/launcher design and normal external approval before any future connected revision.
SUB | Integrates independent verdict only. Neither this candidate nor its local tests marks DB-5/TV-1 DONE.
