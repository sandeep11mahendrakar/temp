'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { aggregateReports, loadReportsFromDir, metricsToMarkdown } = require('../src/metricsCalc');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('metricsCalc: empty input -> zeros, no NaN', () => {
  const m = aggregateReports([]);
  assert.equal(m.runs, 0);
  assert.equal(m.cases_total, 0);
  assert.equal(m.pass_rate, 0);
  assert.equal(m.cost.usd_estimated, null);
});

test('metricsCalc: aggregates pass/weak/dom_assist/block/labels/cost', () => {
  const reports = [
    {
      run: { id: 'r1' }, result: { verdict: 'PASS', pass_rate: 1 },
      cases: [
        { id: 'a', verdict: 'PASS', weak_steps: 0, label: 'AUTONOMOUS', tc_source: 'brain', dom_assist: true, block: null, app_outcome: 'accepted' },
        { id: 'b', verdict: 'PASS_WEAK(1)', weak_steps: 1, label: 'ASSISTED', tc_source: 'archetype', dom_assist: false, block: 'ok', app_outcome: 'accepted' },
      ],
      cost: { api_calls: 2, tokens_in: 10, tokens_out: 3, usd_estimated: 0.01 },
      brain: { mode: 'api', model: 'm', blind: 'Y' },
      storage: { paths: ['x.json'] },
    },
    {
      run: { id: 'r2' }, result: { verdict: 'MIXED', pass_rate: 0.5 },
      cases: [
        { id: 'c', verdict: 'FAIL', weak_steps: 0, label: 'AUTONOMY_NONBLIND', tc_source: 'file', dom_assist: false, block: null, app_outcome: 'n/a' },
      ],
      cost: { api_calls: 0, tokens_in: 0, tokens_out: 0, usd_estimated: null },
    },
  ];
  const m = aggregateReports(reports);
  assert.equal(m.runs, 2);
  assert.equal(m.cases_total, 3);
  assert.equal(m.cases_pass, 2);
  assert.equal(m.weak_count, 1);
  assert.equal(m.dom_assist_count, 1);
  assert.equal(m.block_count, 1);
  assert.equal(m.cost.api_calls, 2);
  assert.equal(m.cost.tokens_in, 10);
  assert.equal(m.cost.usd_estimated, 0.01);
  assert.ok(m.labels.AUTONOMOUS === 1);
  assert.ok(m.labels.ASSISTED === 1);
  assert.ok(m.labels.AUTONOMY_NONBLIND === 1);
  assert.equal(m.per_run.length, 2);
  assert.ok(metricsToMarkdown(m).includes('Cases: 2/3 pass'));
});

test('metricsCalc: loadReportsFromDir reads folder + samples wrapper', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-'));
  const rep = { schema: 1, run: { id: 'x' }, result: { verdict: 'PASS', pass_rate: 1 }, cases: [], cost: { api_calls: 0, tokens_in: 0, tokens_out: 0, usd_estimated: null }, storage: { paths: [] } };
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(rep));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ samples: [{ report: rep }] }));
  const loaded = loadReportsFromDir(dir);
  assert.equal(loaded.length, 2);
});
