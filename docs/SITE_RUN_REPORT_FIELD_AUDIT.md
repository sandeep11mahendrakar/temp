# Site Run Report — Field Audit Before Automating the Template

**Purpose:** separate fields evidenced by the supplied campaign Markdown from fields that still need inspection of the actual per-run artifacts. This is an implementation checklist, not a claim that all proposed metrics already exist in JSON.

## 1. Fields already evidenced in supplied Markdown reports

The source files regularly summarize the following kinds of data. Exact raw JSON keys and per-run availability have **not** been confirmed by the Markdown summaries alone.

| Field family | Values/examples documented in the Markdown | Relevant supplied source(s) | Implementation caution |
|---|---|---|---|
| Site/run identity | Site name, URL, date, report path, registered run ID | `INDEX(2).md`, Tier 2/3 mega-reports, final batch report | Validate against run manifest and source URLs before treating as authoritative. |
| High-level outcome | `SUCCESS`, `PARTIAL_FAILURE`, `FAILED`, `BLOCKED`, `CLEARED`, `CLEARED-BY-RERUN`, `QUARANTINED`, contamination skip | `INDEX(2).md`, `TIER2_MEGA_REPORT.md`, `TIER3_MEGA_REPORT.md`, `D11_FINAL_BATCH_MEGA_REPORT.md` | These statuses describe different dimensions. Normalize into execution outcome, integrity verdict and aggregate eligibility separately; preserve original status label too. |
| A exploration | Steps, states, URLs, completion/termination labels, timeouts, errors/warnings | `TIER2_MEGA_REPORT.md`, `TIER3_MEGA_REPORT.md`, `D11_FINAL_BATCH_MEGA_REPORT.md`, retrospective reports | Verify whether counts mean attempted, completed, unique, or total. |
| B exploration/replay | Replay result, test counts, step counts, skipped verification, unresolved targets, candidate exhaustion, partial/no-test-case outcomes | Tier 2/3 reports, `VISION_TEST_QUALITY.md` | Keep exploration success separate from replay success. |
| S1 catalog | Element, behavior, page and conflict counts in some rows | `TIER2_MEGA_REPORT.md`, rewrite checklist | Presence varies. Inspect canonical dashboard/JSON and definitions. |
| S2 gap analysis | Stage is named in rewrite/checklist and dashboard descriptions | `T202_REWRITE_CHECKLIST.md`, campaign reports | Exact S2 metrics are not consistently shown. Inspect schema before selecting canonical fields. |
| S4 synthesis | Offered/accepted counts, grounded candidate counts, rejection reasons such as duplicate, action mismatch, max-tests, cross-page reference, no actionable step | Tier 2/3 reports, `TIER1_RETROSPECTIVE.md`, `D11_FINAL_BATCH_MEGA_REPORT.md` | Agree on whether offered, candidate, accepted and executable counts use the same denominator. They are not synonyms. |
| FT live execution | Test pass/total, step pass/attempted, failure reasons, preverified targets in selected runs | Tier 2/3 reports, final batch report | Keep test-level and step-level rates distinct. |
| Fusion metric | Fusion-attributable percentage, novel targets, examples of denominator caveats | Campaign evaluation, Tier 2/3 reports | Extract the official definition/formula from the script and source data; do not recompute by guesswork. |
| Verification quality | `STRONG`, `MEDIUM`, `WEAK`, skipped verification, weak body-text fallback | `VISION_TEST_QUALITY.md`, campaign reports | The supplied quality report defines its rubric; bind the rubric version to each generated result. |
| Integrity / provenance | Run manifest checks, source/start URL checks, catalog-domain checks, folder purity, contamination-rejection logs, quarantine/clearance status | `QUARANTINE_TIER2.md`, `T202_REWRITE_CHECKLIST.md`, Tier 2/3 reports, incident report | Integrity must be its own verdict and gate, not inferred from execution success. |
| Repeat-run context | Run-by-run statuses, exploration variability, execution flakiness, API variability | `REPEATABILITY.md` | The per-run report should link to repeatability analysis, not mix multi-run statistics into a single-run metric. |
| Failure analysis | Symptom, root cause, fix/disposition and verification | `IMPROVEMENT_BACKLOG.md`, `TIER1_RETROSPECTIVE.md`, mega-reports | Separate evidence-backed diagnosis from an AI-generated hypothesis. |
| Blocked/contaminated scope | Bot walls, redirects, site/mirror changes, contamination and do-not-cite rows | Campaign plan, tier reports, quarantine and incident reports | Preserve these as evidence while correctly setting research aggregate eligibility. |

## 2. Artifact paths mentioned in the supplied reports

The supplied Markdown names the following artifact types/locations. They are leads for inspection, not proof that every one exists for every run.

| Artifact family | Paths/patterns mentioned | What must be checked in the actual artifacts |
|---|---|---|
| Run manifest / registration | Run-specific manifest; `runs/<run_id>/...` | Canonical target URL, timestamps, run linkage, stage statuses, configuration. Exact manifest file name and key names. |
| A exploration | `runs/<run_id>/dom/exploration_summary.json`; A memory log | Step/state/URL definitions, action records, per-step timestamps, termination labels, errors, observed state payload and source pointers. |
| B exploration result | `vision/storage/outputs/<b_run>_exploration_result.json`; run-local output copy | Actual source URL/start URL, detection/OCR fields, state/step sequence, counts, model metadata and replay/test record shape. |
| Fusion dashboard data | `runs/<run_id>/fusion/dashboard_data.json` | Actual S1/S2/S4/FT fields, field definitions, denominator and computation of fusion percentage, missing-stage semantics. |
| Execution details | `execution_results.json`, replay records, Fusion Test (FT) outputs | Test identifiers, exact assertions, test vs step outcomes, error categories, verification methods, duration. Validate actual run-local path/name. |
| State/catalog files | `state_visual_dom`, `exploration_history`, catalog/page-key files as mentioned in incidents | Page/state identity, source URLs, cross-run ownership, relation to screenshot and step. |
| Integrity outputs | `CONTAMINATION_REJECTS.json`, `testing/folder_purity.js` output, run-attribution guard output | Which gates ran, which artifacts they tested, PASS/FAIL interpretation, and whether an empty rejection log means no contamination or simply no check. |
| Screenshots | References to screenshot protocol/artifacts in reports | Actual path/format, matching state or step ID, sanitization status, whether screenshot provenance is recorded. |
| Aggregate/quality outputs | `testing/extract_run.js`, `fusion/s8_campaign_eval.js`, `VISION_TEST_QUALITY.md` | Canonical metric calculation code and verification rubric version. Aggregate reports should never substitute for raw single-run evidence. |

## 3. Fields requiring inspection of actual per-run JSON/code before implementation

### Required source-schema mapping

- [ ] Enumerate all JSON artifacts produced for a known clean run and a known blocked/partial run.
- [ ] Identify canonical manifest fields and establish the immutable run ID / target URL linkage.
- [ ] Map A step/action/state schemas, counters, terminal status and timing boundaries.
- [ ] Map B screenshot, YOLO detection, OCR region, confidence, action, transition and replay schemas.
- [ ] Determine whether confidence values are available per detection and define valid aggregate statistics (mean/median/quantiles, thresholds and denominators) only if justified.
- [ ] Map S1, S2, S4 and FT source fields and identify where each value is calculated.
- [ ] Confirm the Fusion-attributable percentage formula in the generating code, including exclusions and denominator.
- [ ] Map test-level status separately from step-level status; record skipped, rejected, blocked, timed-out and errored cases distinctly.
- [ ] Confirm how verification type/strength is serialized and how the rubric version is assigned.
- [ ] Map duration, request/call counts, tokens, API usage and cost. Mark unsupported metrics `NOT_RECORDED`; do not infer them.
- [ ] Map URL/redirect histories and allowed host transitions for integrity verification.
- [ ] Confirm whether screenshots can be linked to exact step/state IDs and whether image metadata is present.
- [ ] Determine what source/control/configuration metadata is actually captured: commit hash, provider/model ID, prompt version/hash, browser/OS/viewport, random seed, environment limits.
- [ ] Identify secrets and sensitive values that can appear in raw JSON, OCR text, URLs, screenshots, local paths or annotations, then implement sanitization before export/indexing.
- [ ] Validate that every artifact reference is relative/stable, exists, is from the correct run and can be resolved by future agents.

### Metrics deliberately not assumed to exist

The report template includes places for YOLO/OCR aggregate statistics, confidence distributions, token/cost usage, per-stage timing, source hashes, viewport, prompt/model version, and fine-grained step evidence. These are **conditional fields** until raw artifacts/code confirm that they are recorded or can be deterministically derived. If they are absent, populate their availability status rather than fabricating a value.

## 4. Recommended first inspection sample

Before freezing schema version 1.0, map artifacts from three representative registered runs:

1. A clean full-pipeline run with A, B, Fusion and live FT evidence.
2. A partial/blocked run where one or more stages never ran or returned no candidates.
3. A contaminated/quarantined run that must remain available as failure-mode evidence but excluded from research aggregates.

This sample helps test the schema against normal, incomplete and invalid-evidence paths rather than designing only around successful runs.

## 5. Template design rules

1. One immutable report per run; a rerun gets its own report. Older evidence is not silently overwritten.
2. Separate execution outcome, evidence integrity, and aggregate eligibility.
3. Every metric has a value plus availability status and source reference.
4. Preserve numerator, denominator, formula and rubric version for rates/scores.
5. A path diagram is composed only of observed states and transitions; unobserved steps are never invented.
6. Compress repetitive per-element evidence into counts/distributions, but retain complete raw artifacts and stable lookup pointers.
7. AI annotations remain separate from measured records, append-only/versioned, and cited to evidence.
8. Sanitize report and shareable artifacts; keep restricted originals separate only where permitted and access-controlled.
9. `INDEX.md` remains a campaign ledger; its aggregates must include only runs that passed the declared eligibility gate.
10. The final key names and metric calculations must be finalized only after inspecting the actual JSON and calculation scripts.
