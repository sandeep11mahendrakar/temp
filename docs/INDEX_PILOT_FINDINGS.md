# INDEX Pilot Findings (F-1 Stage 1)

Pilot sample (read-only, canonical data root `C:/Users/sandeep/pes/vs code/Capstone-Project`):
1. Clean full-pipeline: `runs/run_20260823_225906` (SauceDemo, SUCCESS, integrity clean).
2. Partial/blocked: `runs/run_20260824_095411` (OpenCart, SUCCESS pre-gate but BLOCKED bot-wall; no fusion dashboard).
3. Contaminated: `runs/run_20260826_000112` (BBC News, PARTIAL_FAILURE, CONTAMINATION_MARKER pure=false).

## Confirmed RECORDED fields (clean run)
- run_id, url, started_at, finished_at, overall_status (run_manifest.json)
- architecture_a: name, status, exitCode, duration_ms, log_file, output_dir
- architecture_b: name, status, stage, vision_run_id, exit_code, duration_ms, collected artifacts
- fusion/dashboard_data.json: run_dir, generated_from_artifacts, llm_calls, wall_clock, headline (total_final_tests, tests_from_a/b, fusion_created, pct fusion-attributable, novel_targets), coverage_matrix (elements/behaviors/tests/states), architecture_comparison, findings, gaps, fusion, execution
- vision/outputs/execution_results.json: architecture, run_id, evidence_dir, re_detection_enabled, source_url, test_cases_file, started_at, finished_at, total_duration_ms, summary (total/passed/failed/errors, pass_rate, multi_step_tests, fill/scroll actions, states_observed, verification_methods, weak_verifications, stale_coordinates_prevented, unresolved_targets, warnings), results (id, objective, verdict, app_outcome, weak, dom_assist, _matched, causes)

## NOT_RECORDED (mark status NOT_RECORDED, do not fabricate)
- Git commit / source revision (manifest has none)
- Browser/viewport/device profile (not in manifest or dashboard)
- Model provider/model id (dashboard llm_calls=0; no model field)
- Prompt/config version/hash
- Per-stage timing boundaries beyond duration_ms
- Token/cost usage (llm_calls=0; no tokens field) -> NOT_RECORDED
- Confidence distributions per YOLO/OCR aggregate (raw JSON has per-detection but no aggregate)
- Screenshot-to-step mapping metadata (screenshots exist but no index linking to step IDs)
- Redaction/sanitization record (no field)

## Template deltas needed
1. Add `llm_calls` as recorded field (present in dashboard) — keep.
2. Mark token/cost, commit hash, browser/env, prompt version as NOT_RECORDED unless artifact inspection confirms.
3. Blocked runs (OpenCart): fusion/dashboard_data.json ABSENT -> all fusion metrics STAGE_NOT_RUN/BLOCKED; manifest still has arch_a/arch_b.
4. Contaminated runs (BBC): CONTAMINATION_MARKER (pure=false) + CONTAMINATION_REJECTS.json present; integrity_verdict=CONTAMINATED; aggregate_eligibility=EXCLUDED. Fusion headline still present (77.8% fusion-attributable) but must be excluded from aggregates.
5. Status vocabulary: map overall_status (SUCCESS/PARTIAL_FAILURE) + integrity separately; blocked runs have no fusion.

## Evidence paths
- Clean: runs/run_20260823_225906 (manifest, fusion/dashboard_data.json, vision/outputs/execution_results.json)
- Blocked: runs/run_20260824_095411 (manifest, no fusion)
- Contaminated: runs/run_20260826_000112 (manifest, fusion/dashboard_data.json, CONTAMINATION_MARKER, CONTAMINATION_REJECTS.json)

## Conclusion
Schema 0.1-draft needs: explicit NOT_RECORDED for token/cost/commit/env/prompt-version; blocked runs produce no fusion dashboard; contaminated runs carry CONTAMINATION_MARKER + REJECTS and are excluded from aggregates. Ready for Stage 2 (template v0.1 final edits + R-3 run over 30 sites).