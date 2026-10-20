'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createVisionTrialExecutor } = require('./visionTrialExecutor');

function fakeChild({ code=0, stdout='', stderr='' } = {}) {
  const listeners = {};
  const child = {
    stdout: { on: (e, cb) => { if (e === 'data') setTimeout(() => cb(Buffer.from(stdout)), 0); } },
    stderr: { on: (e, cb) => { if (e === 'data') setTimeout(() => cb(Buffer.from(stderr)), 0); } },
    on: (e, cb) => { listeners[e] = listeners[e] || []; listeners[e].push(cb); },
    kill: () => {},
  };
  setTimeout(() => { (listeners.exit || []).forEach(cb => cb(code)); }, 5);
  return child;
}

test('successful fake child produces COMPLETE', async () => {
  const fixture = { termination_reason: 'done', totals: { llm_calls: 2, tokens: 10, screens: 3, time_ms: 1000 }, url: 'http://x' };
  const exec = createVisionTrialExecutor({
    spawnProcess: () => fakeChild({ code: 0, stdout: 'Test cases from history: /tmp/test_cases_run1_exploration.json\n' }),
    readResult: () => fixture
  });
  const res = await exec({ id: 'site1', run_id: 'run1', url: 'http://x' }, {});
  assert.equal(res.status, 'COMPLETE');
  assert.equal(res.archive_input.run_id, 'run1');
  assert.equal(res.archive_input.cost.calls, 2);
});

test('blocked remains BLOCKED', async () => {
  const fixture = { termination_reason: 'BLOCKED captcha', totals: {} };
  const exec = createVisionTrialExecutor({
    spawnProcess: () => fakeChild({ code: 0, stdout: 'Test cases from history: /tmp/test_cases_run2_exploration.json\n' }),
    readResult: () => fixture
  });
  const res = await exec({ id: 'site2', run_id: 'run2', url: 'http://x' }, {});
  assert.equal(res.status, 'BLOCKED');
});

test('missing output fails safely', async () => {
  const exec = createVisionTrialExecutor({
    spawnProcess: () => fakeChild({ code: 0, stdout: '' }),
    readResult: () => { throw new Error('ENOENT'); }
  });
  const res = await exec({ id: 'site3', run_id: 'run3', url: 'http://x' }, {});
  assert.equal(res.status, 'FAILED');
});

test('NEG archive_input.run_id stays site run_id even when output filename differs', async () => {
  const fixture = { termination_reason: 'done', totals: {} };
  const exec = createVisionTrialExecutor({
    spawnProcess: () => fakeChild({ code: 0, stdout: 'Test cases from history: /tmp/test_cases_other_exploration.json\n' }),
    readResult: () => fixture
  });
  const res = await exec({ id: 'siteX', run_id: 'siteRun', url: 'http://x' }, {});
  assert.equal(res.archive_input.run_id, 'siteRun');
  assert.notEqual(res.archive_input.run_id, 'other');
});

test('nonzero exit fails', async () => {
  const exec = createVisionTrialExecutor({
    spawnProcess: () => fakeChild({ code: 1, stderr: 'boom' }),
    readResult: () => ({})
  });
  const res = await exec({ id: 'site4', run_id: 'run4', url: 'http://x' }, {});
  assert.equal(res.status, 'FAILED');
});