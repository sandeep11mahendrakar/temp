'use strict';

// D1 drag-to regression (numeric): resolveDragDestination() pure gate.
// Native destination resolution: to{x,y} coords -> to{type,text} via pool ->
// legacy value "x2,y2". CONTROL pins the no-blind-drag rule: a drag with no
// destination returns ok:false, which the caller maps to FAIL.
// No browser, no network, no LLM. expect+1 pin: drag-drop truth carries to{}.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveDragDestination } = require('../src/executeTests');

const POOL = [
  { type: 'button', text: 'Drag Me', cx: 40, cy: 60 },
  { type: 'container', text: 'Drop Here', cx: 320, cy: 180 },
];

test('D1 to{x,y} explicit coords => to_coords rounded', () => {
  const r = resolveDragDestination(POOL, { action: 'drag', to: { x: 12.6, y: 30.2 } });
  assert.equal(r.ok, true);
  assert.equal(r.value, '13,30');
  assert.equal(r.via, 'to_coords');
});

test('D1 to{type,text} resolves against pool => to_text_match coords', () => {
  const r = resolveDragDestination(POOL, { action: 'drag', to: { type: 'container', text: 'drop here' } });
  assert.equal(r.ok, true);
  assert.equal(r.value, '320,180');
  assert.equal(r.via, 'to_text_match');
  assert.equal(r.element.text, 'Drop Here');
});

test('D1 CONTROL no destination (no to{}, no value) => ok:false => caller FAILs', () => {
  const r = resolveDragDestination(POOL, { action: 'drag' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no drag destination/);
});

test('D1 CONTROL to{type,text} absent from pool => ok:false (never blind-drag)', () => {
  const r = resolveDragDestination(POOL, { action: 'drag', to: { type: 'container', text: 'nowhere at all' } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /drag destination not found/);
});

test('D1 legacy value "x2,y2" still accepted (back-compat)', () => {
  const r = resolveDragDestination(POOL, { action: 'drag', value: '300, 200' });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'legacy_value');
});

test('D1 CONTROL garbage value with no to{} => ok:false', () => {
  assert.equal(resolveDragDestination(POOL, { action: 'drag', value: 'nowhere' }).ok, false);
  assert.equal(resolveDragDestination(POOL, { action: 'drag', value: '' }).ok, false);
  assert.equal(resolveDragDestination([], { action: 'drag', to: { type: 'container', text: 'drop here' } }).ok, false);
});

test('D1 expect+1 pin: drag-drop truth carries native to{} contract', () => {
  const t = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'zoo', 'truth', 'drag-drop.truth.json'), 'utf8'));
  const step = t.steps.find((s) => s.action === 'drag');
  assert.ok(step, 'drag step present');
  assert.equal(typeof step.target, 'object');
  assert.equal(typeof step.to, 'object');
  assert.ok(step.to.text && step.to.type);
  // and that to{} resolves natively against a pool shaped like the zoo seed
  const r = resolveDragDestination(POOL, step);
  assert.equal(r.ok, true);
});
