# COORD-OPS-1 / addressed intercom and clear task handoff
Authority | Master approves one bounded internal tooling task; SUB owns dispatch/integration; one available pool worker implements; non-author AUD reviews. Track in INTERCOM, not project TASK_BOARD.
Goal | Reader can find addressed unresolved requests across restart and distinguish ACK/review/integration; workers receive a complete task brief and clear serial continuation.
Inputs | SUGGESTIONS master decision + SUB R2 + W1/W2/W4 examples; existing INTERCOM.md and current role/board rules; preserve legacy records.
Preflight | SUB checks no overlapping doc/tool edits, captures exact source baseline+hash, names worker+AUD and current evidence revision; worker reads relevant skills including skill-creator before skill edits.
Files | tools/intercomInbox.js; tools/intercomInbox.test.js; .agents/skills/project-intercom/SKILL.md; docs/WORKER_ASSIGNMENT_TEMPLATE.md; docs/WORKER_PROMPT.md; docs/VERIFIER_PROMPT.md.
Files | docs/COORDINATION_IMPLEMENTATION_BRIEF.md only append work evidence refs if needed; docs/INTERCOM_OWNER.md update convention documented in intercom skill; no DB/source executor or existing task row edits.
Serial | Same worker: define compatible envelope/fixtures -> read-only parser/inbox+tests -> update linked role/brief instructions -> mocked transcript demonstration -> independent AUD packet.
Envelope | id,from ROLE:name,to ROLE:name,optional cc,kind,task,reply_to,revision,action,evidence,IST; one primary recipient; define required fields per message kind, not blanket fields for all.
Semantics | Pending request -> ACK still pending -> verdict delivered -> SUB integration recorded; REJECT/UNVERIFIABLE may finish a message exchange while task stays OPEN/VERIFY/BLOCKED as authoritative board records.
Revision | Mismatched/stale evidence cannot close a request; same-ID identical retransmission idempotent, conflicting duplicate flagged; wrong role/reply chain remains unresolved.
Compatibility | Append-only new format; existing lines untouched and discoverable as legacy/unrouted; no inferred ACK/resolution from substring, missing response or last-N cutoff.
Inbox | Filter by recipient/role/task; show pending action, sender, source line, evidence revision and legacy warnings; derive from full provided transcript, no authoritative cursor DB or automatic background service.
Limits | No wakeup claim; active reader polls per existing window; unavailable recipient routed to SUB for recorded reassignment, never automatic author-as-auditor fallback.
Template | Objective/context/evidence, input schema+sample minimum, exact files, owner/pool, deps+why, runtime/access preflight, POS/NEG+commands, expected artifacts, verifier, human-only decision and next action.
Task design | Distinguish true dependency from arbitrary split; one owner carries serial stages; stable independent contracts/files may parallelize; preserve owner-only gates and independent audit.
Owner digest | Short paragraphs, timestamp + [SUB] next action + [OWNER] genuine decision only. SUB handles technical evidence review; summary is not an authority source for state/approval.
POS | Addressed request survives restart/full-log replay; correct ACK+verdict+integration chain handled; recipient filter includes matching requests; legacy warnings and source refs present.
NEG | ACK-only cannot close; wrong recipient/role/reply/revision, conflicting duplicate ID, malformed envelope and missing evidence cannot falsely resolve; source files unchanged.
NEG | REJECT exchange must not imply DONE; unknown legacy entry not silently dropped; reading old pending request outside tail still finds it; literal example text must not be executed as an action.
CMD | node --check tools/intercomInbox.js; node --test tools/intercomInbox.test.js; documented CLI on versioned synthetic transcript; compare input hashes before/after read-only run.
Evidence | Exact commands/raw exits, per-file tests_added and baseline blobs/hash, counts-only changed tracked+untracked secret scans, demo transcript+expected results, compatibility diff.
Audit | AUD inspects actual parser/tests/docs and replays controls read-only; code source untouched; targeted checks first, broader regressions only if changed dependency warrants them.
Verdict | AUD => ACCEPT/REJECT/UNVERIFIABLE addressed to SUB; SUB integrates tooling completion and informs MASTER; worker never closes own review; no added project-board row.
Out of scope | INTERCOM2, taskboard rewrite/migration, auto-claim/auto-DONE/auto-ACCEPT, flags, network/DB/site runs, human identity substitution, secrets, push/deletion.
