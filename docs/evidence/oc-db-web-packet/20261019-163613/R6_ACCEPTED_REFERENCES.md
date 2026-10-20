# Accepted R6 references and migration custody

Scope | Offline evidence only; no hosted proof or apply authorization.
Recipe | Sorted relative-path|sha256hex rows; LF-join; no terminal LF.
R6 aggregate | 9fe071c560826b4cf4e578cda619e66f9aa685edf72245806b20cc3dd1352def | 5/5 published file hashes MATCH current bytes.

database/r3_companion_step0_negative.sql | a7f362deef94ba8a1a57a6346fa19201cfe6cf950ea13457956f054a4209a3c6 | MATCH
database/r3_companion_step0_plan.md | f73cf66557666050378ddbb33bf8221bb1aaffb2a84284ab67c142bf9cfb791e | MATCH
database/r3_companion_step0_readback.sql | a02ce37c8dbe972d0a62b052d05e74b64b6604f1fb346068547fa2cba1ccf56a | MATCH
database/r3_companion_step0_rollback.sql | c37b45e71d5188ddbc9aa6a12a94ec5d7a5ff514b08b025e956ad209729e6167 | MATCH
docs/DB5_STEP0_RUNBOOK.md | 4c8c273b121dadf6307407ca60f06a19a9a8ddae880e877bb000dddbbec7975c | MATCH

Migration current SHA256 | b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6
Historical Git commit | c8baedf72f7edfafa11a9faa6cda6b353a529a7a
Historical migration SHA256 | b285982fe45757add7ae52907e0cf6b8643887bb157214b6300d24b4e90806f6
Byte equality | true
Reference | docs/AUDIT.jsonl:103 records DB-2 ACCEPT on isolated replay; abbreviated hashes there are supported by the exact historical Git bytes above.
Scope | This custody comparison is not a new independent SQL verdict or hosted acceptance.

## R6 source excerpts
Excerpts below are reflowed only for display; exact original lines are in the included docs/INTERCOM.md.

Source | docs/INTERCOM.md:1155
DB5-READBACK-R6-PROOF-WB |  scope=offline caveat |  revision=sha256:9fe071c560826b4cf4e578cda619e66f9aa685edf72245806b20cc3dd1352def |  stored envelope recompute POS=ce291084... match; same pinned digest with altered manifest/report NEG=02d57728... mismatch

Source | docs/INTERCOM.md:1157
DB5-R6-FILE |  database/r3_companion_step0_readback.sql sha256=a02ce37c8dbe972d0a62b052d05e74b64b6604f1fb346068547fa2cba1ccf56a

Source | docs/INTERCOM.md:1158
DB5-R6-FILE |  database/r3_companion_step0_plan.md sha256=f73cf66557666050378ddbb33bf8221bb1aaffb2a84284ab67c142bf9cfb791e

Source | docs/INTERCOM.md:1159
DB5-R6-FILE |  database/r3_companion_step0_negative.sql sha256=a7f362deef94ba8a1a57a6346fa19201cfe6cf950ea13457956f054a4209a3c6

Source | docs/INTERCOM.md:1160
DB5-R6-FILE |  database/r3_companion_step0_rollback.sql sha256=c37b45e71d5188ddbc9aa6a12a94ec5d7a5ff514b08b025e956ad209729e6167

Source | docs/INTERCOM.md:1161
DB5-R6-FILE |  docs/DB5_STEP0_RUNBOOK.md sha256=4c8c273b121dadf6307407ca60f06a19a9a8ddae880e877bb000dddbbec7975c

Source | docs/INTERCOM.md:1164
id=DB5-A1-V6| from=AUD:AUD-1| to=SUB:SUB| kind=VERDICT| task=DB-5| reply_to=DB5-READBACK-VR-WB-20261019-R6| revision=sha256:9fe071c560826b4cf4e578cda619e66f9aa685edf72245806b20cc3dd1352def| action=ACCEPT| evidence=module POS/NEG recompute pass; SQL replay N/A
(readback.sql:29-33)| IST=2026-10-19 14:48 IST

Source | docs/INTERCOM.md:1184
id=AUD2-DB5-R6-1| from=AUD:AUD-2| to=SUB:SUB| kind=VERDICT| task=DB-5| reply_to=DB5-READBACK-VR-WB-20261019-R6| revision=sha256:9fe071c560826b4cf4e578cda619e66f9aa685edf72245806b20cc3dd1352def| action=ACCEPT| evidence=readback.sql:30-33 stored-byte digest reproduces; caveat
cleared| IST=2026-10-19 15:24 IST

Source | docs/INTERCOM.md:1185
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: 5/5 file hashes == receipt (readback a02ce37c.. plan f73cf665.. neg a7f362de.. rollback c37b45e7.. runbook 4c8c273b..).

Source | docs/INTERCOM.md:1186
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: aggregate plain recipe = 9fe071c560826b4c.. == declared revision exactly; variant recipe differs, so declared form is plain path| sha256.

Source | docs/INTERCOM.md:1187
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: PGlite replay exit0; counts research_eligible=2 readback=3 duplicate_retry=1; negative SQL exit0.

Source | docs/INTERCOM.md:1189
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: this cures my R5 PINNED_LITERAL_NOT_RECOMPUTED - R5 stored bytes gave 95dfd676.. != pinned; R6 bytes give exact pinned digest.

Source | docs/INTERCOM.md:1190
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: determinism x2 replays => identical digest; created_at present in row but excluded from canonical form, so digest is time-stable.

Source | docs/INTERCOM.md:1191
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: rb-arbitrary deliberately reuses rb-research digest while carrying altered manifest/report => rejected. Arbitrary-payload control now negative as intended.

Source | docs/INTERCOM.md:1192
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 PASS: module tests 13/13 exit0 (node --test tools/r3DbContract.test.js); matches receipt claim 13/13.

Source | docs/INTERCOM.md:1195
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 scope: no APPLY, no CLI, no DB call, no .env read by AUD2; SQL replayed only against local PGlite; shared worktree untouched.

Source | docs/INTERCOM.md:1196
B-2026-10-19 15:24-AUD2->SUB: DB5-R6 row: prep step0 remains DONE per SUB CORR at 1151; my ACCEPT covers offline readback only and does NOT authorize hosted apply. H2 actor still owner.

Source | docs/AUDIT.jsonl:101
{"row":"DB-2","aud":"UNVERIFIABLE","by":"AUD","check":"Static review of additive schema/23 SQL guards passes; exact files match c8baedf. Required isolated Postgres execution not run: psql unavailable; SQL behavior unproven.","evid":"c8baedf| database/r3_companion.sql SHA256
b285982f...6f6; test.sql ee4e5e64...aa59; Get-Command psql => no result; commit blobs match working files","ts":"2026-10-18T23:48:29+05:30"}

Source | docs/AUDIT.jsonl:103
{"row":"DB-2","aud":"ACCEPT","by":"AUD","check":"Fresh isolated PGlite0.5.10/PG18.6 replay passed: migration 20 stmts; test 15 stmts, all guards pass; six placeholder fingerprints unchanged; rollback rows=0. Hosted Supabase/team definitions remain
unknown.","evid":"database/r3_companion.sql sha256=b285982f...08f6; test.sql sha256=ee4e5e64...aa59; docs/evidence/db2-pglite-20261018.log sha256=58a67163...a5b4; independent replay exit0","ts":"2026-10-18T23:58:44+05:30"}
