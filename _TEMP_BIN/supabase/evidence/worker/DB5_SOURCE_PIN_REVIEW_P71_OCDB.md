# OC-DB DB5-SRC-REVIEW | P71 | 2026-10-20 IST
STATUS: OFFLINE SOURCE REVIEW; NOT EXECUTOR ACCEPT; DB-5 BLOCKED; TV-1 UNVERIFIED.
REF: main setup c1fb2e1f2657cae8e485a285b50cf660989099e9.
EVIDENCE: SOURCE_MANIFEST.json; evidence/AUD_R5_ACCEPT_SCOPE.md; evidence/SUB_R5_INTEGRATION.md.
R5 AUD accepts source/evidence correspondence only. Windows 48, P59JS 16, NEG05 6 are supplied raw results, not AUD's independent runtime rerun. Historical executed PS1 binding remains UNVERIFIABLE (driver_sha256=null). Do not reopen naming/source recovery.

SOURCE PINS (SHA-256 from copied-file manifest; preserve bytes):
- executor/src/executor_runtime.py = 23c2b716d8a4450bfe3bd9662c0aeab1eaf4007c1cd1e2c42eb51db32bd6b1d1
- executor/src/case_catalog.py = 18e148754544f7b4755d2251272ea136a23d96f04162a69957d2cc63c6b35e4f
- executor/src/release_auth.py = 8306a2e84efeab9cc0a0aa7b158eb68860d141e0818fe8a42d7e15322c8088d2
- executor/src/approved_entry.py = dd9aab89f7192deba343348410587051d1ec72ed1a99f10ef25e9e3958076e66
- executor/src/bundle_auth.py = 014dd58f560ecbda381657028c33559580af170794ce1faaa67b5fd1f0b117f3
- executor/EXECUTABLE_CASE_PLAN.json = 62c71270669d2357a6e177a93281b15fb13d61ca8bb45fd23dcab08d6db3c7e6
- windows/OC_DB_R3_WINDOWS_OFFLINE_EVIDENCE_R5.py = 214df1faa4b05f0776d8bafafbde2d2a4744a07fdf5657e8ebc3c80f7bb47082
- windows/patches/fake_adapter.py = 32cbb6ad7c0deb0de9202404c10a3eac1e03524017c73ad9844e91d8f2ffb329
- executor/current_p59/database/r3_companion.sql = b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6
- P59 7-file aggregate revision = 87ef5658d907fa75b265ac4f3329d79383cf428f21be9cfe2f0f4a853d7b50e9

REQUIREMENT -> REVIEW OF READ-ONLY SOURCE:
R1 exact coverage: case_catalog.py hardcodes 35 IDs, SQL, params, expected SQLSTATE+constraint. 34 main and POST-ROLLBACK; JSON plan is mirror, not execution input.
R2 negative isolation: six distinct NEG05 new IDs + four base IDs allowlisted; actual PENDING_VALIDATION+ELIGIBLE under historic TRIAL-ELIGIBLE label. AUD accepted alias as descriptive reference; do not relabel historical results.
R3 scope: exact hardcoded SQL and parameters; role changes and mutation SQL target public.r3_runs; local controller includes catalog/RLS/view assertions. Auditor must review any future actual adapter's SQL transport enforcement.
R4 transaction: runtime runs BEGIN; savepoint per case; expected DB failures checked for SQLSTATE+constraint; rollback/close ACK; fresh read-only PID/prefix-zero and baseline hash; bounded parent child/cleanup watchdogs. These are proposed behaviors, not remotely exercised.
R5 trust: release_auth.py verifies Ed25519 exact claims/artifact/plan/target/expiry; TRUST_ROOTS={} and approved_entry.py accepts test-double adapter only. NO hosted adapter, production pinned signer, or platform clearance attestation. Source is deliberately disarmed.
R6 Windows: R5 helper and fake-PID patch are supplied and source-correspondent. They do not demonstrate historical executed PS1 SHA nor prove real hosted session behavior.
R7 baseline: executor fingerprints public non-R3 relation definitions; not a whole-database backup or validation of all schemas/data. Zero-team baseline must remain valid; never synthesize team tables.
R8 transport retry+hash validation and stored raw-envelope digest recomputation: explicitly NOT_COVERED by executor. Must receive distinct approved hosted proofs.

OPEN FOR INDEPENDENT AUD: Review R1-R8 against exact pinned source, including missing real adapter/real signer/hosted rollback. Return evidence-limited verdict and exact changes only if a genuine code defect is found. Do NOT self-release a new source revision.
UNCHANGED: frozen R3 executor/plan, R5 helper/patch/evidence, migration, SOURCE_MANIFEST, global task state, Supabase.
