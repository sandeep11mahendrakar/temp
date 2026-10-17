'use strict';
// V-6 oracle-adversarial audit (numeric): synthetic fixtures ONLY - no live, no network, no LLM.
// Probes false-PASS vectors across ALL oracle kinds. Each test asserts the
// contract-compliant (non-false-PASS) outcome. A failure here = a real finding.
const test = require('node:test');
const assert = require('node:assert/strict');
const { verdictFor, evaluateKind, KNOWN_KINDS, KIND_EVAL } = require('../src/oracle');

function V(tc, obs) { return verdictFor(tc, obs); }

test('V-6 action-skipped (no observables) => never PASS (generic)', () => {
  const r = V({ expected_text: 'Welcome' }, { urlChanged: false, ocrWords: 5, pageText: 'other text' });
  assert.notEqual(r.verdict, 'PASS');
});

test('V-6 action-skipped with no OCR and empty haystack => OBSERVED (never PASS)', () => {
  const r = V({ expected_text: 'Welcome' }, { urlChanged: false, ocrWords: 0, pageText: '' });
  assert.equal(r.verdict, 'OBSERVED');
});

test('V-6 pre-existing expected text does not upgrade a skipped action beyond contract (documented)', () => {
  // Observable-based oracle: text present => accepted. Action-execution is the
  // executor's PASS/PASS_WEAK flag, not this oracle. Recorded as by-design.
  const r = V({ expected_text: 'Welcome' }, { urlChanged: false, ocrWords: 5, pageText: 'Welcome' });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.app_outcome, 'accepted');
});

test('V-6 count_delta want=0 with no change is satisfied (by-design zero-delta assertion)', () => {
  const r = V({ oracle: { kind: 'count_delta', expect: 0 } },
    { countBefore: 3, countAfter: 3, ocrWords: 1 });
  assert.equal(r.verdict, 'PASS');
});

test('V-6 count_delta wrong delta => FAIL (not PASS)', () => {
  const r = V({ oracle: { kind: 'count_delta', expect: 1 } },
    { countBefore: 3, countAfter: 3, ocrWords: 1 });
  assert.equal(r.verdict, 'FAIL');
});

test('V-6 count_delta absent evidence => FAIL (never PASS)', () => {
  const r = V({ oracle: { kind: 'count_delta', expect: 1 } }, { ocrWords: 1 });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(evaluateKind({ oracle: { kind: 'count_delta', expect: 1 } }, {}).satisfied, false);
});

test('V-6 dialog_message with no dialogs => FAIL (never PASS)', () => {
  const r = V({ oracle: { kind: 'dialog_message', expect: 'saved' } }, { ocrWords: 1 });
  assert.equal(r.verdict, 'FAIL');
  assert.equal(evaluateKind({ oracle: { kind: 'dialog_message', expect: 'saved' } }, { dialogs: [] }).satisfied, false);
});

test('V-6 new_page_url with no popups => FAIL (never PASS)', () => {
  const r = V({ oracle: { kind: 'new_page_url', expect: 'example.com' } }, { ocrWords: 1 });
  assert.equal(r.verdict, 'FAIL');
});

test('V-6 text_absent present text => FAIL (never vacuous PASS)', () => {
  const r = V({ oracle: { kind: 'text_absent', expect: 'Error' } }, { pageText: 'Error occurred', ocrWords: 1 });
  assert.equal(r.verdict, 'FAIL');
});

test('V-6 text_absent absent on empty haystack => OBSERVED (never PASS)', () => {
  const r = V({ oracle: { kind: 'text_absent', expect: 'Error' } }, { pageText: '', ocrWords: 0 });
  assert.equal(r.verdict, 'OBSERVED');
});

test('V-6 unknown kind => never PASS (FAIL or OBSERVED)', () => {
  const r = V({ oracle: { kind: 'totally_made_up', expect: 'x' } }, { pageText: 'x', ocrWords: 1 });
  assert.notEqual(r.verdict, 'PASS');
  assert.ok(!KNOWN_KINDS.has('totally_made_up'));
});

test('V-6 evaluateKind unsupported kind reported unsupported+satisfied false', () => {
  const ev = evaluateKind({ oracle: { kind: 'nope', expect: 'x' } }, { pageText: 'x' });
  assert.equal(ev.supported, false);
  assert.equal(ev.satisfied, false);
});

test('V-6 expect_rejection with rejection text => PASS/rejected (by-design negative)', () => {
  const r = V({ expect_rejection: true, expected_text: 'locked out' },
    { urlChanged: false, ocrWords: 1, pageText: 'Account locked out' });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.app_outcome, 'rejected');
});

test('V-6 expect_rejection without rejection text and no change => not PASS', () => {
  const r = V({ expect_rejection: true, expected_text: 'locked out' },
    { urlChanged: false, ocrWords: 1, pageText: 'ok' });
  assert.notEqual(r.verdict, 'PASS');
});

test('V-6 url_change kind: timer-driven urlChanged => PASS (by-design, URL changed)', () => {
  const r = V({ oracle: { kind: 'url_change', expect: 'x' } }, { urlChanged: true, ocrWords: 1, pageText: 'x' });
  assert.equal(r.verdict, 'PASS');
});

test('V-6 url_change kind: no urlChanged and no text => not PASS', () => {
  const r = V({ oracle: { kind: 'url_change', expect: 'x' } }, { urlChanged: false, ocrWords: 1, pageText: 'other' });
  assert.notEqual(r.verdict, 'PASS');
});

test('V-6 non-KIND_EVAL known kinds (value/bbox_delta/state_diff/observed) never false-PASS on absent evidence', () => {
  for (const k of ['value', 'bbox_delta', 'state_diff', 'observed']) {
    const r = V({ oracle: { kind: k, expect: 'x' } }, { urlChanged: false, ocrWords: 1, pageText: 'other' });
    assert.notEqual(r.verdict, 'PASS', k);
  }
});

test('V-6 KIND_EVAL and KNOWN_KINDS consistent (contract integrity)', () => {
  for (const k of KIND_EVAL) assert.ok(KNOWN_KINDS.has(k), 'KIND_EVAL subset of KNOWN_KINDS: ' + k);
});
