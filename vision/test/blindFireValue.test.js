'use strict';

// Q4 class-2 value blind-fire (select/selectOption/clear/upload/check/uncheck):
// offline executor tests. Fake pages only - no browser, no network, no LLM.
// Blind = authored coords/values, no perception grounding; each fire asserts
// the exact page primitive the dispatcher must call (min 3 asserts per fire).

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeAction } = require('../src/llm');

function fakePage({ evalResult = null, handle = null } = {}) {
  const calls = { clicks: [], presses: [], types: [], evals: [], uploads: [] };
  const uploadStub = {
    asElement: () => ({ setInputFiles: async (f) => { calls.uploads.push(f); } }),
  };
  return {
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
    evaluate: async (fn, args) => { calls.evals.push(args); return evalResult; },
    evaluateHandle: async () => handle || uploadStub,
  };
}

test('Q4-class2 select blind-fire clicks, types option, confirms Enter', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'select', x: 5, y: 6, value: 'US' });
  assert.deepEqual(p.calls.clicks, [[5, 6, {}]]);
  assert.deepEqual(p.calls.types, ['US']);
  assert.deepEqual(p.calls.presses, ['Enter']);
});

test('Q4-class2 selectOption blind-fire evaluates rounded coords+value, no click', async () => {
  const p = fakePage({ evalResult: true });
  await executeAction(p, { action: 'selectOption', x: 7.4, y: 8.6, value: 'opt1' });
  assert.deepEqual(p.calls.evals, [[[7, 9, 'opt1']][0]]);
  assert.equal(p.calls.clicks.length, 0);
  assert.equal(p.calls.uploads.length, 0);
});

test('Q4-class2 clear blind-fire clicks then Control+A then Backspace', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'clear', x: 9, y: 10 });
  assert.deepEqual(p.calls.clicks, [[9, 10, {}]]);
  assert.deepEqual(p.calls.presses, ['Control+A', 'Backspace']);
  assert.equal(p.calls.types.length, 0);
});

test('Q4-class2 upload blind-fire sets files on handle near coords', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'upload', x: 11, y: 12, value: 'C:/tmp/a.png' });
  assert.deepEqual(p.calls.uploads, ['C:/tmp/a.png']);
  assert.equal(p.calls.clicks.length, 0);
  assert.equal(p.calls.presses.length, 0);
});

test('Q4-class2 check blind-fire clicks only when unchecked', async () => {
  const p = fakePage({ evalResult: false });
  await executeAction(p, { action: 'check', x: 1, y: 2 });
  assert.equal(p.calls.clicks.length, 1);
  const p2 = fakePage({ evalResult: true });
  await executeAction(p2, { action: 'check', x: 1, y: 2 });
  assert.equal(p2.calls.clicks.length, 0);
  const p3 = fakePage({ evalResult: null });
  await executeAction(p3, { action: 'check', x: 1, y: 2 });
  assert.equal(p3.calls.clicks.length, 1);
});

test('Q4-class2 uncheck blind-fire clicks only when checked', async () => {
  const p = fakePage({ evalResult: true });
  await executeAction(p, { action: 'uncheck', x: 3, y: 4 });
  assert.equal(p.calls.clicks.length, 1);
  const p2 = fakePage({ evalResult: false });
  await executeAction(p2, { action: 'uncheck', x: 3, y: 4 });
  assert.equal(p2.calls.clicks.length, 0);
  assert.deepEqual(p.calls.evals[0].slice(0, 2), [[3, 4]][0]);
});

test('Q4-class2 all-6 reject missing coords', async () => {
  const base = { select: { value: 'US' }, selectOption: { value: 'o' }, upload: { value: 'f' } };
  for (const a of ['select', 'selectOption', 'clear', 'upload', 'check', 'uncheck']) {
    await assert.rejects(executeAction(fakePage(), { action: a, x: null, y: 1, ...(base[a] || {}) }), /coordinates/);
    await assert.rejects(executeAction(fakePage(), { action: a, y: 1, ...(base[a] || {}) }), /coordinates/);
  }
});

test('Q4-class2 value guards reject empty values and no-match', async () => {
  await assert.rejects(
    executeAction(fakePage(), { action: 'selectOption', x: 1, y: 2, value: '' }), /requires an option value/);
  await assert.rejects(
    executeAction(fakePage({ evalResult: false }), { action: 'selectOption', x: 1, y: 2, value: 'zz' }),
    /no matching option/);
  await assert.rejects(
    executeAction(fakePage(), { action: 'upload', x: 1, y: 2, value: '' }), /requires a file path value/);
  const noInput = { asElement: () => null };
  await assert.rejects(
    executeAction(fakePage({ handle: noInput }), { action: 'upload', x: 1, y: 2, value: 'f' }),
    /no file input near coordinates/);
});

test('Q4-class2 warmup-probe sequential fire order on one page', async () => {
  const p = fakePage({ evalResult: true });
  await executeAction(p, { action: 'select', x: 1, y: 1, value: 'A' });
  await executeAction(p, { action: 'selectOption', x: 2, y: 2, value: 'B' });
  await executeAction(p, { action: 'clear', x: 3, y: 3 });
  await executeAction(p, { action: 'upload', x: 4, y: 4, value: 'f.png' });
  await executeAction(p, { action: 'check', x: 5, y: 5 });
  await executeAction(p, { action: 'uncheck', x: 6, y: 6 });
  assert.equal(p.calls.clicks.length, 3);
  assert.deepEqual(p.calls.clicks.map((c) => [c[0], c[1]]), [[1, 1], [3, 3], [6, 6]]);
  assert.deepEqual(p.calls.types, ['A']);
  assert.deepEqual(p.calls.uploads, ['f.png']);
  assert.deepEqual(p.calls.presses, ['Enter', 'Control+A', 'Backspace']);
});

test('Q4-class2 warmup-probe re-fire is stateless', async () => {
  const p = fakePage({ evalResult: false });
  await executeAction(p, { action: 'check', x: 1, y: 1 });
  await executeAction(p, { action: 'check', x: 1, y: 1 });
  assert.equal(p.calls.clicks.length, 2);
  assert.equal(p.calls.evals.length, 2);
});
