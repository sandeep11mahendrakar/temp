'use strict';

// F-A shortbody-gate regression (numeric): textPresentVerify() pure gate.
// Proven transition (expected_text absent-pre + present-post) => MEDIUM
// text_present, bypassing the body-length gate. CONTROL test pins the
// no-trivial-pass rule: pre-existing text NEVER bypasses. expect+3 pin:
// cookie/spinner/upload zoo truths all carry expected_text.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { textPresentVerify } = require('../src/executeTests');

test('F-A transition proven => text_present with baseline chars', () => {
  const r = textPresentVerify('banner: accepted', 'Accept cookies to continue', 'banner: accepted. Thanks!');
  assert.equal(r.method, 'text_present');
  assert.equal(r.baseline_chars, 'banner: accepted. Thanks!'.length);
});

test('F-A CONTROL pre-existing text => null (no trivial pass)', () => {
  assert.equal(textPresentVerify('banner: accepted', 'banner: accepted already', 'banner: accepted still'), null);
});

test('F-A absent both pre and post => null (legacy owns verdict)', () => {
  assert.equal(textPresentVerify('banner: accepted', 'nothing here', 'still nothing'), null);
});

test('F-A no/blank expected_text => null', () => {
  assert.equal(textPresentVerify('', 'a', 'a banner: accepted'), null);
  assert.equal(textPresentVerify('   ', 'a', 'a banner: accepted'), null);
  assert.equal(textPresentVerify(null, 'a', 'a banner: accepted'), null);
  assert.equal(textPresentVerify(undefined, 'a', 'a'), null);
});

test('F-A matching is case-insensitive like the legacy check', () => {
  const r = textPresentVerify('Data Ready: 3 Rows', 'loading...', 'DATA READY: 3 ROWS shown');
  assert.equal(r.method, 'text_present');
});

test('F-A short body still verifies when transition proven (68/36/55ch class)', () => {
  const tiny = 'x'.repeat(36) + 'data ready: 3 rows';
  const r = textPresentVerify('data ready: 3 rows', 'loading spinner', tiny);
  assert.equal(r.method, 'text_present');
  assert.ok(r.baseline_chars < 100);
});

test('F-A expect+3 pin: cookie/spinner/upload truths carry expected_text', () => {
  const dir = path.join(__dirname, '..', 'zoo', 'truth');
  const expects = {
    'cookie-banner.truth.json': 'banner: accepted',
    'spinner-delayed.truth.json': 'data ready: 3 rows',
    'upload-download.truth.json': 'uploaded: zoo-sample.txt',
  };
  for (const [f, exp] of Object.entries(expects)) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(t.expected.expect, exp, f);
    assert.ok(exp.trim().length > 0);
  }
});
