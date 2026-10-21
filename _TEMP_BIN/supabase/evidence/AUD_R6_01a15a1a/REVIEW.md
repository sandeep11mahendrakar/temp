# Independent R6 local candidate review
VERDICT | ACCEPT | DISARMED LOCAL OFFLINE CANDIDATE ONLY; native physical link refusal UNVERIFIABLE.
ID | AUD-R6-01a15a1a-LOCAL-V1 | session=01a15a1a-102a-7120-a673-b3a533d4a783 | IST=2026-10-21 00:44:27 IST
REQUEST | OCDB-R6-LOCAL-VR-20261021-01; human explicitly ordered source inspection and end-to-end review. Auditor independent of candidate author.
SCOPE | executor/revisions/R6_OFFLINE_CANDIDATE; no repair, prior R5/P71/R4 re-audit, publication, hosted execution or task-state integration.
BASE | Local HEAD=c1fb2e1f2657cae8e485a285b50cf660989099e9; candidate uncommitted. Remote main synchronization and eventual committed-pin equivalence NOT established.
PIN | Before and after suite: verify_pin.py exit0;39 files; aggregate=23f126a0c3b718f3f58f629a5a27036d2ff42876c1f30b0845cb3c352cf003db.
INDEPENDENT-PIN | Own static checker recomputed all hashes, exact file set, graph edges and artifact recipe; exit0. (STATIC_FINAL_RAW.txt; independent_static_checks.py)
ARTIFACT | 72c69c31e687a7d28f75873c87137c28b603950c97c210f5846c259061e5ef51;10 source modules/13 bound source+data+lock files. (STATIC_FINAL_RAW.txt)
COMMAND | python -I -B _TEMP_BIN/supabase/executor/revisions/R6_OFFLINE_CANDIDATE/run_tests.py | independent exit0;34 collected/33 pass/1 skip;325.546s.
TEST-PROVENANCE | Tool process20321, final chunk cc8a06; COMMAND_RECEIPT.json + TEST_TOOL_TAIL.txt. Tail is explicitly partial; no full fresh log claimed.
SYNTAX | Independent ast.parse15 Python files; historical SOURCE_MANIFEST82/82 hashes unchanged. (STATIC_FINAL_RAW.txt)
REVIEW | Read all10 production modules, runner, fake adapter, regression suite, pin checker and review contracts directly; inspected executor diff against frozen predecessor.
GRAPH-LIMIT | index_status/search_graph/check_index_coverage failed Transport closed; no graph coverage claim. Direct source reads + independent AST traversal used instead.
CLOSURE | entry reaches all10 declared modules; AST import edges and source/data hashes match ARTIFACT_INVENTORY. Extra/missing modules, import/cache/data mutations refuse. (src/closure.py:51; suite)
ORIGIN | verify_candidate binds executing root and loaded local module origins; source/plan/migration inventory precedes release verification. (src/approved_entry.py:14; suite)
ENTRY | -I -S -B required; no site hooks processed by production launcher; no environment release, SQL, credentials, transport or roots argument. CLI independently blocked exit2 in suite. (entry.py:8)
PACKAGES | Measured lock: cffi52 files, cryptography199, pycparser21; cffi-gen-src helper separately pinned; native/cache/metadata/unrecorded-file controls pass. (closure.py:102; STATIC_FINAL_RAW.txt; suite)
RUNTIME | Lock contains2719 runtime members + interpreter/DLL inventory; installed bytes match in independent tests. Isolated origin probe found intended purelib packages and DLLs for _ssl/_hashlib.
RUNTIME-LIMIT | This is an inventory, not immutable launch attestation. Loader search paths, OS trust and mutable-filesystem/TOCTOU assurance remain external gates; self-hashing cannot authenticate a replaced verifier.
SIGNER | TRUST_ROOTS={} remains; valid ephemeral claims cannot authorize actual entry. Each10 source +3 data/lock mutations invalidate original signed claims; signature/target/route/operator/time negatives pass. (release_auth.py:17; suite)
CLEARANCE | require_external_clearance always raises; fabricated approval and valid synthetic signed release cannot substitute. Adapter constructor and __call__ always block. (platform_clearance_gate.py:13; hosted_session_adapter.py:17; suite)
SQL | GuardedSession forwards compiled SQL/params/control roles only; unknown SQL, wrong params, postgres role and altered case plans reject. No caller SQL is taken from release JSON. (session_allowlist.py:23; suite)
PLAN |35-case normalized file digest independently matches037215b0a2cb5e8df50e99e7bd56c1c015883f04bf0c964a22b62c37789ff2e2. Catalog source unchanged. (STATIC_FINAL_RAW.txt; case_catalog.py)
NEG05 | Six unique IDs and isolated constraint predicates pass simulated controls; legacy TRIAL-ELIGIBLE is PENDING_VALIDATION+ELIGIBLE, not literal TRIAL+ELIGIBLE. No fresh PostgreSQL/SQLSTATE execution claimed. (case_catalog.py:91; suite)
DIFF | Runtime delta only: process construction inside try; both IPC handles closed; driver exceptions still attempt fresh cleanup. Catalog/release verifier remain byte-identical. (executor_runtime.py:221,291; direct diff)
FAILURE-CONTROLS | Guarded fake35 cases pass; wrong SQLSTATE, child exit, broken pipes/send, watchdog, startup/process construction, malformed PID, rollback/close failure, residual fixtures and baseline drift all stay FAIL. (suite)
CLEANUP | Fresh assertions/ACKs + old backend absence required; unknown PID cannot claim cleanup success. Failure path still attempts cleanup. Fakes certify control flow only. (executor_runtime.py:291; suite)
NATIVE-LINK | Fresh AUD junction creation failed EPERM; no permission escalation. Metadata-injected direct/root/ancestor reparse controls pass, physical refusal unproven. (NATIVE_LINK_PROBE.json; suite skip)
INTERIM-CHECK | Own first whole-folder check failed while suite mutation copies existed under evidence/fake-only-*; pinned-member drift0. Retained failure STATIC_CHECKS_RAW.txt; post-cleanup exact pin succeeds.
SECRETS | Source AIza-pattern count0; no .env read, credential access or secret value output. Literal synthetic fixtures are not hosted records.
REMOTE | git remote -v is nonempty (pre-existing origin); historical empty-remote G4 is not met in this shared relay checkout. No remote mutation/commit/push attempted; no local-only/no-remote claim.
NOT-RUN | Vision/MCP/hosted suites outside this candidate-only scope; no broad suite or hosted acceptance inferred. Historical82 custody is a hash check, not a rerun of prior accepted reviews.
FINDINGS | No blocking source defect found within this explicitly disarmed offline scope. Physical native-link behavior remains UNVERIFIABLE; external launcher/signer/attestation/adapter absence remains blocking for connected execution.
NEXT-SUB | Integrate only this local scope. Retain same39-file pin; after separate publication approval, sync main and reconcile eventual committed bytes before remote acceptance.
PUBLICATION | Prior automatic approval rejection under no-push rule is recorded in submitted request; this audit neither overrides it nor retries publication through any route.
GATES | DB-5 BLOCKED; TV-1 UNVERIFIED; H8/upload/access/apply/live/browser/model credentials remain outside scope. Local ACCEPT grants no deployment or publication authority.
PRESERVATION | Candidate source and frozen39-member pin unchanged; historical82 files unchanged; only own audit evidence and append-only Supabase relay written; no board/canonical state flip.
