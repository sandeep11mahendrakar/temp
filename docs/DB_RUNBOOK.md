# R3 DB workflow

## Inputs

Input | One UTF-8 JSON record per completed run; paths are relative to its parent unless `--root` is given.
Input | Preserve source artifacts; include exact source report as `report.json` and every file named by `cases[].evid_paths`.

```json
{
  "manifest": { "run_id": "sample-run", "site": "NOT_RECORDED", "label": "ASSISTED" },
  "artifacts": [
    { "source": "source/report.json", "path": "report.json" },
    { "source": "source/evidence.json", "path": "evidence.json" }
  ]
}
```

Manifest | Use P-1 fields; absent measurements remain `NOT_RECORDED` (tokens may be `null`).
Report | Must pass P-2 schema validation; `run.id` must equal `manifest.run_id`.
Artifacts | Relative, unique paths; source bytes stay unchanged. Every `cases[].evid_paths` value must match a declared archive artifact.
Refusal | Missing evidence path fails before archive/outbox creation; archived paths/files are checked again after P-1 and P-2 validation.
IDs | Existing run IDs are refused.

## Offline default

```powershell
node tools/r3DbWorkflow.js workflow.json
```

Path | P-1 archive -> P-2 validation -> immutable `runs/<run_id>/` archive.
Output | Generated Markdown summary: `reports/<run_id>.md`; sanitized outbox: `outbox/<run_id>.json`.
Immutability | Source `report.json` is archived as evidence; Markdown summary stays outside the archive.
Offline | Default makes zero network calls; upload and readback are `NOT_RUN`.

## Explicit upload mode

```powershell
node tools/r3DbWorkflow.js workflow.json --mode=upload
```

Upload | Delegates to the accepted insert-only uploader, then exact-ID readback checks stored hashes and payload.
Config | Read from process environment; run only under current owner/H2 authorization and holder rules.
Secrets | Never put credential values in input, command line, output, or evidence.
Failure | Archive and outbox stay available for retry; never edit either in place.

## Offline checks

```powershell
node --test tools/r3DbWorkflow.test.js
node --test tools/runArchive.test.js tools/researchSchema.test.js tools/r3DbExport.test.js tools/trialUploader.test.js
```

Scope | Workflow tests use synthetic DB-6 fixtures and an injected mock transport.
Limit | Tests do not establish hosted RLS, deployed schema, backend availability, or permission to upload.
Eligibility | BLOCKED, PARTIAL, and TRIAL classifications remain excluded from research eligibility.
