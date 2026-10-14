# RUN ANALYSIS — saucedemo goal-login `run_1791724255517` (2026-10-11)

Read this before touching login/form/goal code. Full trace:
`vision/storage/outputs/run_1791724255517_exploration_history.json`,
screenshots `vision/storage/screenshots/run_1791724255517/`.

## What actually happened (agent did NOT log in — the human did)

| # | Time (IST) | Agent action | Result | Truth |
|---|---|---|---|---|
| 1 | 13:11:04 | fill username `standard_user` (elem-2) | executed | correct, verified |
| 2 | 13:11:13 | submit Login — **password field still empty** | stayed on `/` (fail, recorded) | model skipped the 2nd fill |
| 3-4 | 13:11:19/25 | clicked Login twice more | repeated/skipped | flailing |
| 5 | 13:11:54 | clicked junk `°` button | no-op new state | flailing |
| GAP | 13:11:56→13:12:18 (24 s, no agent step) | **human filled password + logged in manually** | browser → inventory.html | intervention window |
| 6 | 13:12:18 | `anti_laziness_fallback` click on stale label `performance_glitch_user` | landed on inventory (user's page) | label was login-page credential hint text, misclassified as link |
| 7-8 | 13:12:21+ | clicked product links on inventory | executed | exploring user's session |

Totals: 8 steps, 6 states, 3 URLs, **fill_actions = 1** (the smoking gun —
a login needs 2), 0 action errors, 1 generated test (replays junk clicks).

## Root causes (all reproduced from artifacts, no speculation)

- **R1 model myopia.** Prompt rule 4 (fill ALL fields, top=username/bottom=
  password, distinct values) + SEED creds WERE in the prompt — Nemotron still
  submitted after one fill. Prompt text alone does not constrain this model.
- **R2 no deterministic pre-submit guard.** Nothing stopped submit-with-empty-
  password. Fixed in R3-T7 (`pickUnfilledInput` + form guard, 38/38 tests).
- **R3 phase judge cannot attribute change.** `login-submit`/`login-verify`
  completed on the URL change the HUMAN caused. Any headed run with an
  observer who touches the browser can false-DONE phases. An intervention
  heuristic is unreliable — instead, generated goal tests
  must be distilled to phase-relevant steps (worker W3), and demos are
  hands-off (Section 5).
- **R4 OCR placeholder blindness (known since Aug).** Both inputs had empty
  text (`elementText: ""`). Top/bottom positional heuristic is the only
  signal — now enforced deterministically by the guard, not asked of the LLM.
- **R5 trailing-slash false positive.** `urlChanged` treated
  `https://x` → `https://x/` as navigation. Fixed (strip + lowercase).

## What R3-T7 changed (all offline-verified, 38/38)

1. `thought` field (ReflAct): model must state screen-vs-phase relation
   before acting; persisted to `storage/outputs/<run>_llm_calls.jsonl` (new).
2. Lesson buffer (Reflexion-lite, deterministic, zero quota): last 3 failure
   lessons injected into every prompt.
3. Form-completion guard: submit/click-submit with an empty sibling input is
   converted into a password-aware fill (SEED creds, bottom-or-/pass/ rule).
4. `urlChanged` trailing-slash tolerant.
5. Research basis (no training, model-agnostic): ReAct/ReflAct/Reflexion,
   AWS MCP tool-design (bundle forms, structured errors), ACL cost-parity.

## 5 behavior scenarios (worker runs these, serial, headed, hands-off)

| ID | Goal | Creds | Expect |
|---|---|---|---|
| S1 | `test the login` | standard_user/secret_sauce | 2 fills → submit → inventory; phases honest |
| S2 | `test the login` | locked_out_user/secret_sauce | honest FAIL, error text recognized, no false-DONE |
| S3 | `login then add backpack to cart` | standard | cross-phase chain, cart badge `1` |
| S4 | `login, add item, checkout` | standard + John/Doe/12345 | full chain to `checkout-complete` |
| S5 | `logout` (from logged-in state) | standard | back to login page, verify honest |

Per scenario record: steps, fills, guard trips, phases trace, llm_calls
skim, verdict vs Expect. One section each appended to this file.

## Demo discipline (hands-off)

Once a headed run starts, do NOT touch the browser — any intervention
poisons phase attribution (R3). If you must intervene, note the timestamp;
the run's phases after that point are DO-NOT-CITE.

## S1 result — `test the login` (standard creds) — INCOMPLETE/quota

Run `run_1791725272124` (headed, hands-off, zero intervention). Termination
`llm_error` on the daily free cap (openrouter 429 free-models-per-day,
Remaining 0, reset 05:30 IST) — NOT a task verdict on login itself.
Evidence: `vision/storage/outputs/run_1791725272124_exploration*.json`,
`test_cases_run_1791725272124_exploration.json`, `run_1791725272124_llm_calls.jsonl`
(37 calls), screenshots `vision/storage/screenshots/run_1791725272124/`.

- Steps 11, states 6, URLs 1 (never left `/`), errors 0, fills 7, clicks 4.
- Phases: login-fill DONE (step 1, model fill verified); login-submit OPEN;
  login-verify OPEN; blocked null. Honest — no false-DONE (the one Login
  click stayed on `/`, judge correctly refused).
- Guard trips: 6 (`form_guard_fill` on empty-text fragments elem-10/1/2/11/12/9).
  Smoking gun: all 7 fills carried the USERNAME value; the password value was
  never filled once — one-fill-per-step + empty OCR text refilled username
  into fragments while the real password field starved. Login click (t5) with
  empty password honestly failed.
- Model laziness confirmed again: ~10 premature `done` outputs, every one
  refused by reprompt/floor/fallback gates. Post-quota fallbacks clicked junk
  hint-labels (`performance_glitch_user` as link — R4 class).
- Generated test: 1 test x 5 steps (`fill -> fill -> fill(standard use) ->
  click(Login) -> fill(standard use)`) — replays junk, undistilled (run
  predates TASK C wiring). Verdict vs Expect: NOT MET (incomplete, quota);
  retry S1 post-reset with TASK B batching; expect 2 fills (user+pass) then
  submit -> inventory.

## TASK B note — form-cluster batching implemented (offline, unvalidated live)

`pickUnfilledInputBatch` + row-grouping (16px) + cap 4 in explorer.js;
first field executes now, siblings queue with zero LLM cost; 6 new tests,
suite 49/49. Live proof deferred to S1-retry (quota). S2-S5 likewise queued
post-reset (05:30 IST).

## TodoMVC complex (R3-T14)

Looper, zero-API (no LLM calls), 6/6 run budget used. Target
https://todomvc.com/examples/react/dist/, accumulated single-step files
(each run replays all steps from scratch in a fresh browser).
Files: vision/storage/outputs/t14_run{1,2,3,5,6}.json + t14_rep{1,2,3,3b,5,6}.json.
Technique note: executeTests fill does not press Enter, so values carry a
trailing newline - documented, not hidden.

- R1 PASS (verified, not just claimed): "Buy milk" + "1 item left" in gateway
  OCR of the after-fill screenshot. Fill+newline commits the entry.
- R2 PASS (verified): "Buy milk" + "Read book" + "2 items left" via OCR.
- R3 FAIL (honest) + retry R3b FAIL (deterministic, not flake): step-3 fill
  unresolved_target - once todos exist the EMPTY input is no longer detected
  (40 elements, zero text_input/search_field; placeholder OCR fires only on
  the pristine page) and nothing sits within 90px proximity of the input
  coords. Third todo BLOCKED by perception gap (stale coords correctly never
  clicked).
- R5 PASS (verified): replay-2 + toggle-click + Active-filter. All 4 steps
  text_match-resolved. Honest navigation signal: URL -> .../dist/#/active.
  BUT the toggle did not complete: footer still "2 items", no Clear-completed
  (label click is not checkbox toggle in this React build).
- R6 PASS-weak (honest): replay-2 + proximity-resolved circle click
  (resolution proximity, mechanical success). Toggle STILL failed: "2 items
  left", no "Clear completed" in OCR. Checkbox circle needs exact-center hit;
  stuck twice -> BLOCKED.
- NOT demonstrated (over budget): Clear completed, final count assert.

Verdict vs plan: PARTIAL. Proven: add todos, filter navigation. Blocked:
third-todo perception gap + checkbox-toggle precision. No false passes
claimed - every PASS above was OCR cross-checked; weak-fallback PASSes that
failed cross-checks are reported as step failures.

## MCP-manner Loop B (looper, zero OpenRouter calls)

Brain-switch round: API quota dead, agent reasoned, same pipeline hands.
API calls made: 0 (all reasoning local; perception via gateway, driving via
executeTests replay files). Hands-off held throughout.

### B1: T14 3rd-fill variance retry -> FAIL (deterministic x3)

Re-ran t14_run3.json to t14_rep3c.json: identical unresolved_target on the
empty post-todo input. The gap is structural (YOLO/OCR), not variance.
T14 stays PARTIAL as recorded above.

### S1: saucedemo login -> PASS (strong, url_change)

Perceive (5004 capture + 5000 process): 18 elements; inputs empty-text at
(640,174) TOP=user / (640,228) BOTTOM=password; Login button (640,325).
File s1_run1.json (3 steps, accumulated single chain, fresh browser):

| turn | action | resolution | verification seen |
|---|---|---|---|
| 1 | fill user field | proximity, ok | input_value |
| 2 | fill pass field | proximity, ok | input_value |
| 3 | click Login | text_match, ok | url_change -> .../inventory.html |

Report s1_rep1.json: url_after inventory.html, verification strong
(url_change), summary signals {url_change:1}, 0 warnings. Screenshots
exec_1791731863258. Contrast vs API run: the API agent filled username 7x
and never the password; the replay file carries both values deterministically,
so the MCP-manner login succeeds first try. Deviation: creds live in the run
JSON (executor requirement; page-public demo values already in repo test
precedent) - kept OUT of docs/board. Verdict: S1 MET. S2-S5 not run (out of
ordered scope; same replay method applies directly).

## T8-regress + N2 input-filter check (W2, 2026-10-13, offline, report-only, no src edits)

Serial-live gate: ports 5000-5004 + 5123 free (netstat empty), no live claim active (W1 T7 offline-only, looper DONE). Zero browser launches, zero API calls, zero .env reads.

### Suites (green, re-run this session)

- vision/test/*.test.js: 103/103 pass, 0 fail (10 suites; incl inputFilter fragment-collapse + T7 gemini tests)
- vision/mcp/*.test.js: 14/14 pass, 0 fail (4 suites)
- node --check clean: vision/src/inputFilter.js, vision/test/inputFilter.test.js

### N2 method

Ran filterInputs (pure, defaults NMS_IOU 0.3 / CONTAINMENT 0.8 / MIN_W 80 / MIN_H 18 / ROW_DY 12) over recorded perceive snapshots (LoopB-step1 artifacts, no live perceive to respect serial-live=1). Columns: id|type|cx|cy|w|h|kept|rule. Defects reported only, no fix (out of lane scope).

### Page 1: saucedemo-login (perceive_1791728334945_visual_dom.json, 18 elements, 2 inputs, removed=0)

| id | type | cx | cy | w | h | kept | rule |
|---|---|---|---|---|---|---|---|
| elem-1 | text_input | 640 | 228 | 293 | 35 | KEPT | none fired |
| elem-2 | text_input | 640 | 174 | 293 | 34 | KEPT | none fired |

No defect: both real fields kept (top=user 174, bottom=password 228), non-inputs untouched.

### Page 2: todomvc-empty (state_002_before_T14-R1_visual_dom.json, 27 elements, 1 input, removed=0)

| id | type | cx | cy | w | h | kept | rule |
|---|---|---|---|---|---|---|---|
| elem-6 | search_field | 790 | 162 | 554 | 69 | KEPT | none fired |

No defect: single empty-todo input kept.

### Page 3: todomvc-3todos attempt state (t14_rep3/3b/3c step-3 current state, ~40 elements, 0 inputs, removed=0)

| id | type | cx | cy | w | h | kept | rule |
|---|---|---|---|---|---|---|---|
| (none) | - | - | - | - | - | - | no input-type element present |

Defect (report-only, NOT fixed): real-dropped AT DETECTION level, not by filter. After 2 fills the empty new-todo input is absent from YOLO/OCR output (zero text_input/search_field in ~40 elements), so step 3 fails unresolved_target x3 deterministic (rep3/3b/3c). filterInputs removed=0 with 0 inputs - it never empties and cannot invent the missing box. Same class as RUN_ANALYSIS R3/R6 perception gap. Candidate follow-up (not mine): detector-side placeholder recall for post-todo empty input.

### Fragment-collision evidence (offline suite, not live)

vision/test/inputFilter.test.js: 2 stacked fields + 4 fragments collapse to exactly the 2 real fields (NMS+containment+row rules) - PASS within 103/103. No frag-kept observed in the 3 audited pages (removed=0 everywhere because no overlapping/small fragments present in these snapshots).

Verdict: T8 suites GREEN; N2 filter keeps all real inputs on pristine pages; only defect is the known detector-level missing 3rd-todo input. No src changes made.

## W3 LIVE LoopB (2026-10-13, worker-3, headed, api_calls=0, 5 runs)

Loop=B (no MCP client in this session; direct executeTests replay files, zero OpenRouter calls).
VISION_HEADED=true. Services auto-started per run, shut down after. Run files:
vision/storage/outputs/w3_todo_add3.json, w3_todo_toggle2.json, w3_todo_active.json,
w3_todo_clear.json + reuse s1_run1.json. Reports w3_rep_*.json. Screenshots per evidence_dir.

SEQ target: todomvc add Buy milk|Read book|Write code (fill+Enter via trailing newline)
-> toggle 2nd -> Active -> Clear completed -> expect 2 items left; then saucedemo
standard_user/secret_sauce -> expect inventory.html.

| turn | action | elem | verif | ok | shot/report path |
|---|---|---|---|---|---|
| 1 | fill Buy milk | search_field What needs to be done? (790,162) | text_match, input_value | ok | storage/screenshots/exec_1791904007299 / w3_rep_add3.json |
| 2 | fill Read book | same input | text_match | ok | same run |
| 3 | fill Write code | same input | lowconf_retry (WEAK) | ok-mech | same run, report PASS-weak body_text_fallback |
| 4 | toggle 2nd (Read book) checkbox (632,284) | radiobox | check_bbox x3, checked_state FAIL | FAIL honest | storage/screenshots/exec_1791904034930 / w3_rep_toggle2.json |
| 5 | click Active (762,335) | text Active | text_match + url #/active | PASS | storage/screenshots/exec_1791904058951 / w3_rep_active.json |
| 6 | clear-chain (toggle+Active+Clear completed) | toggle step | check_bbox x3 FAIL at step3 | FAIL honest (blocked upstream) | storage/screenshots/exec_1791904076701 / w3_rep_clear.json |
| 7 | saucedemo fill user + fill pass + click Login | text_input x2 + button Login | proximity x2 input_value + text_match url_change | PASS strong | storage/screenshots/exec_1791904095144 / w3_rep_s1.json |

step3_resolved: Y (mechanical ok via lowconf_retry, WEAK - not text_match/proximity)
toggle_ok: N (2 honest FAILs: checkbox/radio did not toggle after 3 attempts, checked_state verif)
end_counter: NOT proven (Clear completed never reached; toggle blocked upstream)
url_after: todomvc #/active (Active PASS); saucedemo https://www.saucedemo.com/inventory.html (STRONG url_change)

Verdict: PARTIAL. Proven: add-todos (PASS-weak, 3rd fill weak-signal) + Active filter
navigation (url #/active) + saucedemo login (STRONG). Blocked: checkbox-toggle precision
(same structural gap as T14-R6 prior: label click is not checkbox toggle in this React
build; check_bbox retries exhaust). Clear-completed + final 2-items assert NOT demonstrated.
No false passes. api_calls=0 (executeTests path makes zero LLM calls by construction).
Runs used: 5/8. Turns used: within 12.

## M2 toggle-diag (W2, 2026-10-13, LoopB headed api0)

Ground truth (DOM, 1280x900): 3 todos added; 2nd input bbox 40x40 center (535,285); elementFromPoint(535,285)=input.toggle; direct center click toggles (checked true, li completed, counter 2 items left). Executor had clicked (632,284): elementFromPoint=LABEL with control=false (inert, React labels unassociated) -> 3 honest fails.

Cause H1: perception label-text box (elem-15 radiobox 116x27 conf 0.394) center misses native input by ~97px. TRUE boxes elem-5/7 (31px, conf 0.52/0.58) existed; toggle-all chevron present (toggles elem, Y).

FIX-A (executeTests.js): snapCheckToNativeInput — DOM-snap check clicks to li native input center; focus+Space ladder now targets snapped input (FIX-B). Evidence: check_snap + via check_bbox+domsnap. Live verify m2_rep_verify.json: step3 snapped 632,284->535,285, attempt1, checked false->true, PASS 0 warnings. Tests +3 (t5 17/17). Suites Vision 109/109 + MCP 14/14 at M2 close.

## M3 empty-input-recall (W2, 2026-10-13, LoopB headed api0)

Starting condition: 2-todo state, 40 elts, 0 inputs. Fix A: yolo topband param (crop y0..35pct upscale2x, boxes mapped to orig frame) + gateway crop_topband forward + executor crop_retry attempt BEFORE lowconf. Pipeline proof m2_crop.json: Text Input conf 0.212 at (515.7,128.6,1064.9,197.2) = true input.

Fix B: merge OCR-anchor synth (anchorSynth.js pure): zero inputs + anchor row in top40pct -> WEAK search_field tagged ocr_anchor. Scored rows by anchor hits (placeholder 2 beats sidebar TypeScript 1; word-boundary regex). Full-frame proof: elem-anchor-0 (522,147,844,176) center (683,161) inside real input.

Live verify m3_rep_verify.json: steps 1-2 text_match; step3 text_match+ocr_anchor (683,162) PASS with 2 honest WEAK warnings; OCR cross-check of after-shot: Write code TRUE + 3 items TRUE. Tests: mergeAnchor 3/3 + crop-order pin. Suites Vision 113/113 + MCP 14/14. Tags: crop_retry, ocr_anchor, domsnap.

## M6 todomvc-fullchain (W2, 2026-10-13, LoopB AUTH headed api0, 1 run)

Chain m6_chain.json: add Buy milk + Read book + Write code (step3 via text_match+ocr_anchor, 1 WEAK warning) + toggle 2nd (domsnap, checked_state) + Active (#/active) + Clear completed. Result PASS url_change strong. OCR cross-checks: post-toggle 2items left + Clear present + Read struck; final 2items left + Clear gone + Buy milk/Write code shown. step3 Y, toggle Y, end_counter 2-items-left. Evidence m6_rep.json + exec_1791905680262 shots.

## P7 live-serial-last (W2, 2026-10-13, LoopB headed api_calls=0, sole driver)

T15 HTTP smoke (t15_http_smoke.json): live MCP --transport http on 5123 — health 45ms + init 5ms + tools/list 5 tools 14ms + status 30ms + perceive example.com 9 elements/594 chars in 8705ms. PASS. Evidence 1-liner for R3-T15 flip: 9el/594ch over live HTTP, api0.

T16 checkout chain (t16_chain.json -> t16_rep.json, 4 runs): run1 FAIL step5 (link/""/coords, no proximity for links); run2 FAIL step6 (badge text "1" false-matched description TEXT score3 — single-char wantText over-eager, then Checkout textless button 129px from recorded point); run3 FAIL step8 (checkout underline inputs 0-detect at conf 0.05 twice-tested deterministic; anchor abstains honestly); run4 PASS 11/11: badge proxy {badge,""} proximity, Checkout proximity, form fills via placeholder-fragment targets {link Firs/Las ane/al} with input_value x3, Continue fuzzy_windowed_edit, Finish text_match. Verdict PASS weak0, url_change to checkout-complete.html strong, 0 warnings. OCR cross-check final shot: Thank you for your order TRUE + Complete TRUE. Probe run t16_probe.json (CSS locators): badge 1, cart 1 item, total $32.39, header Thank-you. P3 shape validated live (clean PASS stays PASS).

T17 final proof: suites Vision 114/114 + MCP 14/14 green; evidence sweep 16/16 files on disk; services stopped by me (5000-5004+5123 free, slot released). api_calls=0 throughout P7 (all reasoning local, perception via gateway, driving via replay/scratch files).

## B8 live-matrix (W2, 2026-10-14, LoopB headed api_calls=0, sole driver, 6 serial runs)

Per hint user (LOGIN_HINTS): author login replay -> executor -> verdict vs expects -> mergeRun memory -> reportSchema INDEX. Results MATCH 6/6: standard/problem/error/visual/performance_glitch PASS (inventory.html, url_change); locked_out_user FAIL-expected (fills+click executed, stayed on login, url_change-expected detail — honest FAIL, no false-DONE). Matrix report b8_matrix.json with INDEX row (ref run-b8-matrix-*, pass_rate 1, cost 0, sha). Deltas per site-run recorded via B4 mergeRun. Services stopped after (ports free). api_calls=0 throughout (Muse-brain local reasoning, mock-LLM only, zero OpenRouter calls).
