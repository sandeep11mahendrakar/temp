'use strict';

// Q4-warmup: cross-class cold-page probes. Two tests: (1) one action per
// class fired in pointer->value->key order on a single cold fake page;
// (2) full 15-action K1 sweep, every action resolves with valid blind inputs.
// Fake pages only - no browser, no network, no LLM. Test-only commit per
// D29 src-freeze (HOLDER=W1 live); vision/src untouched.

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeAction } = require('../src/llm');

function fakePage() {
  const calls = { clicks: [], moves: [], presses: [], types: [], waits: [], shots: 0, uploads: [], evals: 0 };
  return {
    calls,
    mouse: {
      async click(x, y, opts) { calls.clicks.push([x, y, opts || {}]); },
      async wheel() {},
      async move(x, y) { calls.moves.push([x, y]); },
      async down() {},
      async up() {},
    },
    keyboard: {
      async press(k) { calls.presses.push(k); },
      async type(v) { calls.types.push(v); },
    },
    async waitForTimeout(ms) { calls.waits.push(ms); },
    async screenshot() { calls.shots += 1; return Buffer.from([]); },
    evaluate: async () => { calls.evals += 1; return true; },
    evaluateHandle: async () => ({ asElement: () => ({ setInputFiles: async (f) => { calls.uploads.push(f); } }) }),
  };
}

test('Q4-warmup cross-class cold-page order pointer->value->key', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'hover', x: 1, y: 1 });
  await executeAction(p, { action: 'select', x: 2, y: 2, value: 'A' });
  await executeAction(p, { action: 'press', value: 'Tab' });
  assert.deepEqual(p.calls.moves, [[1, 1]]);
  assert.deepEqual(p.calls.clicks, [[2, 2, {}]]);
  assert.deepEqual(p.calls.types, ['A']);
  assert.deepEqual(p.calls.presses, ['Enter', 'Tab']);
});

test('Q4-warmup full 15-K1-plus-right_click cold sweep all resolve', async () => {
  const p = fakePage();
  const fires = [
    { action: 'key', value: 'Tab' },
    { action: 'submit', x: 1, y: 1 },
    { action: 'select', x: 1, y: 1, value: 'A' },
    { action: 'check', x: 1, y: 1 },
    { action: 'uncheck', x: 1, y: 1 },
    { action: 'hover', x: 1, y: 1 },
    { action: 'dblclick', x: 1, y: 1 },
    { action: 'press', value: 'a' },
    { action: 'wait', value: 5 },
    { action: 'focus', x: 1, y: 1 },
    { action: 'clear', x: 1, y: 1 },
    { action: 'upload', x: 1, y: 1, value: 'f.png' },
    { action: 'drag', x: 1, y: 1, value: '9,9' },
    { action: 'snapshot' },
    { action: 'selectOption', x: 1, y: 1, value: 'B' },
    { action: 'right_click', x: 1, y: 1 },
  ];
  for (const f of fires) await executeAction(p, f);
  assert.equal(fires.length, 16);
  assert.equal(p.calls.shots, 1);
  assert.deepEqual(p.calls.uploads, ['f.png']);
  assert.deepEqual(p.calls.waits, [5]);
  assert.ok(p.calls.evals >= 3);
});
