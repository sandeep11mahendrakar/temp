'use strict';

// O1 evaluator-kinds regression (numeric): dialog_message / new_page_url /
// text_present-regex-bounded / count_delta. Pure oracle.js only — no browser,
// no network, no LLM. CONTROL tests pin honest not-satisfied (no false PASS).

const test = require('node:test');
const assert = require('node:assert/strict');

const { verdictFor, evaluateKind, regexBounded } = require('../src/oracle');

const tc = (kind, expect) => ({ oracle: { kind, expect, strength: 'MED' } });

// ---------------------------------------------------------------- text_present
test('O1 text_present regex-bounded: regex OR literal both satisfy => PASS', () => {
  assert.equal(verdictFor(tc('text_present', 'You have done a (double|right) click'),
    { pageText: 'You have done a double click', ocrWords: 6 }).verdict, 'PASS');
  assert.equal(verdictFor(tc('text_present', '2 items left'),
    { pageText: 'Buy 2 items left', ocrWords: 5 }).verdict, 'PASS');
  // Pre-existing regression pin (oracleTextAbsent): text_present satisfied.
  assert.equal(verdictFor({ oracle: { kind: 'text_present', expect: 'hi' } },
    { pageText: 'hi there', ocrWords: 9, urlChanged: true }).verdict, 'PASS');
});
test('O1 CONTROL text_present: absent => not-satisfied even with urlChanged (never-PASS)', () => {
  const r = verdictFor(tc('text_present', 'You have done a (double|right) click'),
    { pageText: 'nothing here', ocrWords: 2, urlChanged: true });
  assert.notEqual(r.verdict, 'PASS');
  assert.equal(r.verdict, 'FAIL');
});

// ------------------------------------------------------------- dialog_message
test('O1 dialog_message: matching alert message (evidence.dialogs[]) => PASS', () => {
  const r = verdictFor(tc('dialog_message', 'zoo (alert|confirm|prompt)'),
    { dialogs: [{ type: 'alert', message: 'zoo alert: hello' }], ocrWords: 5 });
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.app_outcome, 'accepted');
});
test('O1 CONTROL dialog_message: no evidence => not-satisfied (never PASS)', () => {
  const r = verdictFor(tc('dialog_message', 'zoo (alert|confirm|prompt)'),
    { pageText: 'dialogs page body', ocrWords: 3 });
  assert.notEqual(r.verdict, 'PASS');
});
test('O1 CONTROL dialog_message: wrong message => not-satisfied', () => {
  const r = verdictFor(tc('dialog_message', 'zoo (alert|confirm|prompt)'),
    { dialogs: [{ type: 'alert', message: 'unrelated notice' }], ocrWords: 5 });
  assert.notEqual(r.verdict, 'PASS');
});

// ---------------------------------------------------------------- new_page_url
test('O1 new_page_url: matching popup (evidence.popups[]) => PASS', () => {
  const r = verdictFor(tc('new_page_url', 'new-tab-target'),
    { popups: ['http://127.0.0.1:5010/new-tab-target'], ocrWords: 1 });
  assert.equal(r.verdict, 'PASS');
});
test('O1 CONTROL new_page_url: no popups => not-satisfied; wrong url => not-satisfied', () => {
  assert.notEqual(verdictFor(tc('new_page_url', 'new-tab-target'),
    { pageText: 'Windows page', ocrWords: 1 }).verdict, 'PASS');
  assert.notEqual(verdictFor(tc('new_page_url', 'new-tab-target'),
    { popups: ['http://127.0.0.1:5010/other-page'], ocrWords: 1 }).verdict, 'PASS');
});

// ------------------------------------------------------------------ count_delta
test('O1 count_delta double_click: delta 2 => PASS (number + string expect)', () => {
  assert.equal(verdictFor(tc('count_delta', 2),
    { countBefore: 1, countAfter: 3, ocrWords: 1 }).verdict, 'PASS');
  assert.equal(verdictFor(tc('count_delta', '+1 row after add'),
    { countBefore: 4, countAfter: 5, ocrWords: 1 }).verdict, 'PASS');
});
test('O1 CONTROL count_delta: absent counters => not-satisfied; wrong delta => not-satisfied', () => {
  assert.notEqual(verdictFor(tc('count_delta', 2), { pageText: 'rows', ocrWords: 1 }).verdict, 'PASS');
  assert.notEqual(verdictFor(tc('count_delta', 2),
    { countBefore: 0, countAfter: 1, ocrWords: 1 }).verdict, 'PASS');
});

// ------------------------------------------------- unsupported + pure contract
test('O1 unsupported kind => evaluateKind never satisfied; verdict never PASS', () => {
  const ev = evaluateKind(tc('bogus_kind', 'x'), { urlChanged: true, ocrWords: 9 });
  assert.deepEqual(ev, { supported: false, satisfied: false, detail: 'unsupported:bogus_kind' });
  assert.notEqual(verdictFor(tc('bogus_kind', 'x'),
    { urlChanged: true, pageText: 'Products', ocrWords: 9 }).verdict, 'PASS');
});
test('O1 evaluateKind: supported kind with absent evidence => satisfied false', () => {
  for (const k of ['dialog_message', 'new_page_url', 'count_delta', 'text_present']) {
    const ev = evaluateKind(tc(k, 'anything'), {});
    assert.equal(ev.supported, true, k);
    assert.equal(ev.satisfied, false, k);
  }
});
test('O1 regexBounded: literal-first back-compat + bounded regex; invalid never throws', () => {
  assert.equal(regexBounded('hi', 'Hi there'), true);
  assert.equal(regexBounded('(double|right)', 'a double click'), true);
  assert.equal(regexBounded('([broken', 'a ([broken b'), true); // literal hit
  assert.equal(regexBounded('([broken', 'no match here'), false); // invalid regex => literal only
  assert.equal(regexBounded('', 'anything'), false);
});

// ----------------------------------------- no-oracle-weakening baseline freeze
test('O1 baseline freeze: pre-O1 generic paths unchanged (url-change / no-OCR)', () => {
  assert.equal(verdictFor({ id: 't', expect_navigation: true },
    { urlChanged: true, pageText: 'Products x', ocrWords: 120 }).verdict, 'PASS');
  assert.deepEqual(
    [verdictFor({ id: 't' }, { urlChanged: false, pageText: '', ocrWords: null }).verdict],
    ['OBSERVED']
  );
});
