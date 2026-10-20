# SUB receipt / OC-DB R5 Windows evidence
IST=2026-10-20 21:46 IST
SCOPE | Evidence integrity/readback only; supplied log inspection, not independent code execution or TV1 acceptance.
ZIP | sha256=4b1ae4e36151afd601e72411f2e65135cc9dcbb4ab197915e21ee8a4b60b7c5f | matches owner value; outer4/4 published file checksums and outer/nested CRC pass.
LOGS | Native Windows unittest reports48 cases, including real Windows pipe closure; P59 log reports16 pass/0fail; NEG05 JSON6/6 exact SQLSTATE23514+constraint pairs.
PROFILES | Raw zero/six run JSON: exit0/errors[], rollback.ok/close.ok, fresh_connection=true, fixture_count0, baseline fingerprint unchanged; each noticeCount36.
LIMIT-1 | Original R3 source ZIP is absent. SUMMARY references source zip cae1405f07c68467914c2297443199c704a3e5df7d6f987244603fa85d5f5c01 and37-file integrity, not independently reproducible from this upload alone.
LIMIT-2 | SUMMARY.local_fake_adapter_patch declares TEMP_EXTRACT_TEST_DOUBLE_ONLY: original d4e6245b2c2c... replaced32cbb6ad7c0d... . AUD must inspect exact patch and bind results to tested bytes; do not call unchanged sealed R3 suite verified.
LIMIT-3 | EVIDENCE_SELF_CHECK.driver_sha256=null; nested DRIVER_METADATA records helper hash214df1faa4b05f0776d8bafafbde2d2a4744a07fdf5657e8ebc3c80f7bb47082. Need exact driver/source binding, not inferred identity.
NAMING | Historical NEG05/TRIAL-ELIGIBLE actually uses PENDING_VALIDATION+ELIGIBLE per handoff; use an appended descriptive alias if confirmed by source. Do not relabel old observed logs or claim this proves TRIAL exclusion.
NEXT | Independent AUD reviews raw evidence/source binding and naming scope. Source/patch absent => narrow evidence receipt only or request exact artifacts; no reflexive rerun or SQL rewrite solely for a label.
GATES | DB5 remains BLOCKED; hosted migration/transport/stored digest not proven; TV1 UNVERIFIED. No permission change.
