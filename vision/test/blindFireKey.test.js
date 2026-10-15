'use strict';

// Q4 class-3 key blind-fire (press/wait/focus/submit): offline executor tests.
// Fake pages only - no browser, no network, no LLM. Blind = authored
// coords/values, no perception grounding; each fire asserts the exact page
// primitive the dispatcher must call (min 3 asserts per fire).
// Test-only commit per D29 src-freeze (HOLDER=W1 live); vision/src untouched.

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeAction } = require('../src/llm');

function fakePage({ waiter = true } = {}) {
  const calls = { clicks: [], presses: [], types: [], waits: [] };
  const page = {
    calls,
    mouse: {
      async click(x, y, opts) { calls.clicks.push([x, y, opts || {}]); },
      async wheel() {},
      async move() {},
      async down() {},
      async up() {},
    },
    keyboard: {
      async press(k) { calls.presses.push(k); },
      async type(v) { calls.types.push(v); },
    },
  };
  if (waiter) page.waitForTimeout = async (ms) => { calls.waits.push(ms); };
  return page;
}

test('Q4-class3 press blind-fire sends value, defaults Enter, needs no coords', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'press', value: 'Tab' });
  assert.deepEqual(p.calls.presses, ['Tab']);
  assert.equal(p.calls.clicks.length, 0);
  const p2 = fakePage();
  await executeAction(p2, { action: 'press', value: '' });
  assert.deepEqual(p2.calls.presses, ['Enter']);
});

test('Q4-class3 wait blind-fire sleeps value ms via page waiter', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'wait', value: 50 });
  assert.deepEqual(p.calls.waits, [50]);
  assert.equal(p.calls.clicks.length, 0);
  assert.equal(p.calls.presses.length, 0);
});

test('Q4-class3 wait blind-fire caps at 10000, defaults 1000 on garbage', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'wait', value: 999999 });
  assert.deepEqual(p.calls.waits, [10000]);
  const p2 = fakePage();
  await executeAction(p2, { action: 'wait', value: 'abc' });
  assert.deepEqual(p2.calls.waits, [1000]);
  const p3 = fakePage();
  await executeAction(p3, { action: 'wait', value: -5 });
  assert.deepEqual(p3.calls.waits, [0]);
});

test('Q4-class3 wait blind-fire falls back to setTimeout without page waiter', async () => {
  const p = fakePage({ waiter: false });
  const t0 = Date.now();
  await executeAction(p, { action: 'wait', value: 5 });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(p.calls.clicks.length, 0);
});

test('Q4-class3 focus blind-fire clicks the point, nothing else', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'focus', x: 13, y: 14 });
  assert.deepEqual(p.calls.clicks, [[13, 14, {}]]);
  assert.equal(p.calls.presses.length, 0);
  assert.equal(p.calls.types.length, 0);
});

test('Q4-class3 submit blind-fire clicks then presses Enter', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'submit', x: 15, y: 16 });
  assert.deepEqual(p.calls.clicks, [[15, 16, {}]]);
  assert.deepEqual(p.calls.presses, ['Enter']);
  assert.equal(p.calls.types.length, 0);
});

test('Q4-class3 focus/submit reject missing coords; press never needs them', async () => {
  for (const a of ['focus', 'submit']) {
    await assert.rejects(executeAction(fakePage(), { action: a, x: null, y: 1 }), /coordinates/);
    await assert.rejects(executeAction(fakePage(), { action: a, y: 1 }), /coordinates/);
  }
  const p = fakePage();
  await executeAction(p, { action: 'press' });
  assert.deepEqual(p.calls.presses, ['Enter']);
});

test('Q4-class3 warmup-probe sequential fire order on one page', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'press', value: 'Tab' });
  await executeAction(p, { action: 'wait', value: 10 });
  await executeAction(p, { action: 'focus', x: 1, y: 1 });
  await executeAction(p, { action: 'submit', x: 2, y: 2 });
  assert.deepEqual(p.calls.presses, ['Tab', 'Enter']);
  assert.deepEqual(p.calls.waits, [10]);
  assert.deepEqual(p.calls.clicks.map((c) => [c[0], c[1]]), [[1, 1], [2, 2]]);
});

test('Q4-class3 warmup-probe re-fire is stateless', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'press', value: 'a' });
  await executeAction(p, { action: 'press', value: 'a' });
  assert.deepEqual(p.calls.presses, ['a', 'a']);
});
