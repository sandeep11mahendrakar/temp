'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTable, hasLiveRun } = require('../src/modelAblation');

test('R-4 buildTable normalizes rows', () => {
  const t = buildTable([{ model: 'mock', brain_mode: 'mock', api_calls: 0, vision: 504, mcp: 41, status: 'run' }]);
  assert.equal(t.length, 1);
  assert.equal(t[0].model, 'mock');
  assert.equal(t[0].api_calls, 0);
});

test('R-4 hasLiveRun false when no live runs', () => {
  assert.equal(hasLiveRun([{ status: 'not run' }]), false);
  assert.equal(hasLiveRun([{ status: 'run', api_calls: 5 }]), true);
});
