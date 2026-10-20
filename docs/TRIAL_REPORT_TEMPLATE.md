# TRIAL_REPORT Template (T-4 step0)

Generator syntax: `node tools/trialReport.js --manifest <P-1-manifest.json> --readback <retained-T-3-readback.json> --output <new-report.md>`.
Use one `--manifest` per run. `<...>` means an existing file path; it does not assert that T-2/T-3 has produced that file.

## Input path map

run identity/label/timing/cost => `runs/<run_id>/manifest.json` fields `run_id`, `label`,
`started`, `ended`, `cost.time`, `cost.calls`, `cost.tokens`, and `cost.screens`.
Outcome/causes/integrity/trial flags => `runs/<run_id>/report.json`, listed in manifest
`artifacts[].path`; fields `run.id`, `result.verdict`/`result.outcome`,
`result.cause_class` or case `cause_class`/`causeClass`/`block.cause_class`/
`block.causeClass`, `integrity.verdict`, `citable`, and `aggregate_eligibility`.
Report hash/bytes => manifest `artifacts[]` entry `path`, `bytes`, and `sha256`; the
report bytes are read from the listed path.
Readback => retained local T-3 JSON row, only if present; fields `run_id`,
`manifest_sha256`, `report_sha256`; exactly one row per run, compared with file bytes.
Storage => retained readback row or manifest/report field `storage_status`/`storage`,
if present; otherwise `NOT_RECORDED`.
Secret status => scan manifest, report, and matching readback row; print counts/status
only, never matching values.
Schema gaps/recommendation => derived from listed inputs; missing, invalid, or
mismatched evidence produces gaps and `NO-GO`.

## Paths that are not interchangeable

- T-2 P-1 archive path is `runs/<run_id>/manifest.json`; its `artifacts[]` paths are relative to that run folder. The manifest alone does not supply the report outcome.
- P-2 `reports/<run_id>.md` is a generated Markdown summary. It is not `report.json` and cannot be passed as the report artifact.
- T-2 `report.json` is usable only when it exists in the immutable run folder and is
  listed by the manifest. The runbook says P-2 does not create it; absent source means
  report fields are `NOT_RECORDED` and the run fails closed.
- T-3 upload verifies an exact-ID hosted row in memory. `tools/trialUploader.js`
  returns sanitized proof fields (`run_id`, `payload_sha256`, `outbox`, `attempts`) but
  does not persist a readback-row JSON file. `outbox/<run_id>.json` is pre-upload data,
  not readback evidence. Without a retained T-3 row artifact, readback is
  `NOT_RECORDED` and the report is `NO-GO`; do not fabricate or rename proof as a row.
- A successful T-3 verifier result is not itself a local row file. Keep its evidence separate.
  Use only a retained artifact that contains the exact fields required above.
- Producer/consumer gap: `tools/runArchive.js` writes no `citable` or
  `aggregate_eligibility` to `manifest.json`, while `tools/trialReport.js` requires both
  there. These flags exist in the report, but the generator check mismatches P-1 output.
  Never copy flags into the manifest by hand; expect `NO-GO` until the contract is fixed.
- Cause gap: the current generator does not consume schema fields `cases[].cause` or a
  string `cases[].block`; those values must remain absent/`NOT_RECORDED`, not relabeled.

## Rendered report (<=60 lines)

```text
# TRIAL_REPORT
label=TRIAL | citable:false | aggregate_eligibility=EXCLUDED
Purpose=review readiness only; no freeze/upload/research authorization.
| run_id | outcome | cause_class | integrity | time | calls/tokens/screens | storage | secret_scan | readback | source artifacts |
| ... per-run values cite the exact artifact path and field; unavailable values are NOT_RECORDED ... |
Schema gaps:
- artifact-backed missing field paths, or NONE after inspection
Storage status=artifact-backed value or NOT_RECORDED
Secret status=CLEAR/FAIL/NOT_RECORDED; marker values are never printed
Recommendation=GO for independent review only / NO-GO; T-5 owner freeze remains separate
```

Every numeric measurement cites its source path and field. Missing manifest, listed report,
or retained readback stays `NOT_RECORDED` and forces `NO-GO`. No zero, timing, cost,
storage, or outcome is synthesized. `GO` recommends independent T-4/TV-4 review only;
it does not freeze schema 1.0 or authorize P-5.
