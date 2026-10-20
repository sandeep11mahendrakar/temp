# SUB coordination onboarding

AUTH | This guide is navigation, not a role grant, assignment, claim, verdict or live release.
BOOT | Use actual assigned identity/session. Read AGENTS.md, CODEX_PROJECT_MEMORY.md and project-submaster skill first.
RUN | node tools/subOnboard.js
FOCUS | node tools/subOnboard.js --task=T-4 --limit=6
SCRIPT | Read-only; prints source hashes, pending-request refs and warnings. No send/write/claim/test/network/env/live action.
LIMIT | Parser results are navigation. Historical malformed messages, recent directives and actual board state require manual reading.
READ | Board top + assigned/current nonterminal region; Intercom last40 + pending/cited lines. Load project-taskboard/intercom/caveman skills.
STATE | Current board/directives > latest relevant Intercom > evidence ledgers > docs/memory. Read dates/scopes before treating records as superseded.

## Roles and scope
MASTER | Plans/tasks/owner policy. Existing master authority must be verified; SUB does not self-promote.
SUB | Own shared coordination, reconcile file locks, route blocked work and integrate exact independent verdicts.
WORKER | Own bounded implementation + self-check + frozen proof; request VERIFY, never self-ACCEPT or set DONE.
AUD | Independently inspect exact bytes and controls; return verdict with smallest actionable repair; never implement reviewed change.
OWNER | Reserved decisions/access/releases remain human-only. A prior valid decision persists for the same scope until revoked.
DESIGN | Keep four roles. Use task-local responsibility labels such as offline implementer or hosted operator; do not create another permanent role.
SMALL | SUB may implement an owner-authorized small repair; name SUB as author and use a different AUD. No self-acceptance.

## Start or resume
01 | Inspect git status --short; preserve dirty/untracked files. No reset, clean, stash, deletion, push or broad staging.
02 | Discover existing chats with list_threads; verify role, session, capability and latest actual assignment before routing.
03 | Check owners, exact file locks, deps with reasons and current live HOLDER. A thread title is not an identity or scope grant.
04 | Reuse current task ID and accepted partial evidence. Never make a duplicate row to escape a gate or REJECT.
05 | Distinguish code/CLI integration/runtime/hosted proof/owner release. Code-only DONE does not prove full-lane readiness.
06 | Reuse proven owner approvals in unchanged scope. New target/operator/transport/live action needs its actual applicable authority.
07 | If access/credentials are missing, continue eligible offline work; send one precise owner decision packet only when needed.
08 | For external OpenCode/web sessions, give a portable packet or ask owner to paste. Do not claim an unavailable DM was sent.

## Compact task capsule (ASCII; exact executable payload remains unchanged)
V=1 | role=WORKER:<actual-id> | task=<existing-id> | scope=<offline|runtime|hosted>
GOAL=<one observable outcome> | BASE=<commit-or-manifest> | EVIDENCE=<path:line>
OWN=<exact files/modules> | EXCLUDE=<shared or frozen paths> | LOCK=<recorded authority>
INPUT=<producer/schema/sample> | OUTPUT=<consumer/schema/artifact> | DEPS=<id:why>
PREFLIGHT=<runtime/cwd/access/capability> | POS=<command + expected result>
NEG=<command + expected refusal> | AUD=<non-author identity> | NEXT=<actor:action>
STOP=<actual gate/failure boundary> | RETURN=<hashes/raw exits/proof/limits>
DM=<authorized recipients/purpose> | IDLE=<only if current directive requires a bounded watch>
RULE | Use standard keys/identifiers; no invented abbreviations, binary/hex prose, omitted negations or ambiguous compression.
FORMAT | Agent packets/logs ASCII, one claim/line, <=300 chars/line, IST. Use explicit paths, units and statuses.
CODE | Preserve code, SQL, commands, paths, schema keys, errors and user-language requirements exactly.

## Review and repair loop
FREEZE | Save baseline and submitted file hashes before review; one current request per task/scope/revision.
PROOF | Retain raw stdout/stderr safely, exit codes, environment/version and known limits; no secrets or immutable archive rewrite.
ENVELOPE | Require id/from/to/kind/task/reply_to/revision/evidence/IST; action required for ACK/VERDICT/INTEGRATED.
LENGTH | Short evidence alias may point to a separate pinned artifact line. Never omit IST to fit the line limit.
VALIDATE | Before append, check required fields, ASCII and <=300 chars; replay parser against proposed transcript without changing live files.
REQUEST | Worker -> AUD, kind=VERIFY_REQUEST, exact revision + POS/NEG/evidence. Canonical record first, one authorized actionable DM.
ACK | Receipt in canonical Intercom if required; no ACK-only DM, no acceptance implied.
VERDICT | AUD -> SUB, ACCEPT/REJECT/UNVERIFIABLE with exact scope/revision and evidence. DM author only when their action is required/authorized.
REJECT | Worker repairs smallest in-scope defect; new bytes require new pin/request. Record old REJECT; do not silently edit its evidence.
INTEGRATE | SUB verifies source pin + independent verdict; record DONE/HOLD/REPAIR for that scope. Full row closes only when its actual gates pass.
RECHECK | Prior accepted evidence remains usable only if its source, runtime and contract assumptions still hold; changed boundaries need targeted recheck.
CAP | Follow current loop budget; if none exists, propose a bounded next step rather than endless self-triggered reminders.

## Routing and quiet operation
DM | Send only actionable blocker/conflict, essential clarification or final verdict needing repair/integration. No routine progress/ACK/heartbeat.
RESOLVE | Workers decide routine implementation choices inside scope. Escalate only the decision another actor must make.
ONE | One primary recipient per request. Duplicate delivery must reuse the same unchanged ID; changed payload requires a new ID.
QUIET | Silence is not permission, acceptance or completion. Do not wake another chat merely to request an update.
TIMER | If a watch is authorized, new substantive work cancels idle wait; finish/checkpoint, then restart idle timer. Own polls do not reset it.
DURABLE | TASK_BOARD=effective state/claim; INTERCOM=durable decisions/proof; DM=discussion; INTERCOM_OWNER=digest only.

## Stop boundaries
HOSTED | Confirm exact target/operator/access and approved executor. Offline PASS never authorizes hosted SQL or bypasses a rejected tool call.
LIVE | Confirm current HOLDER, accepted wiring, actual preflight and recorded release. Browser probe is not a trial or model-call authorization.
DATA | Missing evidence => NOT_RECORDED+reason; zero/false remain real. Never turn missing verdict/cause into PASS or GO.
CLOSE | Return scoped result, proof refs, remaining blocker, responsible next actor and resume condition. Do not reprint history.
