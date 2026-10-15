'use strict';

// Q15 N7-option1 resolve-side regression (numeric): proximity fallback onto
// label_absent (drift-tagged) elements resolves WEAK behind opts.driftFlag
// (default OFF = legacy via). text_match stays primary. Pinned
// saucedemo-checkout-complete fixture for the realistic leg; synthetic
// elements elsewhere. No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveTarget, weakVerdict } = require('../src/executeTests');

function el(id, type, text, cx, cy, extra) {
  return Object.assign({ id, type, text, cx, cy }, extra || {});
}

test('Q15 text_match stays primary over nearer class-only element (flag on/off same)', () => {
  const els = [
    el('near', 'button', 'Cancel', 10, 10),
    el('far', 'button', 'Double Click Me', 80, 80),
  ];
  const step = { target: { type: 'button', text: 'Double Click Me' }, x: 10, y: 10 };
  for (const opts of [undefined, {}, { driftFlag: true }]) {
    const r = resolveTarget(els, step, 90, opts);
    assert.equal(r.via, 'text_match');
    assert.equal(r.element.id, 'far');
  }
});

test('Q15 proximity on drift-tagged: OFF legacy vs ON WEAK', () => {
  const els = [el('b1', 'button', null, 50, 50, { drift: 'label_absent' })];
  const step = { target: { type: 'button', text: 'Submit Form' }, x: 52, y: 52 };
  const off = resolveTarget(els, step);
  assert.deepEqual({ via: off.via, id: off.element.id }, { via: 'proximity', id: 'b1' });
  const on = resolveTarget(els, step, 90, { driftFlag: true });
  assert.deepEqual({ via: on.via, id: on.element.id }, { via: 'proximity+label_drift', id: 'b1' });
});

test('Q15 labeled buttons never drift-WEAK even with flag on', () => {
  const els = [el('b1', 'button', 'Login', 50, 50)];
  const step = { target: { type: 'button', text: 'Sign In Now' }, x: 52, y: 52 };
  const r = resolveTarget(els, step, 90, { driftFlag: true });
  assert.equal(r.via, 'proximity');
});

test('Q15 fixture checkout-complete: empty-text button goes WEAK under flag', () => {
  const doc = JSON.parse(fs.readFileSync(
    path.join(__dirname, 'fixtures', 'perceive', 'saucedemo-checkout-complete.json'), 'utf8'));
  const els = doc.elements.map((e, i) => {
    const b = e.bbox || {};
    const cx = ((b.x1 || 0) + (b.x2 || 0)) / 2;
    const cy = ((b.y1 || 0) + (b.y2 || 0)) / 2;
    const tagged = (!e.text || !String(e.text).trim()) && /button/i.test(e.type || '')
      ? { drift: 'label_absent' } : {};
    return { id: 'e' + i, type: e.type, text: e.text, cx, cy, ...tagged };
  });
  const empties = els.filter((e) => e.drift === 'label_absent');
  assert.equal(empties.length, 4);
  const t = empties[0];
  const step = { target: { type: t.type, text: 'Checkout Now Please' }, x: t.cx + 1, y: t.cy + 1 };
  assert.equal(resolveTarget(els, step).via, 'proximity');
  const flagged = resolveTarget(els, step, 90, { driftFlag: true });
  assert.equal(flagged.via, 'proximity+label_drift');
  assert.equal(flagged.element.id, t.id);
});

test('Q15 PASS_WEAK counts proximity+label_drift exactly once', () => {
  const steps = [
    { ok: true, resolution_via: 'text_match' },
    { ok: true, resolution_via: 'proximity+label_drift' },
    { ok: false, resolution_via: 'proximity+label_drift' },
  ];
  assert.deepEqual(weakVerdict('PASS', steps), { weak_steps: 1, verdict: 'PASS_WEAK(1)' });
});

test('Q15 ocr_anchor WEAK pin intact after regex extension', () => {
  const steps = [{ ok: true, resolution_via: 'text_match+ocr_anchor' }];
  assert.deepEqual(weakVerdict('PASS', steps), { weak_steps: 1, verdict: 'PASS_WEAK(1)' });
});
