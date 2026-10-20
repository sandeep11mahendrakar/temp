# Independent AUD - OC-DB R5 Windows evidence
VERDICT | ACCEPT | supplied OFFLINE evidence integrity + source correspondence only.
IDENTITY | AUD:01a15a1a | session=01a15a1a-102a-7120-a673-b3a533d4a783 | IST=2026-10-20 21:53:09 IST
INDEPENDENCE | This session authored neither submitted executor nor submitted runtime logs; prior AUD verdicts not adopted.
TARGET | OCDB-R5-WIN-VR-SUB | DB-5/TV-1 offline evidence sub-scope; HEAD=487b226b905ecaa64241fef2f529357f52090fe2.
PIN | Evidence ZIP=4b1ae4e36151afd601e72411f2e65135cc9dcbb4ab197915e21ee8a4b60b7c5f.
SCOPE | Independent archive recomputation and static patch/naming inspection; NO packaged script or test suite executed.
COMMAND | python docs/evidence/db5-executor/ocdb-r5-independent-aud-01a15a1a/verify_evidence.py | exit=0 | raw=docs/evidence/db5-executor/ocdb-r5-independent-aud-01a15a1a/VERIFY_RAW.txt.
INTEGRITY | 4/4 outer checksums; CRC PASS for evidence outer/nested + companion/source archives. (VERIFY_RAW.txt)
SOURCE | Found C:/Users/sandeep/pes/temp/OC_DB_R5_ONE_GO_WINDOWS.zip; retained unchanged under audit evidence directory.
COMPANION | sha256=4b24cf06438c65e6880620017ac5e5ddc3d47461dbed3e954da76b60f38578c1. (VERIFY_RAW.txt)
SOURCE-ZIP | sha256=cae1405f07c68467914c2297443199c704a3e5df7d6f987244603fa85d5f5c01; matches submitted SUMMARY + DRIVER_METADATA.
SOURCE-MANIFEST | Independently verified37/37 lengths+hashes; exact entry coverage; aggregate=9b661be5edfb3c327514c62717b48ab1078fabb95fa01a050385cd4b3547d3f6.
HELPER | Actual helper sha256=214df1faa4b05f0776d8bafafbde2d2a4744a07fdf5657e8ebc3c80f7bb47082; matches nested DRIVER_METADATA.
DRIVER | Current companion PS1 sha256=f30b02b8c3a51c2acf73ec3d9d378625aabc8b1037630a5e352f87b857fd1669; historical evidence records no driver hash.
CUSTODY-LIMIT | Helper/source/patch correspondence established; exact historical PS1 invocation identity NOT established. Current driver hash cannot retroactively pin executed driver.
PATCH | Original fake d4e6245b2c2ca1222d4c95f6b965cd37100f7b02ede30ed9c01bc7e615837fe1; replacement32cbb6ad7c0deb0de9202404c10a3eac1e03524017c73ad9844e91d8f2ffb329.
PATCH-TEST | Added test dc42401d2a90b9b6a648908be23f1f905b83a34f9fe53fefa2e3486b62e0b3c7; all three hashes independently matched SUMMARY.
PATCH-REVIEW | Diff changes fake PID liveness only; query-only Windows OpenProcess/GetExitCodeProcess + CloseHandle; failures refuse unknown status. Two added liveness controls.
PATCH-SCOPE | Justified fake-only Windows process-handle correction. No executor/catalog/migration rewrite. Windows results describe patched extraction, NOT unchanged sealed R3 suite.
SUPPLIED-UNIT | Raw Windows unittest has48 test lines ending ok + Ran48 + terminal OK; native pipe-close case explicitly ok. Supplied log, not AUD runtime rerun.
SUPPLIED-JS | Raw local JS output has16 success lines; tests16/pass16/fail0/skipped0/cancelled0. Summary reports12/12 steps exit0. (VERIFY_RAW.txt)
NEG05 | Six unique raw cases match SQLSTATE23514 + expected constraint pairs; independently compared with frozen EXECUTABLE_CASE_PLAN.json; rollback fixture0/baseline preserved.
PROFILES | zero/six each36 PASS events +36 notices,35 unique IDs; CAT/SECURITY-INVOKER repeats for two distinct views, not an extra unique case. Statements59/66.
PROFILE-CONTROLS | Both exit0/errors[]; rollback.ok/close.ok/postcheck_closed/fresh_connection true; fixture_count0; inventory+fingerprint unchanged; baseline objects0/6.
CATALOG | Raw results assert r3_runs RLS=true and security_invoker=true on both named views. SQL hashes match the recovered frozen source. Local evidence only.
NAMING | Preserve NEG-05/TRIAL-ELIGIBLE; append alias NONRESEARCH-ELIGIBLE/PENDING_VALIDATION for clarity. Actual experiment_kind=PENDING_VALIDATION, eligibility=ELIGIBLE.
NAMING-PROOF | Source ZIP!src/case_catalog.py:91-100 explicitly documents intended isolated eligible_research_ids_ck control; frozen plan agrees.
TRIAL-COVERAGE | Separate NEG-05/TRIAL-PENDING uses TRIAL/PENDING_VALIDATION and records23514/r3_runs_trial_excluded_ck; NEG-06 selects eligible research only.
TRIAL-LIMIT | Do not relabel historical logs or claim historical TRIAL-ELIGIBLE directly tested TRIAL+ELIGIBLE. That exact combination is not shown by this case.
G1 | Independent count-only tracked-file scan excluding .env patterns: matched files0; git grep exit1=none. No credential values read or printed.
G4 | git remote -v empty; command exit0. G3 tests-added not assessed: no implementation/test delta submitted by this AUD.
LABEL | ASSISTED/OFFLINE; fake-session tests + isolated local PGlite supplied evidence; no agent-autonomy or hosted business-value claim.
LIMIT | This verdict does not approve the whole executor implementation or independently reproduce runtime authenticity. Vision/MCP suites not rerun for this evidence-only review.
BLOCKERS | No further artifact missing for this narrow evidence/source correspondence scope after companion recovery. Historical driver binding remains UNVERIFIABLE.
NEXT | SUB may integrate this scoped receipt, retain companion pin and append naming alias; do not infer full DB-5/TV-1 acceptance or request rerun solely for naming.
HOSTED | DB-5 remains BLOCKED; TV-1 UNVERIFIED. Hosted transport/stored digest/apply authorization, uploads, credentials and live releases remain outside scope.
SAFETY | Existing dirty work preserved; no source repair, board flip, hosted call, browser, upload, commit, push or deletion.
