# Research Protocol (PROMPT32 P-5)

STATUS: DRAFT / NOT VERIFIED. No 30-site run is authorized until P-1..P-4 are independently VERIFIED, the site list and model pin below are resolved, and this file is changed to VERIFIED by the verifier. `research-run-1` tag is intentionally not created before that gate.

## Scope and site list

Target: 30 registered sites in a seeded order, only after preflight. The current site library has 10 records (2 open, 1 credentialed, 7 third_party); the project stop-list is `stackoverflow, imdb, goodreads, npmjs, reddit, magento, opencart`. Stop-listed sites are excluded from all future runs, including with `--permitted`. A 30-site eligible list is NOT_RECORDED and must be registered and reviewed before verification. No implicit promotion from historical INDEX rows.

## Seeded order and repeats

Order: NOT_RECORDED pending approved 30-site list. Use a fixed seed in the run manifest, preserve the ordered list, and do not reshuffle on resume. Repeat the same protocol 3 times on 5 predeclared sites; select those 5 before the first run. `--resume` continues only sites without a completed checkpoint and never reruns a BLOCKED site.

## Resource caps and environment

- LOOPS=3; LLM_CALL_CAP=40 (runAuto.js constants; any change requires a protocol revision before run).
- Per-site timeout, total wall-time cap, service watchdog thresholds, and restart policy: NOT_RECORDED until P-4 runner/root-cause evidence is complete.
- Serial concurrency=1. Pin exact HEAD and require clean source tree. No source commits during a run.
- Provider/model id: primary nvidia/nemotron-3-super-120b-a12b:free (ARCH_B_LLM_PROVIDER=openrouter, reasoning effort low); fallback google/gemma-4-31b-it:free.
- Run date/time: derived from recorded `started`/`ended` timestamps in each manifest; owner scheduling/date decisions are recorded separately, not as a manifest `run_date` field.
- Key status: no live key is available; do not start a model-backed run until a human-approved credential gate exists. Never store key values.
- Browser, viewport, OS, contract hash, prompt hash, and recorded `started`/`ended` timestamps are recorded in each manifest; missing values remain NOT_RECORDED.
- There is no owner-stamped `run_date` field; run date/time comes from `started`/`ended`.

## Metrics and evidence

Report per-site and pooled PASS/(PASS+FAIL), BLOCKED/total, verification-strength mix (STRONG/MED/WEAK/NOT_RECORDED), DOM-assist rate, label mix, calls, actual tokens or null, screens, elapsed time, Wilson 95% interval, and repeat variance. Compute only from archived `manifest.json` + report JSON via `tools/stats.js`; do not use dashboard_data.

## Exclusions and labels

Predeclare exclusions as truth-expected BLOCKED only. Preserve every blocked/contaminated run and its reason; do not silently remove rows. `access=third_party` is NO-GO unless specifically permitted; project stop-list overrides permission. Label taxonomy: AUTONOMOUS only when retained run evidence says blind=Y; otherwise NONBLIND/AUTONOMY_NONBLIND or ASSISTED as recorded. BLOCKED is a run outcome, not an autonomy label.

## Stop rules

Stop on BLOCKED, bot challenge, 403/429, credential prompt, unexpected domain, missing/invalid key, service health failure, archive failure, timeout, source HEAD/dirty drift, or missing required measurement. Never evade bot protection or retry a BLOCKED site. Capture diagnostics and checkpoint before any restart. Do not start until P-1..P-4 independently VERIFIED.

## Release gate

P-5 VERIFIED requires: P-1 archive/hash/no-overwrite tests; P-2 generated summaries and section-17 validator on clean/blocked/contaminated archives; P-3 policy preflight; P-4 diagnosed Z-5 failure cause plus verified serial resumable runner, per-site timeout, health watchdog, checkpointing, no BLOCKED retry, and archive integration; resolved 30-site list/order, 5 repeat sites, pinned provider/model/date and caps; clean fixed HEAD; independent PV. Only then may sub-master create local tag `research-run-1` (if absent) and record the tag/HEAD. Tag does not authorize a run by itself; P-5 must be VERIFIED first.
