'use strict';

// Q4 class-1 pointer blind-fire (hover/dblclick/right_click/drag): offline
// executor tests. Fake pages only - no browser, no network, no LLM.
// Blind = authored coords, no perception grounding; each fire asserts the
// exact page primitive the dispatcher must call (min 3 asserts per fire).

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeAction } = require('../src/llm');

function fakePage() {
  const calls = { clicks: [], moves: [], downs: 0, ups: 0, moveOpts: [] };
  return {
    calls,
    mouse: {
      async click(x, y, opts) { calls.clicks.push([x, y, opts || {}]); },
      async wheel() {},
      async move(x, y, opts) { calls.moves.push([x, y]); calls.moveOpts.push(opts || null); },
      async down() { calls.downs += 1; },
      async up() { calls.ups += 1; },
    },
    keyboard: { async press() {}, async type() {} },
  };
}

test('Q4-class1 hover blind-fire moves only, never clicks', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'hover', x: 11, y: 22 });
  assert.deepEqual(p.calls.moves, [[11, 22]]);
  assert.equal(p.calls.clicks.length, 0);
  assert.equal(p.calls.downs, 0);
});

test('Q4-class1 dblclick blind-fire double-clicks at coords', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'dblclick', x: 33, y: 44 });
  assert.equal(p.calls.clicks.length, 1);
  assert.equal(p.calls.clicks[0][0], 33);
  assert.equal(p.calls.clicks[0][2].clickCount, 2);
});

test('Q4-class1 right_click blind-fire uses button-right, never plain click', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'right_click', x: 55, y: 66 });
  assert.equal(p.calls.clicks.length, 1);
  assert.equal(p.calls.clicks[0][2].button, 'right');
  assert.ok(!('clickCount' in p.calls.clicks[0][2]) || p.calls.clicks[0][2].clickCount === undefined);
});

test('Q4-class1 drag blind-fire move-down-move8-up to x2,y2', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'drag', x: 10, y: 20, value: '30,40' });
  assert.deepEqual(p.calls.moves, [[10, 20], [30, 40]]);
  assert.equal(p.calls.downs, 1);
  assert.equal(p.calls.ups, 1);
  assert.deepEqual(p.calls.moveOpts[1], { steps: 8 });
});

test('Q4-class1 all-4 reject missing coords', async () => {
  for (const a of ['hover', 'dblclick', 'right_click', 'drag']) {
    await assert.rejects(executeAction(fakePage(), { action: a, x: null, y: 1 }), /coordinates/);
    await assert.rejects(executeAction(fakePage(), { action: a, x: 1 }), /coordinates/);
  }
});

test('Q4-class1 drag rejects malformed x2,y2 values', async () => {
  for (const v of ['', 'abc', '10', '1,2,3', 'x,y']) {
    await assert.rejects(
      executeAction(fakePage(), { action: 'drag', x: 1, y: 2, value: v }), /drag requires value/);
  }
});

test('Q4-class1 warmup-probe sequential fire order on one page', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'hover', x: 1, y: 1 });
  await executeAction(p, { action: 'dblclick', x: 2, y: 2 });
  await executeAction(p, { action: 'right_click', x: 3, y: 3 });
  await executeAction(p, { action: 'drag', x: 4, y: 4, value: '5,6' });
  assert.deepEqual(p.calls.moves, [[1, 1], [4, 4], [5, 6]]);
  assert.equal(p.calls.clicks.length, 2);
  assert.equal(p.calls.clicks[1][2].button, 'right');
  assert.equal(p.calls.downs, 1);
  assert.equal(p.calls.ups, 1);
});

test('Q4-class1 warmup-probe re-fire is stateless', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'hover', x: 7, y: 8 });
  await executeAction(p, { action: 'hover', x: 7, y: 8 });
  assert.deepEqual(p.calls.moves, [[7, 8], [7, 8]]);
});
