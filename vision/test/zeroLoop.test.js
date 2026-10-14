'use strict';

// B6 zero loop: offline mock-integration tests. Collaborators are mocks.

const test = require('node:test');
const assert = require('node:assert/strict');

const { runZeroLoop } = require('../src/zeroLoop');

// Mock world: 3 phases; executor covers the next uncovered phase per loop.
function world(coverPerLoop) {
  const covered = new Set();
  return {
    collabs: {
      perceive: async ({ loop }) => ({ id: `s${loop}` }),
      plan: async () => ({ phases: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
      execute: async () => {
        const ids = ['a', 'b', 'c'].filter((id) => !covered.has(id)).slice(0, coverPerLoop);
        ids.forEach((id) => covered.add(id));
        return { executed: ids.length, done: ids.slice() };
      },
      mergeLoop: async (mem, result) => {
        const before = new Set((mem.runs || []).flatMap((r) => r.phases_done || []));
        const fresh = (result.done || []).filter((id) => !before.has(id));
        const next = { version: 1, runs: (mem.runs || []).concat([{ phases_done: (result.done || []).slice() }]) };
        return { mem: next, delta: before.size === 0 && (mem.runs || []).length === 0 ? null : fresh };
      },
      isCovered: async () => covered.size === 3,
    },
  };
}

test('B6 loop: steady 1-new-phase loops stop at loop2 via delta<=1', async () => {
  const w = world(1);
  const res = await runZeroLoop(w.collabs, 'cover three');
  assert.equal(res.loops, 2);
  assert.equal(res.covered, false);
  assert.equal(res.lastDelta, 1);
  assert.equal(res.history.length, 2);
  assert.equal(res.error, null);
});

test('B6 loop: full coverage loop1 stops immediately as covered', async () => {
  const w = world(3);
  const res = await runZeroLoop(w.collabs, 'cover all now');
  assert.equal(res.loops, 1);
  assert.equal(res.covered, true);
});

test('B6 loop: unknown delta every loop runs to the loop5 cap', async () => {
  const w = world(0);
  const stateless = {
    ...w.collabs,
    mergeLoop: async (mem) => ({ mem, delta: null }),
    isCovered: async () => false,
  };
  const res = await runZeroLoop(stateless, 'stuck goal');
  assert.equal(res.loops, 5);
  assert.equal(res.covered, false);
  assert.equal(res.history.length, 5);
  assert.deepEqual(res.history.map((h) => h.delta), [null, null, null, null, null]);
});
