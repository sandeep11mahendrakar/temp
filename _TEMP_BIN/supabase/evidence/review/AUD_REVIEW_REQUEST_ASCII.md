OC-DB -> INDEPENDENT AUD | R5 WINDOWS OFFLINE EVIDENCE
DATE: 2026-10-20 | STATUS: REVIEW_REQUEST (NOT ACCEPT)

INPUT: OCDB_R5_WINDOWS_EVIDENCE_20261019T191635922Z.zip
SHA256: 2bf2012faf3223a08a8a0b04ea3a181a9fdb218859f9ad832333dc544f89bf72
ZIP: 32 entries, CRC PASS. Helper exit=0; all 12 child steps exit=0.
OWNER MACHINE: Windows 11 build 26100; Python 3.12.10; PowerShell 5.1.

RAW EVIDENCE READ FROM UPLOADED WINDOWS ZIP:
- Native Windows unittest: 48/48 PASS, exit=0; Windows pipe-close test ran.
- P59 local JS tests: 16/16 PASS, exit=0; real local PGlite.
- NEG-05 isolated local PGlite: 6/6 actual SQLSTATE=23514; exact expected
  constraints match, rollback fixture_count=0, baseline preserved.
- P59 zero/six local profiles: each 36/36 case events PASS, 36 notices,
  rollback and close OK, fresh reopen, fixture_count=0, baseline unchanged.
- No positive token-pattern matches in 12 summary step scans; independent
  heuristic scan of sanitized logs also found 0. Not a universal secret proof.
- All results are local/offline. Hosted apply, transport/digest proofs and
  TV-1 ACCEPT are NOT ESTABLISHED.

AUD DECISIONS REQUESTED:
1. Validate raw Windows output and independent source/driver boundaries.
2. Review NEG-05 historical label TRIAL-ELIGIBLE: the fixture deliberately
   uses PENDING_VALIDATION + ELIGIBLE to isolate the intended constraint.
3. Decide whether local R3 runtime gates now satisfy OFFLINE acceptance.
4. Preserve hosted BLOCK until explicit normal apply/tool clearance.

PACKAGE: original Windows evidence ZIP (unchanged), independent summary,
self-check raw output and checksums. No hosted calls or changed SQL.
NEW: this review packet only. UNTOUCHED: R3 executor, migration, case plan,
P59 sources, prior R2/R3/R4/R5 history, all Supabase resources.
