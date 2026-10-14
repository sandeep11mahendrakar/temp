'use strict';

// K1 action-extensions batch1 (key/submit/select/check/uncheck): offline
// executor + schema tests. Fake pages only — no browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAction, executeAction, readCheckState } = require('../src/llm');
const { STEP_ACTIONS, assertStepAction, normaliseStep } = require('../src/executeTests');

function fakePage({ checked = null, handle = null } = {}) {
  const calls = { clicks: [], presses: [], types: [], moves: [], waits: [], downs: 0, ups: 0, shots: 0, uploads: [] };
  return {
    calls,
    mouse: {
      async click(x, y, opts) { calls.clicks.push([x, y, opts && opts.clickCount ? opts.clickCount : 1]); },
      async wheel() {},
      async move(x, y) { calls.moves.push([x, y]); },
      async down() { calls.downs += 1; },
      async up() { calls.ups += 1; },
    },
    keyboard: {
      async press(k) { calls.presses.push(k); },
      async type(v) { calls.types.push(v); },
    },
    async goto() {},
    async waitForTimeout(ms) { calls.waits.push(ms); },
    async screenshot() { calls.shots += 1; return Buffer.from([]); },
    evaluate: async () => checked,
    evaluateHandle: async () => handle,
  };
}

test('parseAction accepts K1 batch1 actions, still rejects bogus', () => {
  for (const a of ['key', 'submit', 'select', 'check', 'uncheck', 'hover', 'dblclick', 'press', 'wait', 'focus', 'clear', 'upload', 'drag', 'snapshot', 'selectOption', 'right_click']) {
    assert.equal(parseAction({ action: a }).action, a);
  }
  assert.equal(parseAction({ action: 'dance' }).action, 'unknown');
});

test('executeAction key presses value (default Enter), no coords needed', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'key', value: 'Tab' });
  assert.deepEqual(p.calls.presses, ['Tab']);
  const p2 = fakePage();
  await executeAction(p2, { action: 'key', value: '' });
  assert.deepEqual(p2.calls.presses, ['Enter']);
});

test('executeAction submit clicks then presses Enter', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'submit', x: 10, y: 20 });
  assert.deepEqual(p.calls.clicks, [[10, 20, 1]]);
  assert.deepEqual(p.calls.presses, ['Enter']);
  await assert.rejects(executeAction(fakePage(), { action: 'submit', x: null, y: 1 }), /coordinates/);
});

test('executeAction select clicks, types option, confirms', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'select', x: 5, y: 6, value: 'US' });
  assert.deepEqual(p.calls.clicks, [[5, 6, 1]]);
  assert.deepEqual(p.calls.types, ['US']);
  assert.deepEqual(p.calls.presses, ['Enter']);
});

test('executeAction check clicks only when unchecked', async () => {
  const p = fakePage({ checked: false });
  await executeAction(p, { action: 'check', x: 1, y: 2 });
  assert.equal(p.calls.clicks.length, 1);
  const p2 = fakePage({ checked: true });
  await executeAction(p2, { action: 'check', x: 1, y: 2 });
  assert.equal(p2.calls.clicks.length, 0);
});

test('executeAction uncheck clicks only when checked; readCheckState passthrough', async () => {
  const p = fakePage({ checked: true });
  await executeAction(p, { action: 'uncheck', x: 1, y: 2 });
  assert.equal(p.calls.clicks.length, 1);
  const p2 = fakePage({ checked: false });
  await executeAction(p2, { action: 'uncheck', x: 1, y: 2 });
  assert.equal(p2.calls.clicks.length, 0);
  assert.equal(await readCheckState(fakePage({ checked: true }), 0, 0), true);
  assert.equal(await readCheckState(fakePage({ checked: null }), 0, 0), null);
});

test('STEP_ACTIONS gate: all 21 accepted, bogus rejected with list', () => {
  assert.equal(STEP_ACTIONS.size, 21);
  for (const a of ['click', 'fill', 'navigate', 'scroll', 'done', 'submit', 'key', 'select', 'check', 'uncheck', 'hover', 'dblclick', 'press', 'wait', 'focus', 'clear', 'upload', 'drag', 'snapshot', 'selectOption', 'right_click']) {
    assert.equal(assertStepAction(a), a);
  }
  assert.throws(() => assertStepAction('dance'), /unsupported step action/);
  assert.equal(normaliseStep({ action: 'CHECK', x: 1 }, 'https://x/').action, 'check');
  assert.throws(() => normaliseStep({ action: 'dance' }, 'https://x/'), /unsupported step action/);
});

test('executeAction hover moves only; dblclick double-clicks; focus clicks', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'hover', x: 3, y: 4 });
  assert.deepEqual(p.calls.moves, [[3, 4]]);
  assert.equal(p.calls.clicks.length, 0);
  const p2 = fakePage();
  await executeAction(p2, { action: 'dblclick', x: 7, y: 8 });
  assert.deepEqual(p2.calls.clicks, [[7, 8, 2]]);
  const p3 = fakePage();
  await executeAction(p3, { action: 'focus', x: 9, y: 9 });
  assert.deepEqual(p3.calls.clicks, [[9, 9, 1]]);
  await assert.rejects(executeAction(fakePage(), { action: 'hover', x: null, y: 1 }), /coordinates/);
});

test('executeAction press sends any key; wait sleeps capped at 10s', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'press', value: 'Escape' });
  assert.deepEqual(p.calls.presses, ['Escape']);
  const p2 = fakePage();
  await executeAction(p2, { action: 'wait', value: '250' });
  assert.deepEqual(p2.calls.waits, [250]);
  const p3 = fakePage();
  await executeAction(p3, { action: 'wait', value: '99999' });
  assert.deepEqual(p3.calls.waits, [10000]);
});

test('executeAction clear selects-all + deletes', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'clear', x: 4, y: 5 });
  assert.deepEqual(p.calls.clicks, [[4, 5, 1]]);
  assert.deepEqual(p.calls.presses, ['Control+A', 'Backspace']);
  await assert.rejects(executeAction(fakePage(), { action: 'clear', x: null, y: 1 }), /coordinates/);
});

test('executeAction upload sets files on near file input; errors honest', async () => {
  const input = { setInputFiles: async (f) => fakeUploads.push(f) };
  const fakeUploads = [];
  const p = fakePage({ handle: { asElement: () => input } });
  await executeAction(p, { action: 'upload', x: 1, y: 2, value: '/tmp/a.png' });
  assert.deepEqual(fakeUploads, ['/tmp/a.png']);
  await assert.rejects(executeAction(fakePage(), { action: 'upload', x: 1, y: 2, value: '' }), /file path/);
  await assert.rejects(executeAction(fakePage({ handle: null }), { action: 'upload', x: 1, y: 2, value: '/tmp/a.png' }), /no file input/);
});

test('executeAction drag moves held cursor; bad value rejected', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'drag', x: 1, y: 2, value: '30,40' });
  assert.deepEqual(p.calls.moves, [[1, 2], [30, 40]]);
  assert.equal(p.calls.downs, 1);
  assert.equal(p.calls.ups, 1);
  await assert.rejects(executeAction(fakePage(), { action: 'drag', x: 1, y: 2, value: 'nope' }), /x2,y2/);
});

test('executeAction snapshot captures; selectOption sets native select', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'snapshot' });
  assert.equal(p.calls.shots, 1);
  const p2 = fakePage({ checked: true });
  p2.evaluate = async () => true;
  await executeAction(p2, { action: 'selectOption', x: 1, y: 2, value: 'US' });
  const p3 = fakePage();
  p3.evaluate = async () => false;
  await assert.rejects(executeAction(p3, { action: 'selectOption', x: 1, y: 2, value: 'US' }), /no matching option/);
  await assert.rejects(executeAction(fakePage(), { action: 'selectOption', x: 1, y: 2, value: '' }), /option value/);
});
