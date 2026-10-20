# TV1 R3 expected output matrix - executable local controls

Expected only | This file is a specification; observed run/notices/results are retained in the cited fresh evidence directories.
POS zero | explicit zero expected + zero fixture; all SQL cases; post-rollback fixture_count0; same baseline; closed; fresh connection.
POS six | explicit six expected + six fixture; same controls; six measured objects and seeded row preserved after reopen.
NEG expected | missing profile refuses before session; zero/six mismatch refuses before diagnostic fixture writes.
NEG drift | real unexpected public table changes fingerprint; preflight refuses; fresh comparison reports mismatch.
NEG capability | RLS off; invoker off; disabled trigger; anon executor => intended CAT or PREFLIGHT failure.
NEG SQL | explicit exception after four actual diagnostic fixture inserts; original P0001 preserved; rollback+close; fresh fixture_count0.
NEG notice | injected capture exception after fixtures; rollback+close still attempted; no PASS; fresh fixture_count0.
NEG rollback | injected rollback method failure; original SQL exception preserved; close attempted; fresh data verifies aborted transaction.
NEG close | injected failure AFTER real close is recorded as failure; fresh check still runs; no claim of a real OS close fault.
NEG collision | pre-existing diagnostic IDs refuse; retained rows remain; runner must not delete them as its own fixtures.
NEG remote | remote URL/project flags reject before PGlite construction; unknown flags reject; no credentials read.

SQL cases | All original assertion names retained; runner requires every POS/NEG group, raw result rows and required notices.
NEG01/02 | anon/authenticated denial actions/views => actual42501.
NEG03 | service UPDATE/DELETE =>42501; privileged append-only trigger =>55000.
NEG04 | conflicting hash =>23505 + r3_runs_pkey; retry inserts0 and row/digest unchanged.
NEG05 | six constraint controls =>23514 + observed named constraint; local runtime ordering limitation recorded by actual notices.
NEG06 | exact ELIGIBLE research membership + four-row readback.
ROLLBACK | explicit normal rollback; actual catalog/temp-baseline comparison; executor fresh reopen confirms zero new fixtures.
Scope | Only seeded local source-row preservation is tested. Metadata fingerprint does not certify all hosted data.
Runtime | Actual SELECT version() and installed package recorded; expected local package0.5.10. Hosted role/version support unproved.
Close | Independent AUD must inspect frozen hashes and replay controls; no offline-to-hosted acceptance inference.
