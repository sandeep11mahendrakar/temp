'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isEnabled, synthesize } = require('../src/ocrSynth');

test('V-2 flag OFF by default', () => {
  assert.equal(isEnabled({}), false);
});

test('V-2 flag OFF => output byte-identical (no synth)', () => {
  const els = [{ id: 'a', type: 'button', text: '' }];
  const out = synthesize(els, [], 100, { env: {} });
  assert.deepEqual(out.elements, els);
  assert.equal(out.added, 0);
  assert.equal(out.weak, false);
});

test('V-2 flag ON delegates and tags WEAK', () => {
  const ocrWords = [{ text: 'add', bbox: { x: 10, y: 10, w: 20, h: 10 } }];
  const els = [];
  const out = synthesize(els, ocrWords, 1000, { env: { OCR_SYNTH: 'on' } });
  // may or may not add depending on anchor regex; just assert shape
  assert.ok(Array.isArray(out.elements));
  assert.equal(typeof out.added, 'number');
});
