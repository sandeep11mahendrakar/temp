# ORACLE CONTRACT — expect_rejection + verdict/app_outcome (G3, D21 frozen)

Do not rename the values below. Two verdict layers coexist by design:

1. Executor verdict (`result.verdict`, P3): PASS | PASS_WEAK(n) | FAIL.
   Answers "did the mechanics work". Unchanged by G2/G3.
2. Oracle verdict (`result.oracle`, G2): verdict + app_outcome + snip300 +
   ocr_count. Answers "what did the app decide".

## Frozen value sets (D21)

- verdict: PASS | FAIL | OBSERVED | BLOCKED
- app_outcome: accepted | rejected | n/a

## expect_rejection (test-case field, optional boolean)

A test case with `expect_rejection: true` asserts that the app REFUSES the
action (locked-out login, bad credentials, empty required submit). Rule:

- expect_rejection + oracle-met (rejection text matched, or no navigation
  when navigation was expected and the page is empty)
  => verdict PASS, app_outcome rejected.
  A satisfied negative oracle is app-rejected, test-PASS — never test-FAIL.
- Without expect_rejection: urlChanged or expected text present
  => PASS / accepted. No OCR at all (0 words, no change, no text)
  => OBSERVED / n/a (WEAK: seen but unjudgeable — never PASS, never FAIL).
  Otherwise => FAIL / (rejected when rejection text present, else n/a).

## Oracle kinds (K2)

Each `tc.oracle` is `{kind, expect, strength}`. Kinds:

- dialog_message: a modal/dialog/banner text appears. expect = regex for
  the message (e.g. `Epic sadface|locked out`). strength MED.
- new_page_url: navigation to a new URL. expect = regex for the URL
  (e.g. `inventory|checkout-complete`). strength STRONG.
- bbox_delta: a target element's box moved/appeared between states.
  expect = `visible-state-changed`. strength MED.
- value: a field holds an exact value (DOM read-back). expect = the value.
  strength STRONG (observed, not self-reported).
- text_present: page/body text contains a pattern. expect = regex.
  strength MED. (Already used: loginRejected, counterText.)
- text_absent: page/body text must NOT contain a pattern (uncheck removes
  selection text, modal close hides dialog text, collapse hides body text).
  expect = regex. strength CONDITIONAL: STRONG when urlChanged confirms the
  transition, MED for bare absence on a non-empty page; empty haystack
  without navigation => OBSERVED (vacuous absence never PASSes).
- count_delta: a counter changed by N (e.g. `2 items left`). expect =
  `N|regex`. strength MED.
- state_diff: any observable visual-state change. expect =
  `visible-state-changed`. strength MED. (Already used.)

Pre-existing kinds reaffirmed (not renamed): url_change (STRONG),
observed (WEAK, recorded-only, never PASS/FAIL alone).

## Report carriage (G3)

- Execution reports carry per-result `oracle: {verdict, app_outcome,
  snip300, ocr_count}` (additive; legacy status/verdict untouched).
- reportSchema case rows carry `verdict` + `app_outcome` (defaults to
  `'n/a'` when the source result predates the oracle); the markdown INDEX
  row keeps ref/verdict/pass_rate/cost/storage/sha (verdict already there).
- No-OCR runs are reported as OBSERVED, never inflated to PASS.
