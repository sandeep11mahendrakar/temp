'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isInputType } = require('../src/inputFilter');
const { verdictFor } = require('../src/oracle');

test('Z-4.1 contenteditable is now an input type', () => {
  assert.equal(isInputType('contenteditable'), true);
});

test('Z-4.1 control: action skipped (unresolved target) => not PASS', () => {
  const r = verdictFor(
    { id: 'contenteditable', expected_text: 'Saved: Type here' },
    { urlChanged: true, pageText: 'Saved: Type here', ocrWords: 5, actionSkipped: true }
  );
  assert.notEqual(r.verdict, 'PASS', 'skipped action must not pass');
  const r2 = verdictFor(
    { id: 'contenteditable', expected_text: 'Saved: Type here' },
    { urlChanged: true, pageText: 'Saved: Type here', ocrWords: 5 }
  );
  assert.equal(r2.verdict, 'PASS', 'non-skipped still passes');
});
