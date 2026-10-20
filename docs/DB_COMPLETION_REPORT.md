# DB Completion Report (SKELETON - docs-only; final gated on DB-5 + DB-7 + T-4 DONE)

Purpose: final DB delivery handoff; <=60 lines; honest PARTIAL/BLOCKED if proof missing.

## Runnable commands
- node --check tools/trialUploader.js
- node --check tools/trialVerifier.js
- node --check tools/r3DbExport.js
- node --check tools/r3DbWorkflow.js
- node --test tools/trialUploader.test.js tools/trialVerifier.test.js tools/r3DbExport.test.js tools/r3DbWorkflow.test.js tools/r3DbContract.test.js tools/trialReadiness.test.js
- node tools/trialVerifier.js <manifest.json> <rows.json>
- node tools/r3DbWorkflow.js <input.json> [--mode=offline|upload] [--root=<dir>]

## Evidence paths
- docs/evidence/tests-baseline-20261019/ (LEDGER.json per-file test counts+sha256; CHECKS.json raw command output+exits)
- docs/evidence/db-backend/<id>/ (sanitized proof; owner shell/opencode only)
- docs/DB_FIELD_MAP.md, docs/DB_SQL_REVIEW.md, docs/DB_SERVER_UPLOAD.md
- tools/fixtures/db-trial/*.json, docs/DB_TRIAL_EXPECTATIONS.md
- docs/DB_REPORT_COVERAGE.md

## Limits / missing-proof control
- Offline code/SQL review != deployed RLS proof; DB-5 hosted proof required for COMPLETE.
- TV-1..TV-4 audit chain must ACCEPT before final.
- PARTIAL/BLOCKED is honest; never fake COMPLETE.
- Secret scan counts only; no .env reads; no push/delete.
- Final DB-8 unlocks only after DB-5 + DB-7 + T-4 DONE.

## Reproducible missing-report negative (A1/AUD-1)
- Input: JSON object with manifest.run_id and artifacts=[{source:'missing-report.json',path:'report.json'}]; no source file present.
- Command: node tools/r3DbWorkflow.js <input.json> --root=<temp-root>
- Observed: exit code 1; stderr "WORKFLOW-REFUSED source report.json unreadable: ENOENT ... missing-report.json".
- Expected: refusal; no archive, summary or outbox created.
- Repro input creation and invocation (literal):
  node -e "const fs=require('fs');const r='C:/Users/sandeep/AppData/Local/Temp/opencode/db8neg';fs.mkdirSync(r,{recursive:true});fs.writeFileSync(r+'/input.json',JSON.stringify({manifest:{run_id:'db8-missing-report'},artifacts:[{source:'missing-report.json',path:'report.json'}]}));"
  node tools/r3DbWorkflow.js C:/Users/sandeep/AppData/Local/Temp/opencode/db8neg/input.json --root=C:/Users/sandeep/AppData/Local/Temp/opencode/db8neg
- Observed: exit code 1; WORKFLOW-REFUSED source report.json unreadable: ENOENT ... missing-report.json.