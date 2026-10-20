# SESSION REPORT — W2 live runs, 2026-10-13 (all copies; originals untouched)

Scope: every headed/live run I (worker-2) executed this session, plus the
offline suite totals. Rule for the whole session: api_calls=0 (all reasoning
local, mock-LLM only, zero OpenRouter calls). Fills use value+"\n" (type +
Enter) so each fill commits.

## Live runs copied here (20)

### 01_M2-toggle-diag — FIX-A proof (todomvc, 3 todos, toggle 2nd)
- m2_rep_verify.json (run exec_1791905171718, 3 steps, 7 PNGs): PASS.
  Step3 snapped 632,284 -> 535,285 (domsnap), attempt 1, checked
  false->true, 0 warnings. Cause H1: perception label-text box misses the
  native 40px input by ~97px onto inert label text.
- m2_diag.js / m2_diag.json: scratch ground-truth probe (DOM bboxes,
  elementFromPoint, click variants). Proved native center click toggles.
- m2_perceive.json (40 elements, 0 inputs — the M3 starting condition),
  m2_crop.json (Fix A pipeline proof: Text Input conf 0.212 at true coords),
  m2_fullframe.json (Fix B proof: elem-anchor-0), m2_ocr.json (anchor words).
- m2_diag/ screenshots: m2_2todos.png (perception source), m2_3todos.png,
  m2_after_input_click.png, m2_topband2x.png (crop experiment).

### 02_M3-3rd-fill — recall fixes (todomvc, 3rd todo)
- m3_rep_verify.json (run exec_1791905579492, 3 steps, 7 PNGs): PASS.
  Step3 resolved text_match+ocr_anchor (683,162) with 2 honest WEAK warnings.
  OCR cross-check of after-shot: "Write code" TRUE + "3 items" TRUE.
- Fix A = yolo topband crop/upscale + gateway forward + crop_retry before
  lowconf. Fix B = merge OCR-anchor synth (scored rows; placeholder beats
  sidebar TypeScript).

### 03_M6-fullchain — todomvc add3+toggle2nd+Active+Clear (6 steps, 13 PNGs)
- m6_rep.json (run exec_1791905680262): PASS, url_change to #/active strong.
  Step3 Y (ocr_anchor), toggle Y (checked_state), end counter 2-items-left
  (OCR "2items left", Clear-completed gone). 1 WEAK warning (step 3).

### 04_T16-checkout-chain — saucedemo login->cart->checkout->finish
- t16_probe.js / t16_probe.json + t16_probe/ shots: CSS-selector scratch run
  (badge 1, cart 1 item, total $32.39, "Thank you for your order!").
- attempt1 (exec_1791906566990, 10 PNGs): FAIL step5 — link/""/coords has no
  proximity fallback for links (honest unresolved, no stale click).
- attempt2 (exec_1791906625545, 12 PNGs): FAIL step6 — badge text "1"
  false-matched description text ("1 AAA", score 3); Checkout button textless
  129px from recorded point. Lesson: single-char wantText over-eager.
- attempt3 (exec_1791906683883, 16 PNGs): FAIL step8 — checkout underline
  inputs 0-detect even at conf 0.05 (deterministic); anchor abstains (no
  anchor words). Step7 lowconf hit filled a phantom box (John NOT entered —
  screenshot proof).
- attempt4 = t16_rep.json (exec_1791906843898, 11 steps, 23 PNGs): PASS.
  Badge proxy {badge,""} proximity; Checkout proximity; form fills via
  placeholder-fragment targets {link Firs/Las ane/al} with input_value x3;
  Continue fuzzy_windowed_edit; Finish text_match. Verdict PASS weak0,
  url_change to checkout-complete.html, 0 warnings. OCR: Thank-you TRUE.
  (Only run4's rep JSON survives — executor overwrites t16_rep.json each run;
  attempts 1-3 evidence is their screenshot dirs + this report.)

### 05_B2-s1-login — fewer-shots proof (saucedemo, 3 steps, 3 PNGs)
- b2_rep_s1.json (run exec_1791907644092, s1_run1.json case): PASS url_change.
  Fills skipped after-shots (probe input_value x2 instead); only click-after
  captured. Screens 4 -> 2 PNGs vs old s1_rep1.json (3 states -> 1 state).

### 06_B8-6user-matrix — saucedemo logins (6 serial runs, 3-4 PNGs each)
- b8_matrix.js (driver) + b8_matrix.json (INDEX row, 6/6 MATCH).
- b8_rep_<user>.json x6 + case files + exec screenshot dirs.
- locked_out_user: honest FAIL (stayed on login, url_change-expected
  detail) — FAIL-expected, no false-DONE. Other 5: PASS inventory.html.

### 07_T15-http-smoke — MCP HTTP transport (no screenshots by design)
- t15_smoke.js + t15_http_smoke.json: health 45ms + init 5ms + list 5 tools
  14ms + status 30ms + perceive example.com 9 elements/594 chars in 8705ms.
  PASS over live HTTP (port 5123).

### 08_T10-mcp-loop — MCP-tools login loop (4 runs, shots in mcp-shots/)
- t10_loop.js (driver, 4 runs) + t10_loop.json (LAST run only — overwritten).
- Runs 1-2 FAIL (honest): run1 turn-2 transient warmup; runs 1-3 submitted
  EMPTY fields ("Epic sadface: Username is required" screenshot) because
  mid-form MCP perceives NAVIGATE (page reload wipes typed values).
- Run 4 PASS 9/9 turns: url_change inventory.html + logout/products text +
  OCR cross-check + evidence + reset. Driving fix, no code change.
- mcp-shots/ holds 39 Oct-13 PNGs from all 4 runs (act_before/after,
  perceive); run attribution by mtime, see COMMENTS.txt.

## Offline work this session (no screenshots)
- Suites: vision/test 103 -> 147 (+44: mine +33 across M1/M2/M3/P3/B2/B3/B4/
  B5/B6/B7 lanes, others +11 incl. B1x3), MCP 14/14 throughout, all green.
- Code: goalPlanner gates, executeTests domsnap/crop_retry/ocr_anchor-tag/
  PASS_WEAK verdict/fewer-shots gate, anchorSynth, archetypes, runMemory,
  batchPlan, zeroLoop, reportSchema, merge anchor wire, yolo topband,
  gateway crop forward. P0 git baseline-r3 (68 files). Docs: RUN_ANALYSIS
  M2/M3/M6/P7/B8 sections, MCP_LIVE_PROOF table+verdict, SUGGESTIONS ENTRY-2.

## Screenshot-count observation — VERDICT: TRUE, not a glitch
See table below (per exec dir: before/after/merged/failure PNG counts).

| run | steps | before | after | merged | failure | total |
|---|---|---|---|---|---|---|
| t14-era R3 (Oct-11) | 2 fills | 1 | 2 | 2 | 1 | 6 |
| M2 verify | 3 | 1 | 3 | 3 | 0 | 7 |
| M3 verify | 3 | 1 | 3 | 3 | 0 | 7 |
| M6 chain | 6 | 1 | 6 | 6 | 0 | 13 |
| T16 run4 | 11 | 1 | 11 | 11 | 0 | 23 |
| B2 s1 (fewer-shots) | 3 | 1 | 1 | 1 | 0 | 3 |
| B8 user run | 3 | 1 | 1 | 1 | 0 | 3-4 |

Rule (constant all session): exactly 1 after-shot + 1 merged-evidence render
per EXECUTED step, plus 1 before-shot per test (+1 failure shot on FAIL).
Early runs only LOOKED lean (ss-login-ss2) because chains were 2-3 steps;
late chains are 6-11 steps so totals grew 6 -> 23. Per-step count never
changed — nothing glitched. The "extra" shots are merged YOLO+OCR evidence
renders (audit trail), plus failure shots, plus (B2-era) refresh shots.
Reason it cannot simply be "undone": merged images are the re-detection
audit trail reviewers check. Mitigation already shipped as B2 fewer-shots:
fills skip after-shots (probe input_value verifies instead) — s1 went
4 PNGs -> 2, B8 runs take 3-4. Future savings need the same treatment for
clicks, which is NOT safe today (clicks need visual re-detect).

## Excluded on purpose (not mine / not session)
- Oct-11 exec dirs (looper T14 era) and Oct-13 15:07 w3_* runs: other lanes.
- 16:53 exec dirs (b8_rep_standard/locked/...) : another worker's concurrent
  matrix (short filenames vs my full-username files). Not copied.
- vision/storage/outputs/*.json bulk: only my lanes' reports copied; full
  ledger stays in docs/R3_RESULTS.jsonl (38 W2 lines this session).
- Originals: untouched — everything here is a COPY (copyFileSync, verified
  by re-reading one source after copy).
