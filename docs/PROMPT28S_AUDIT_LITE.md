# PROMPT28-S: AUD-LITE (self-agent acceptance check)

Standing per-row acceptance for the mega-run. The full PROMPT28 audit still runs ONCE
at FIN-1 as the independent final gate (self-audit forbidden there). Self-audit IS
allowed here per user order; honesty rules unchanged.

WHO: the agent that finished the row (self) or any agent. READ-ONLY except
docs/AUDIT.jsonl (node fs utf8, 1 line/row). NO LLM api, NO keys, no repo edits.
WHEN: immediately after your DONE-PROOF, before STANDBY or your next claim.
NO-SHELL MODE (any model, paste-only): print `NEED: <exact command>` per check;
judge only from pasted raw output. Cannot run a check => UNVERIFIABLE + reason.

## GATES (every row, 1 command each)
G1 `git show --stat <hash>` => only your row's files/lock region; never .env/storage/testing/notes
G2 `grep -rE "AIza[0-9A-Za-z_-]{35}" docs sites vision/src vision/mcp vision/zoo` => 0 hits
G3 suites per docs/ONBOARDING.md => green and total >= claimed numeric
G4 `git status -sb` + `git remote -v` => local-only (nothing pushed), row files not foreign-dirty
G5 label rules: AUTONOMOUS only if blind=Y (select-only|generate); MCP/cli NONBLIND;
   file/mock/seeded/replay ASSISTED; BLOCKED rows carry citable:false

## ROW SPOT-CHECK (your track, 1-2 commands max)
Z: results rows >= row gate (Z-1 >=19/21, Z-5 >=90%) AND >=1 control row NOT-pass
A: exports carry detect/hints/expand/oracles AND detect<0.5 on >=1 unrelated fixture
   AND metrics line holds truth_coverage
V: new/changed tests green AND >=1 negative control proves a skipped action cannot PASS
M: `node --test mcp/*.test.js` green AND tool list matches row AND test proves no key echo
E: validator tests green AND flag-off test proves prompt byte-identical
R: validator accepts 1 good + rejects 1 bad sample AND golden-fixture numbers exact
S: validate script green on all seeded sites
Q: 3 consecutive suite runs => same totals (Q-1) / history secret scan 0 (Q-2) /
   docs exist and steps truthful (Q-3..Q-5)

## VERDICT (append exactly 1 line to docs/AUDIT.jsonl)
{"row":"<id>","aud":"ACCEPT|REJECT|UNVERIFIABLE","gates":"G1-G5 pass/fail","check":"<1-line spot-check result>","evid":"<command or path>","ts":"<IST>"}
ACCEPT => row VERIFIED (satisfies the row's PV requirement; never both <id>-V and AUD).
REJECT => reopen your OWN row, post reason on board, fix, re-run; never hide.
UNVERIFIABLE => reason (no shell / live HOLDER busy / gate absent); blocks VERIFIED.

## HONESTY (one sweep on your own paste)
Never write "autonomous" without (select-only|generate); never cite "100%"/"all pass"
for agent runs without truth tier; assisted/seeded results stay labeled assisted.
Any hit => your own row REJECTS until fixed.

RESUME next=claim (ACCEPT) | fix-loop (REJECT) | WAITING-USER (UNVERIFIABLE, take other rows).
