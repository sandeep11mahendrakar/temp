'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBridgeExecutor } = require('./visionTrialExecutor.bridge');

function fakeChild({ code = 0, stdout = '' } = {}) {
  const listeners = {};
  const child = {
    stdout: { on: (e, cb) => { if (e === 'data') setTimeout(() => cb(Buffer.from(stdout)), 0); } },
    stderr: { on: () => {} },
    on: (e, cb) => { listeners[e] = listeners[e] || []; listeners[e].push(cb); },
    kill: () => {},
  };
  setTimeout(() => { (listeners.exit || []).forEach(cb => cb(code)); }, 5);
  return child;
}

test('bridge exports execute function', () => {
  const mod = require('./visionTrialExecutor.bridge');
  assert.equal(typeof mod, 'function');
});

test('bridge fake child COMPLETE', async () => {
  const exec = createBridgeExecutor({
    spawnProcess: () => fakeChild({ code: 0, stdout: 'Test cases from history: /tmp/test_cases_r_exploration.json\n' }),
    readResult: () => ({ termination_reason: 'done', totals: { llm_calls: 1 } })
  });
  const res = await exec({ id: 's', run_id: 'r', url: 'http://x' }, {});
  assert.equal(res.status, 'COMPLETE');
});