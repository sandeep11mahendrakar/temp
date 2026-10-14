'use strict';

// B5 batch planner: offline tests with injected mock LLM calls. Zero API calls.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  expandBatch,
  selectBatch,
  validTestCase,
  planBatch,
} = require('../src/batchPlan');
const { LOGIN_HINTS } = require('../src/archetypes');

const seeds6 = { users: LOGIN_HINTS.users, checkout: true, negative: true };
const mockKeepAll = async () => JSON.stringify({
  keep: ['login-standard_user', 'login-locked_out_user', 'login-problem_user',
    'login-performance_glitch_user', 'login-error_user', 'login-visual_user',
    'login-negative-empty', 'checkout-full'],
  note: 'full coverage',
});

test('B5 code-expand: 6 users + checkout + negative -> 8 shaped candidates', () => {
  const cands = expandBatch(seeds6);
  assert.equal(cands.length, 8);
  for (const c of cands) assert.ok(validTestCase(c), c.id);
  assert.ok(cands.some((c) => c.id === 'checkout-full'));
  assert.ok(cands.some((c) => c.id === 'login-negative-empty'));
});

test('B5 ONE-llm select keep-all: strict JSON first try -> 8 tc', async () => {
  let calls = 0;
  const res = await planBatch(async () => { calls += 1; return mockKeepAll(); }, seeds6, 'p');
  assert.equal(calls, 1);
  assert.equal(res.test_cases.length, 8);
  assert.equal(res.via, 'llm-first');
  assert.equal(res.attempts, 1);
});

test('B5 retry-unknown: garbage first -> strict retry recovers (attempts=2)', async () => {
  const calls = [];
  const res = await planBatch(async (prompt) => {
    calls.push(prompt);
    return calls.length === 1 ? 'thinking out loud, no json here' : mockKeepAll();
  }, seeds6, 'p');
  assert.equal(res.attempts, 2);
  assert.equal(res.via, 'llm-retry');
  assert.equal(res.test_cases.length, 8);
  assert.match(calls[1], /JSON ONLY/);
});

test('B5 unknown-twice: code-order fallback, never throws, junk dropped', async () => {
  const res = await planBatch(async () => 'still prose, no object', seeds6, 'p');
  assert.equal(res.via, 'code-order-fallback');
  assert.equal(res.attempts, 2);
  assert.equal(res.test_cases.length, 8);
  const res2 = await planBatch(async () => ({ keep: ['nope', 42, null] }), seeds6, 'p');
  assert.equal(res2.via, 'code-order-fallback');
});
