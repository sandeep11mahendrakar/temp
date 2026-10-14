'use strict';

// B6-full loop controller: offline mock-integration tests. Zero API calls.

const test = require('node:test');
const assert = require('node:assert/strict');

const { runLoops, shouldStop } = require('../src/loopController');

const keepAll = async (prompt) => {
  const m = String(prompt).match(/CANDIDATES: ([^\n]*)/);
  const ids = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  return JSON.stringify({ keep: ids, note: 'all' });
};

// Mock executor: marks the first `n` planned-but-undone TCs done per loop.
const execCovering = (n) => {
  const done = new Set();
  return async (cases) => {
    const fresh = cases.map((c) => c.id).filter((id) => !done.has(id)).slice(0, n);
    fresh.forEach((id) => done.add(id));
    return { doneTCs: fresh, verdict: 'PASS' };
  };
};

const io = (execute) => ({
  perceive: async ({ loop }) => ({ id: `s${loop}` }),
  execute,
  llmCall: keepAll,
});

test('B6-full loop: 1-new-per-loop stops at loop2 via delta<=1', async () => {
  const res = await runLoops(io(execCovering(1)), 'regression', { site: 's' });
  assert.equal(res.loops, 2);
  assert.equal(res.covered, false);
  assert.equal(res.lastDelta, 1);
  assert.equal(res.error, null);
  assert.ok(res.store.sites.s.attempts >= 2);
});

test('B6-full loop: full coverage loop1 stops immediately as covered', async () => {
  const res = await runLoops(io(execCovering(99)), 'regression', { site: 's' });
  assert.equal(res.loops, 1);
  assert.equal(res.covered, true);
});

test('B6-full stop predicate: table incl loop5 cap', () => {
  assert.equal(shouldStop({ loop: 1, delta: 0, covered: false }), false);
  assert.equal(shouldStop({ loop: 2, delta: 1, covered: false }), true);
  assert.equal(shouldStop({ loop: 2, delta: 0, covered: false }), true);
  assert.equal(shouldStop({ loop: 1, delta: null, covered: true }), true);
  assert.equal(shouldStop({ loop: 2, delta: 2, covered: false }), false);
  assert.equal(shouldStop({ loop: 5, delta: 9, covered: false }), true);
  assert.equal(shouldStop({ loop: 5, delta: null, covered: false }), true);
});
