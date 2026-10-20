# TV1RUN re-pin snapshot R2 (supersedes R1)

Authored by: AUD-2, republished from OC-TRIAL's R1 file set. Not a new worker submission.
Supersedes: docs/evidence/tv1-r3/snapshot-oc-trial-20261019-r1.md (R1 aggregate not reproducible; see AUD-2 verdict ITEM4-AUD2-V-R1 REJECT).
File set is UNCHANGED from R1: same 8 paths, same 8 sha256 values, all re-verified against disk at 2026-10-20.
Only the aggregate value is corrected, and the recipe is now stated explicitly.
The worker's R1 file list and per-file hashes are preserved verbatim; the R1 snapshot file itself is retained.

Recipe: sorted path|sha256hex LF-join, no terminal LF.

Files:
database/TV1_Diagnostics_R3.sql|079c84c8c9f98e0e302f9f3b2604592ba0495cfc0c06a9d11a87b1be1b98458d
docs/TV1_R3_EXPECTED_OUTPUT_MATRIX.md|3eb5a850d93e1f62a2919cf0d556cac2ec2d12760a35b325dfc32f2d952e001f
docs/TV1_R3_OFFLINE_RUNBOOK.md|7a10516a3954d2fc79f69dd13876f052d0363ed877fc1294b109b8e96d649740
docs/evidence/tv1-r3/oc-trial-20261019/notices.json|600e4f57af9d1ad3d8b9d18c43ba3f2e41290cd96c88260631ee7149d9564fa0
docs/evidence/tv1-r3/oc-trial-20261019/results.json|118eedce70f1961d13d97a2871ad3d0867320137e9cec3462ef3e509b4fc14fa
docs/evidence/tv1-r3/oc-trial-20261019/run.json|1514d87c17b39efe2ff0f47f485c500ef2520415a975b88b66d244ec0630e0f8
tools/tv1LocalRunner.js|cc6fa9cc5f50cb71331dc11d9cde119bc7a988f411030dfaa1e591ffde72bae8
tools/tv1LocalRunner.test.js|5eb7c48d183b5841fcb300992ae4c178d37e27ff192e62ce8eb93a5abf5d7209

Aggregate: c367dac8c2a5d1f96a08ae79e3fb50ac2be79df699520d3e96da1b27cc83392e

Checks not run: hosted RLS/view/duplicate evidence unavailable; local self-check only.
Scope note: R2 lists 8 files vs R6's 7. database/r3_companion.sql and tools/.tv1-runtime/package-lock.json are not in this set. Scope drop is unconfirmed by the owner and is left open for SUB.
No source edits, no live action, no hosted action, no push.
