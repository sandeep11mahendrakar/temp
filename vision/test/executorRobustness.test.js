'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isStaleError, withTimeout, withRetry, boundedRetries } = require('../src/executorRobustness');

test('V-4 isStaleError detects stale/detached', () => {
  assert.equal(isStaleError(new Error('stale element reference')), true);
  assert.equal(isStaleError(new Error('element not found')), true);
  assert.equal(isStaleError(new Error('ok')), false);
});

test('V-4 withTimeout resolves when fast', async () => {
  const r = await withTimeout(async () => 42, 1000);
  assert.equal(r, 42);
});

test('V-4 withTimeout rejects on timeout', async () => {
  await assert.rejects(() => withTimeout(() => new Promise(() => {}), 50), /timeout/);
});

test('V-4 withRetry retries then succeeds', async () => {
  let n = 0;
  const r = await withRetry(async () => {
    n += 1;
    if (n < 3) throw new Error('stale element reference');
    return 'ok';
  }, { retries: 3, delay: 1 });
  assert.equal(r, 'ok');
  assert.equal(n, 3);
});

test('V-4 withRetry throws after exhausting retries', async () => {
  await assert.rejects(() => withRetry(async () => { throw new Error('boom'); }, { retries: 1, delay: 1 }), /boom/);
});

test('V-4 boundedRetries caps at 5', () => {
  assert.equal(boundedRetries(10), 5);
  assert.equal(boundedRetries(-1), 0);
  assert.equal(boundedRetries(2), 2);
});
