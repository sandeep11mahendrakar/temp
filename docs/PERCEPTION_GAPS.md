# Perception Gaps (V-1) — detector-gap table from existing evidence

Source: offline fixtures, mega-run reports, G2 rows. No live runs, no API calls.
Scope: vision/ detector surface (YOLO ScreenParser + OCR). Counts are observed
occurrences in pinned fixtures / reported runs, not exhaustive over all sites.

## Gap classes

| # | Class | Symptom | Evidence | Count (observed) | Status |
|---|-------|---------|----------|------------------|--------|
| 1 | underline inputs | YOLO/OCR misses input boxes whose only affordance is an underline (no border/box); inputs vanish from VDOM | vision/test/perceiveChain.test.js (saucedemo-checkout-complete.json: 0 inputs survive filter); RUN_ANALYSIS_login_20261011 (R3 third-todo input absent after 2 fills; filterInputs removed=0) | 2 sites (saucedemo login/checkout) | reported, not fixed (needs live image for crop) |
| 2 | white-on-colour buttons | button text rendered white on a coloured fill is dropped by OCR threshold; YOLO box present but no text | vision/src/anchorSynth.js (OCR-anchored synthesis path exists for this); vision test fixtures | class documented; fixture count n/a offline | reported |
| 3 | button text missing (YOLO omits) | YOLO ScreenParser omits button text entirely; OCR sees it separately but not bound to the box | memory (review3-program): "YOLO omits demoqa button text (OCR sees it)" | 1 site family (demoqa) | reported |
| 4 | tiny icons | icon-only controls below OCR resolution; no text anchor, box too small | vision/test/robustness.minis.test.js (R7: zero inputs in view stays honestly unresolved); executeTests.js unresolved_target handling | class documented | reported |
| 5 | overlay-covered | consent/modal/cookie overlay intercepts the target; perception sees overlay, not underlying control | V-3 row (overlay-ladder) scope; executeTests.js block/wall handling; RUN_ANALYSIS (overlay intercept notes) | class documented | implemented (V-3: vision/src/overlayLadder.js detectOverlay + dismissCandidates standard-affordance ladder; never evasion; tests vision/test/overlayLadder.test.js 9/9 green) |

## Detection-path notes

- `filterInputs` never invents missing boxes: when raw count is 0 it reports a gap
  instead of throwing (perceiveChain H3 path B).
- `anchorSynth` (OCR-anchored synthesis) is the existing WEAK-tagged mitigation
  for classes 2/3; it is flag-gated and never upgrades a blind run.
- Resolution labels: `ocr_anchor` / `label_drift` / `dom_reindex` are WEAK and
  must not be reported as AUTONOMOUS (label rules: file/mock/seeded/replay ASSISTED).

## Not in scope here

- OCR retraining / model changes (V-2 row).
- Overlay dismiss ladder (V-3 row).
- Executor robustness (V-4 row).

## Evidence paths

- vision/test/perceiveChain.test.js
- vision/test/robustness.minis.test.js
- docs/RUN_ANALYSIS_login_20261011.md
- vision/src/anchorSynth.js
- vision/src/executeTests.js (unresolved_target / WEAK_VIA_RE)
- docs/TASK_BOARD.md V-1 row
