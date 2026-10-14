'use strict';

// G2 oracle: offline tests with mocked OCR inputs (strings, no OCR service).

const test = require('node:test');
const assert = require('node:assert/strict');

const { verdictFor } = require('../src/oracle');

test('G2 oracle: urlChanged -> PASS/accepted with snip300 + ocr_count', () => {
  const r = verdictFor(
    { id: 't', expect_navigation: true },
    { urlChanged: true, pageText: 'Products x'.repeat(200), ocrWords: 120 }
  );
  assert.deepEqual(
    { verdict: r.verdict, app_outcome: r.app_outcome, ocr_count: r.ocr_count },
    { verdict: 'PASS', app_outcome: 'accepted', ocr_count: 120 }
  );
  assert.ok(r.snip300.length <= 300 && r.snip300.length > 0);
});

test('G2 oracle: expected text present without navigation -> PASS/accepted', () => {
  const r = verdictFor(
    { id: 't', expected_text: '2 items left' },
    { urlChanged: false, pageText: 'Buy milk Read book 2 items left footer', ocrWords: 40 }
  );
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.app_outcome, 'accepted');
});

test('G2 oracle: expect_rejection + locked-out text, stayed put -> PASS/rejected', () => {
  const r = verdictFor(
    { id: 'locked', expect_rejection: true, expect_navigation: true },
    { urlChanged: false, pageText: 'Epic sadface: Sorry, this user has been locked out.', ocrWords: 12 }
  );
  assert.deepEqual([r.verdict, r.app_outcome], ['PASS', 'rejected']);
});

test('G2 oracle: no OCR at all, no change, no text -> OBSERVED (WEAK, never PASS/FAIL)', () => {
  const r = verdictFor({ id: 't' }, { urlChanged: false, pageText: '', ocrWords: null });
  assert.deepEqual([r.verdict, r.app_outcome, r.ocr_count], ['OBSERVED', 'n/a', 0]);
  const r2 = verdictFor({ id: 't' }, {});
  assert.equal(r2.verdict, 'OBSERVED');
});

test('G2 oracle: expected change but stayed, no rejection text -> FAIL/n/a', () => {
  const r = verdictFor(
    { id: 't', expect_navigation: true },
    { urlChanged: false, pageText: 'Swag Labs Login page, nothing happened', ocrWords: 9 }
  );
  assert.deepEqual([r.verdict, r.app_outcome], ['FAIL', 'n/a']);
});
