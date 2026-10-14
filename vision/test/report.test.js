'use strict';

// B7-full report pipeline: offline tests. Temp files only (os.tmpdir).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  summarizeLoops,
  caseFromResult,
  buildLoopReport,
  writeReportFile,
} = require('../src/report');

test('B7-full pipeline: history->loops, results+oracle->cases incl PASS/rejected', () => {
  assert.deepEqual(summarizeLoops([
    { loop: 1, delta: null, covered: false },
    { loop: 2, delta: ['b'], covered: true },
    null,
  ]), [
    { n: 1, delta: null, covered: false },
    { n: 2, delta: ['b'], covered: true },
  ]);
  const neg = caseFromResult('B8-locked', { verdict: 'FAIL' },
    { verdict: 'PASS', app_outcome: 'rejected', snip300: 'locked out', ocr_count: 12 });
  assert.deepEqual([neg.verdict, neg.app_outcome], ['FAIL', 'rejected']);
  const plain = caseFromResult('S1', { verdict: 'PASS', steps_executed: [1, 2, 3] }, null);
  assert.deepEqual([plain.verdict, plain.app_outcome, plain.evidence], ['PASS', 'n/a', 'steps:3']);
});

test('B7-full pipeline: loop report assembles schema1 with loops+cases', () => {
  const r = buildLoopReport({
    runId: 'demo-1',
    histories: [{ loop: 1, delta: null, covered: true }],
    results: [{ tcId: 'S1', exec: { verdict: 'PASS', steps_executed: [1] }, oracle: null }],
    cost: { api_calls: 0 },
    storagePaths: ['storage/outputs/s1_rep1.json'],
  });
  assert.equal(r.schema, 1);
  assert.equal(r.loops.length, 1);
  assert.equal(r.cases.length, 1);
  assert.equal(r.cost.api_calls, 0);
  assert.match(r.citable.sha1, /^[0-9a-f]{40}$/);
});

test('B7-full pipeline: atomic persist + INDEX row; invalid report refused', () => {
  const r = buildLoopReport({ runId: 'demo-2', histories: [], results: [], cost: {} });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'b7f-')), 'report.json');
  const out = writeReportFile(r, file);
  assert.equal(out.path, file);
  assert.match(out.row, /\| run-demo-2 \|/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).citable, r.citable);
  assert.throws(() => writeReportFile({ schema: 2 }, file + '.bad'), /refusing to persist/);
});
