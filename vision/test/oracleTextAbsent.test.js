'use strict';

// L2 text_absent oracle kind: absence assertions (uncheck/modal-close).
// Pure oracle.js only — no browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { verdictFor } = require('../src/oracle');

const absent = (expect) => ({ oracle: { kind: 'text_absent', expect } });

test('text_absent: absent+nav PASS, absent-bare PASS, present FAIL, vacuous OBSERVED', () => {
  assert.equal(verdictFor(absent('Small Modal'), { pageText: 'body text', urlChanged: true, ocrWords: 22 }).verdict, 'PASS');
  assert.equal(verdictFor(absent('Small Modal'), { pageText: 'body text', ocrWords: 22 }).verdict, 'PASS');
  const fail = verdictFor(absent('Small Modal'), { pageText: 'Small Modal open', ocrWords: 22 });
  assert.equal(fail.verdict, 'FAIL');
  assert.equal(fail.app_outcome, 'n/a');
  const vac = verdictFor(absent('x'), { pageText: '', ocrWords: null });
  assert.equal(vac.verdict, 'OBSERVED');
});

test('text_absent: invalid regex falls back to substring; other kinds unchanged', () => {
  const bad = verdictFor(absent('(['), { pageText: 'plain body', ocrWords: 9 });
  assert.equal(bad.verdict, 'PASS');
  const badHit = verdictFor(absent('(['), { pageText: 'has ([ bracket', ocrWords: 9 });
  assert.equal(badHit.verdict, 'FAIL');
  // Regression pin: text_present-kind cases use generic rules, untouched.
  assert.equal(verdictFor({ oracle: { kind: 'text_present', expect: 'hi' } }, { pageText: 'hi there', ocrWords: 9, urlChanged: true }).verdict, 'PASS');
  assert.equal(verdictFor({}, { pageText: '', ocrWords: null }).verdict, 'OBSERVED');
});

test('demoqa retarget pin: checkbox+modal use text_absent; accordion stays present', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'targets', 'demoqa.json'), 'utf8'));
  const byPath = Object.fromEntries(doc.items.map((it) => [it.path, it]));
  assert.equal(byPath['/checkbox'].oracle.kind, 'text_absent');
  assert.ok(byPath['/checkbox'].oracle.expect.length > 0);
  assert.equal(byPath['/modal-dialogs'].oracle.kind, 'text_absent');
  // Accordion item-final is second-section EXPANDED (text present by
  // intent); text_absent would false-FAIL, so it stays text_present.
  assert.equal(byPath['/accordian'].oracle.kind, 'text_present');
});
