# R6 remaining requirements - external blocker checkpoint
MSG | id=OCDB-R6-REMAINING-20261021-01 | from=OC-DB | to=AUD,SUB | IST=2026-10-21 00:48:45 IST
SCOPE | Continue existing R6; preserve accepted disarmed LOCAL scope. No candidate code/data/lock/test/manifest changed; no suite rerun or prior-review repetition.
ACCEPTED | AUD-R6-01a15a1a-LOCAL-V1; report=_TEMP_BIN/supabase/evidence/AUD_R6_01a15a1a/REVIEW.md.
PIN | 39/39 unchanged; aggregate=23f126a0c3b718f3f58f629a5a27036d2ff42876c1f30b0845cb3c352cf003db. Receipt=PIN_CHECK.stdout.txt, command/exit in CHECKS.json.
SOURCE | artifact=72c69c31e687a7d28f75873c87137c28b603950c97c210f5846c259061e5ef51. Source findings already accepted offline; no new implementation defect established.
STATUS | BLOCKED_EXTERNAL_REQUIREMENTS; existing local ACCEPT retained. No connected-executor release, remote acceptance, hosted TV-1 proof or parent closure inferred.

B1 | Independent release signer / pinned public trust root missing. release_auth.TRUST_ROOTS remains empty by design; no production key supplied or invented.
B1-NEED | Authorized signer identity and independent trust-root provisioning/verification procedure; externally approved release binding exact artifact/plan/target/operator/baseline/time window.
B1-NEXT | Owner/security authority supplies real public-root provenance and authorized signer service; private keys stay outside repo/chat. Any source root installation needs a NEW revision + independent AUD.

B2 | No normal platform tool/access approval or defined attestation verifier/issuer contract is available for the previously blocked action.
B2-NEED | Actual approval from the normal platform route; authenticated attestation specifying issuer/trust, exact permitted tool/action/target/operator/release, expiry and connection binding. A local approved=true field is insufficient.
B2-NEXT | Platform/owner resolves access through normal approval; supplies actual contract for review. Worker does not generate attestation tokens, infer approval from signatures or retry the blocked operation.

B3 | No permitted concrete hosted session transport/adapter exists; current HostedSessionAdapter and platform gate deliberately refuse construction/calls.
B3-NEED | Approved transport contract supporting one physical transaction session, bound parameters, SET LOCAL ROLE, savepoints, SQLSTATE+constraint, rollback/close/cancel, backend identity and independent fresh cleanup session.
B3-NEXT | Platform/owner identifies and authorizes an actual supported API with those guarantees. Worker may then implement/mock-test it in a NEW pinned revision. No alternative SQL transport is selected to bypass the block.
B3-LIMIT | A stateless SQL tool cannot be assumed to preserve the required session/role/transaction lifecycle. Its capability must be established from the approved interface, not guessed.

B4 | Immutable external launch/runtime trust remains missing. Hash inventory alone does not authenticate a replaced entry/verifier or prevent filesystem TOCTOU/loader substitution.
B4-NEED | Independently trusted launch anchor/release verification location plus enforced immutable/read-only artifact/runtime custody, OS/native-loader search policy and process/child inheritance guarantees.
B4-NEXT | Deployment/security authority defines enforceable custody and verifier bootstrap; worker can implement within that real environment contract in a separately reviewed revision. Self-approved manifests are not sufficient.

B5 | Physical Windows junction/link refusal remains UNVERIFIABLE; worker and AUD native creation probes returned EPERM. Metadata-injected reparse controls passed.
B5-NEED | A permitted native filesystem test environment able to create disposable junction/symlink fixtures; independently retained refusal evidence for direct/root/ancestor links.
B5-NEXT | Owner/AUD provides the permitted environment and runs the physical control. No escalation, further creation retry or claim of native PASS is made here.

B6 | Publication remains blocked by the recorded automatic approval rejection under no-push instructions; candidate is uncommitted/unpushed.
B6-NEED | Explicit direct owner authorization recognized by normal review for committing/pushing only the accepted candidate and scoped Supabase relay/evidence. Existing rejection must be cleared before route reuse.
B6-NEXT | After clearance: sync actual main, preserve concurrent messages, publish scoped files without force push, record exact commit and reconcile accepted bytes at that commit before any remote acceptance.

NO-CODE | No in-scope connected adapter/signer/gate implementation can be completed faithfully until the missing real contracts above are supplied. Accepted disarmed R6 stays unchanged.
AUD-REQUEST | Review only this new blocker checkpoint + pin receipt for accuracy/scope. Do not repeat accepted R6/R5/P71/R4 suites or reissue hosted acceptance. Reply with precise correction if a real missing contract is already available.
SUB | Integrates existing local ACCEPT if appropriate; worker never marks DONE. This checkpoint changes no canonical parent status or permissions.
GATES | DB-5 BLOCKED | TV-1 UNVERIFIED | NO APPLY AUTHORIZATION. No credentials, hosted SQL/apply, upload/H8, transport bypass or publication retry.
