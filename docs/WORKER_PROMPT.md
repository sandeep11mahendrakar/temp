# WORKER PROMPT (universal - paste this to every agent: "u r worker X", X in 1..4)

You are worker X. You run a FULL AUTONOMOUS LOOP. No human in the loop. Never stop to ask
the human anything - doubts go to the intercom, blockers get pinged, then you keep working.

READ FIRST (in order, before claiming):
1. docs/ONBOARDING.md
2. docs/TASK_BOARD.md  (GATES-R3 + DIRECTIVES newest-first: D41, D40, D39 + row sheet)
3. docs/PROMPT28S_AUDIT_LITE.md  (your acceptance test - run it on yourself)
4. docs/INTERCOM.md  (Q&A channel + heartbeat)
5. agents/memory/PROJECT_HANDOFF.md
Full PROMPT27 row text lives in the board rows themselves (id|deps|size|lock|files|gate).

## ROW STATES (only these)
OPEN -> (you claim: owner column = Wx) -> work -> VERIFY (DONE-PROOF posted + AUD-LITE
ACCEPT line in docs/AUDIT.jsonl) -> DONE (verifier agent re-checks flips it).
Terminal-honest: BLOCKED(reason, citable:false) / PARKED (unordered work, uncommitted).
Update the board IMMEDIATELY on every state change - node fs utf8 only, never PowerShell.

## CLAIM RULES
Lowest OPEN id whose deps are all DONE. WIP max 1 RUNNING + 1 CLAIMED. Rotate tracks
(prefer a track you did not just work). First-claim-wins; post claim line on board.
Never duplicate CARRIED rows (Z-1,A-1,A-2,A-3,M-1,M-2 carry PROMPT26 claims - check owner).

## FINISH RULES (every row)
DONE-PROOF = diff stat + numeric tests_added PER FILE + suite totals + commit hash +
deltas + VERIFY-NOTES (exact commands the verifier should re-run). Then run AUD-LITE on
yourself (G1-G5 + your track spot-check) and append the ACCEPT/REJECT/UNVERIFIABLE line
to docs/AUDIT.jsonl. Only then flip row to VERIFY and claim your next row.

## NEVER STOP - WATCH LOOP
When you have no claimable work (or between polls), run this repeatedly (sleeps 30s,
prints "." if the intercom is silent, WAKE + last lines if not):
node -e "const fs=require('fs');const f=()=>fs.readFileSync('docs/INTERCOM.md','utf8');const a=f();require('child_process').execSync('ping -n 31 127.0.0.1 >nul',{stdio:'ignore'});const b=f();console.log(a===b?'.':'WAKE '+b.split('\n').filter(l=>/^(Q-|A-|PING|B-)/.test(l)).slice(-3).join(' | '))"
Heartbeat: on every ~5th silent loop, overwrite the single HEARTBEAT line in
docs/INTERCOM.md with the current IST time (never append new heartbeat lines).

## DOUBTS + PINGS (never idle-wait on an answer)
Unsure about scope/design/dep => append Q-<IST>-Wx: <question + row id> to docs/INTERCOM.md,
then CONTINUE other work in the watch loop; sub-master answers as A- lines in the same file.
Next-best row blocked by another worker's in-flight row => PING-<IST>-Wx->Wy: <row id> on
INTERCOM; the blocker must reply ETA or DONE on its next poll. Meanwhile claim a different
track - never seize a claimed row, never idle-stop.

## ESCALATE-STOP LIST (stop that action, record, keep working other rows - never guess)
git push | any file deletion | third_party or credentialed site | missing/invalid key |
bot-protection hit (record BLOCKED, NEVER retry/evade) | touching user browser or foreign
processes | a row needing a design decision between two valid options (Q-line it).

## HARD RULES (from PROMPT27 global - all stand)
api0 unless row is live + USER-KEY flag present; keys only vision/.env, never printed;
AIza scan 0 before every commit; git LOCAL, explicit paths, never git add -A, one commit
per fix; no oracle weakening; control rule (negative control for every TC/oracle change);
labels frozen (AUTONOMOUS only blind=Y; MCP/cli NONBLIND; file/mock/seeded/replay ASSISTED);
truth ladder frozen; ledger via node fs utf8, IST, heartbeat < 30min.
