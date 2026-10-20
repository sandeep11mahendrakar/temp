'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { toReport } = require('./trialArtifacts');

test('adapter preserves NOT_RECORDED and maps test cases', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-artifacts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const exploration = { run_id: 'exp-1', totals: { total_steps: 5, total_states: 3, generated_tests: 1 }, test_cases_file: null };
  const report = toReport(exploration, {});
  assert.equal(report.run.id, 'exp-1');
  assert.equal(report.result.verdict, 'NOT_RECORDED');
  assert.equal(report.cases.length, 1);
  assert.equal(report.telemetry.total_steps, 5);
});

test('REGRESSION preserves all twelve producer metrics including zero and fractional values', () => {
  const totals = {
    total_steps: 8, total_states: 6, unique_states: 6, unique_urls: 3,
    repeated_states_skipped: 3, action_errors: 0, click_actions: 7, fill_actions: 1,
    scroll_actions: 0, submit_actions: 1, generated_tests: 1, avg_steps_per_test: 2.5,
  };
  assert.deepEqual(toReport({ run_id: 'metrics', totals }).telemetry, totals);
});

test('REGRESSION absent and nonnumeric metrics remain NOT_RECORDED', () => {
  const report = toReport({ totals: { click_actions: '7', fill_actions: null, avg_steps_per_test: Infinity } });
  assert.equal(Object.keys(report.telemetry).length, 12);
  assert.ok(Object.values(report.telemetry).every((value) => value === 'NOT_RECORDED'));
});
