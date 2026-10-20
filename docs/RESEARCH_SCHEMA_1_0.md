# Research Run Schema 1.0

One folder per completed run: `runs/<run_id>/manifest.json`, report JSON, evidence artifacts, and `per_call.jsonl` when captured. Archives are immutable: runArchive refuses an existing folder. No absent measurements are inferred; use `NOT_RECORDED` (tokens may be `null`).

## 1. Identity
Required: `run_id`, `site`, `url`, `head`, `dirty`.

## 2. Run timing
Required: `started`, `ended`; use `NOT_RECORDED` when not captured.

## 3. Model and prompt provenance
Required: `model_provider`, `model_id`, `contract_hash`, `prompt_hash`.

## 4. Browser and host
Required: `browser`, `viewport`, `os`.

## 5. Limits and seed
Required: `limits`, `seed`.

## 6. Agent identity
Required: `label` and `brain.mode`, `brain.role`, `brain.blind`. Taxonomy follows `docs/BRAIN.md`.

## 7. Cost record
Required: `cost.calls`, `cost.tokens`, `cost.screens`, `cost.time`. Tokens are a real count or `null`; never estimate.

## 8. Per-call record
Capture JSONL one record per model call. If unavailable, `per_call` is `NOT_RECORDED`; never imply zero calls.

## 9. Report JSON
Store the report JSON produced for the run. Preserve source report fields; don't convert unknown values into zero.

## 10. Test-case provenance
Each report case records `tc_source`, verdict, label, block class where applicable, and evidence paths.

## 11. Access and block state
Use the library `access` class and `blockDetector` result where a page snapshot exists. Missing runtime probe is `NOT_RECORDED`.

## 12. Evidence artifacts
Each artifact entry records archive-relative `path`, byte length, and SHA-256. Keep raw evidence immutable.

## 13. Contamination and exclusions
Record contamination/access deviations explicitly in the report and analysis. Never remove a run silently.

## 14. Verification strength
Record STRONG/MED/WEAK/NOT_RECORDED from retained evidence; do not infer strength from the verdict.

## 15. Aggregation
Aggregate from manifests and report JSON. Include denominator, excluded IDs and reasons, and per-site values.

## 16. Reproduction
Record command, code HEAD, and output path so another reviewer can reproduce the derived table.

## 17. Automated checklist
`node tools/researchSchema.js validate <run-directory>` checks: manifest/report parse; required strings are non-empty or `NOT_RECORDED`; `run_id` is recorded; `dirty` is boolean or `NOT_RECORDED`; counters are non-negative numbers or `NOT_RECORDED`; tokens are number/null/`NOT_RECORDED`; `brain` slots are non-empty or `NOT_RECORDED`; report has `run.id` and a case array; case id/verdict/tc_source/label and evidence paths are non-empty strings; block is text/null; artifact paths, bytes, and SHA-256 match. `dirty=false` remains false in generated output. Exit 0 only if all checks pass.
