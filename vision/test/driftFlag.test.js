'use strict';

// Q11 N7-option2 smallest-S regression (numeric): perceive-side label-drift
// tag + counted metric behind opts.driftFlag in anchorSynth.js. WEAK-grade
// informational tags only; flag OFF (default) = byte-identical behavior.
// Eval pages are pinned fixtures (read-only); demoqa-/buttons has no pinned
// fixture on disk (storage visual_doms are mutable per N7 NOTE) => NA.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { synthAnchorInputs, isButtonType } = require('../src/anchorSynth');

const DIR = path.join(__dirname, 'fixtures', 'perceive');
function load(f) {
  return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).elements;
}
function buttons(els) {
  return els.filter((e) => e && isButtonType(e.type));
}
function recall(btns) {
  if (!btns.length) return null;
  return btns.filter((b) => b.text && String(b.text).trim()).length / btns.length;
}

test('Q11 drift flag OFF (default): drift 0, elements byte-identical', () => {
  const els = load('saucedemo-checkout-complete.json');
  const r = synthAnchorInputs(els, [], 900);
  assert.equal(r.drift, 0);
  assert.deepEqual(r.elements, els);
  assert.ok(r.elements.every((e) => !('drift' in e)));
});

test('Q11 drift checkout: 5 buttons, 4 label_absent, recall 0.2', () => {
  const els = load('saucedemo-checkout-complete.json');
  const r = synthAnchorInputs(els, [], 900, { driftFlag: true });
  const btns = buttons(r.elements);
  assert.equal(btns.length, 5);
  assert.equal(r.drift, 4);
  assert.equal(btns.filter((b) => b.drift === 'label_absent').length, 4);
  assert.equal(recall(btns), 0.2);
});

test('Q11 drift login: 1 labeled button, drift 0, recall 1.0', () => {
  const els = load('saucedemo-login.json');
  const r = synthAnchorInputs(els, [], 900, { driftFlag: true });
  const btns = buttons(r.elements);
  assert.equal(btns.length, 1);
  assert.equal(r.drift, 0);
  assert.equal(recall(btns), 1);
});

test('Q11 drift todomvc: 0 buttons, drift 0, recall n/a', () => {
  const els = load('todomvc-empty.json');
  const r = synthAnchorInputs(els, [], 900, { driftFlag: true });
  assert.equal(buttons(r.elements).length, 0);
  assert.equal(r.drift, 0);
  assert.equal(recall(buttons(r.elements)), null);
});

test('Q11 drift flag never mutates caller-owned element objects', () => {
  const els = load('saucedemo-checkout-complete.json');
  const before = JSON.stringify(els);
  synthAnchorInputs(els, [], 900, { driftFlag: true });
  assert.equal(JSON.stringify(els), before);
});

test('Q11 drift recall-before/after table: instrumentation only, recall fixed', () => {
  const table = {};
  for (const f of ['saucedemo-checkout-complete.json', 'saucedemo-login.json', 'todomvc-empty.json']) {
    const els = load(f);
    const off = synthAnchorInputs(els, [], 900);
    const on = synthAnchorInputs(els, [], 900, { driftFlag: true });
    table[f] = { recallOff: recall(buttons(off.elements)), recallOn: recall(buttons(on.elements)), driftOff: off.drift, driftOn: on.drift };
  }
  assert.deepEqual(table['saucedemo-checkout-complete.json'], { recallOff: 0.2, recallOn: 0.2, driftOff: 0, driftOn: 4 });
  assert.deepEqual(table['saucedemo-login.json'], { recallOff: 1, recallOn: 1, driftOff: 0, driftOn: 0 });
  assert.deepEqual(table['todomvc-empty.json'], { recallOff: null, recallOn: null, driftOff: 0, driftOn: 0 });
});
