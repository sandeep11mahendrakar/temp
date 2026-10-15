'use strict';

// Q4-minlen3: minimum-3 coverage floor for blind-fired actions. Mention-count
// audit across llmActions + blindFire{Pointer,Value,Key} showed snapshot as
// the thinnest-covered K1 action (parse-listing only, no dedicated fire test).
// +2 dedicated snapshot tests below. Fake page only - no browser, no LLM.
// Test-only commit per D29 src-freeze (HOLDER=W1 live); vision/src untouched.

const test = require('node:test');
const assert = require('node:assert/strict');

const { executeAction } = require('../src/llm');

function fakePage() {
  const calls = { shots: 0, clicks: [] };
  return {
    calls,
    mouse: { async click(x, y) { calls.clicks.push([x, y]); } },
    keyboard: { async press() {}, async type() {} },
    async screenshot() { calls.shots += 1; return Buffer.from([1, 2, 3]); },
  };
}

test('Q4-minlen3 snapshot blind-fire captures exactly one shot, coord-free', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'snapshot' });
  assert.equal(p.calls.shots, 1);
  assert.equal(p.calls.clicks.length, 0);
  const buf = await p.screenshot();
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(p.calls.shots, 2);
});

test('Q4-minlen3 snapshot blind-fire ignores stray coords/value, still one shot', async () => {
  const p = fakePage();
  await executeAction(p, { action: 'snapshot', x: 1, y: 2, value: 'junk' });
  assert.equal(p.calls.shots, 1);
  assert.equal(p.calls.clicks.length, 0);
});
