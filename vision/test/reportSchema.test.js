'use strict';

// B7 report schema: offline tests. No I/O, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  buildReport,
  indexRow,
  checkReport,
} = require('../src/reportSchema');

const demo = () => buildReport({
  runId: 'exec_1',
  ts: '2026-10-13T00:00:00.000Z',
  source: 'vision-loopB',
  loops: [{ n: 1, delta: null, covered: false }, { n: 2, delta: ['b'], covered: true }],
  cases: [
    { id: 'S1-B2', verdict: 'PASS', weak_steps: 0, evidence: 's1_rep1.json' },
    { id: 'M6-FULLCHAIN', verdict: 'PASS_WEAK(1)', weak_steps: 1, evidence: 'm6_rep.json' },
  ],
  cost: { api_calls: 0, tokens_in: 0, tokens_out: 0, usd_estimated: null },
  storagePaths: ['storage/outputs/s1_rep1.json', 'storage/outputs/m6_rep.json'],
});

test('B7 report: schema1 assembles run/loops/cases+result/cost/storage/citable', () => {
  const r = demo();
  assert.equal(r.schema, SCHEMA_VERSION);
  assert.equal(r.cases.length, 2);
  assert.equal(r.result.pass_rate, 1);
  assert.equal(r.cost.api_calls, 0);
  assert.equal(r.storage.paths.length, 2);
  assert.match(r.citable.ref, /^run-exec_1$/);
  assert.match(r.citable.sha1, /^[0-9a-f]{40}$/);
  const again = demo();
  assert.equal(again.citable.sha1, r.citable.sha1);
});

test('B7 report: checker flags version/keys/types, clean report passes', () => {
  assert.deepEqual(checkReport(demo()), []);
  assert.ok(checkReport({ schema: 2 }).length > 0);
  assert.ok(checkReport(null).length > 0);
  const broken = demo();
  delete broken.cases;
  broken.cost.api_calls = 'zero';
  const bad = checkReport(broken);
  assert.ok(bad.includes('missing:cases'));
  assert.ok(bad.includes('cost.api_calls:not-number'));
});

test('B7 report: INDEX row renders pipes with verdict+cost+storage+sha', () => {
  const row = indexRow(demo());
  assert.match(row, /^\| run-exec_1 \|/);
  assert.ok(row.includes('n/a'), 'null usd renders n/a, never invented');
  assert.ok(row.includes('s1_rep1.json'));
  assert.ok(row.split('|').length >= 7);
});
