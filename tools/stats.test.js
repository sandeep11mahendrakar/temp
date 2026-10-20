'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { wilson, sampleVariance, collect, stats } = require('./stats');

function archive(t, root, folder, opts = {}) {
  const dir = path.join(root, folder); fs.mkdirSync(dir, { recursive: true });
  const manifest = { run_id: folder, site: opts.site || 'site-a', label: opts.label || 'ASSISTED',
    access: opts.access, cost: opts.cost || { calls: 0, tokens: 0, screens: 0, time: 0 } };
  const report = { sample_class: opts.sampleClass || 'clean', result: { verdict: opts.result || 'PASS' },
    ...(opts.contamination ? { contamination: ['recorded deviation'] } : {}),
    cases: opts.cases || [{ id: `${folder}-1`, verdict: 'PASS', verification_strength: 'STRONG', dom_assist: false }] };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report));
  return dir;
}
function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }

test('Wilson interval is bounded and rejects zero or invalid denominators', () => {
  const ci = wilson(8, 10);
  assert.ok(ci[0] >= 0 && ci[0] < ci[1] && ci[1] <= 1);
  assert.equal(wilson(0, 0), null);
  assert.equal(wilson(2, 1), null);
  assert.equal(wilson(-1, 2), null);
});

test('repeat variance uses per-run rates and needs two eligible repeats', () => {
  assert.equal(sampleVariance([0.5, 0.5]), 0);
  assert.equal(sampleVariance([1 / 3, 2 / 3]), 1 / 18);
  assert.equal(sampleVariance([0.5]), null);
  assert.equal(sampleVariance([]), null);
});

test('per-site stats preserve zero and separate pass, fail, blocked, and unknown cases', (t) => {
  const root = temp(t);
  archive(t, root, 'a', { cases: [{ verdict: 'PASS' }, { verdict: 'PASS_WEAK' }, { verdict: 'FAIL' }, { verdict: 'BLOCKED' }, { verdict: 'NOT_RECORDED' }] });
  const { rows, excluded } = stats(root); const row = rows[0];
  assert.equal(excluded.length, 0); assert.equal(row.pass, 2); assert.equal(row.fail, 1); assert.equal(row.blocked, 1);
  assert.equal(row.other, 1); assert.equal(row.total, 5); assert.equal(row.eligible, 3);
  assert.equal(row.pass_rate, 2 / 3); assert.equal(row.block_rate, 1 / 5); assert.equal(row.block_denominator, 5);
  assert.deepEqual(row.wilson95, wilson(2, 3)); assert.equal(row.calls, 0); assert.equal(row.tokens, 0);
});

test('TRIAL and contaminated runs are reported but excluded from performance', (t) => {
  const root = temp(t);
  archive(t, root, 'keep', { cases: [{ verdict: 'PASS' }, { verdict: 'BLOCKED' }] });
  archive(t, root, 'trial', { label: 'TRIAL', cases: [{ verdict: 'FAIL' }] });
  archive(t, root, 'dirty', { sampleClass: 'contaminated', cases: [{ verdict: 'PASS' }] });
  archive(t, root, 'deviation', { contamination: true, cases: [{ verdict: 'FAIL' }] });
  const result = stats(root);
  assert.deepEqual(result.excluded.map((r) => [r.run_id, r.reasons[0]]), [
    ['deviation', 'CONTAMINATED'], ['dirty', 'CONTAMINATED'], ['trial', 'TRIAL'],
  ]);
  assert.equal(result.rows[0].runs, 1); assert.equal(result.rows[0].fail, 0); assert.equal(result.rows[0].blocked, 1);
});

test('third-party runs are excluded with an explicit reason', (t) => {
  const root = temp(t); archive(t, root, 'third', { access: 'third_party' });
  const result = stats(root); assert.equal(result.rows.length, 0);
  assert.deepEqual(result.excluded[0].reasons, ['THIRD_PARTY']);
});

test('zero eligible cases have no pass rate or interval and one repeat has unknown variance', (t) => {
  const root = temp(t); archive(t, root, 'blocked', { cases: [{ verdict: 'BLOCKED' }] });
  const row = stats(root).rows[0];
  assert.equal(row.eligible, 0); assert.equal(row.pass_rate, null); assert.equal(row.wilson95, null);
  assert.equal(row.repeat_n, 0); assert.equal(row.repeat_variance, null); assert.equal(row.block_rate, 1);
});

test('repeat variance reports its actual eligible repeat denominator', (t) => {
  const root = temp(t);
  archive(t, root, 'repeat-a', { cases: [{ verdict: 'PASS' }, { verdict: 'FAIL' }] });
  archive(t, root, 'repeat-b', { cases: [{ verdict: 'PASS' }, { verdict: 'PASS' }] });
  const row = stats(root).rows[0];
  assert.equal(row.repeat_n, 2); assert.equal(row.repeat_variance, 0.125);
});

test('missing cost telemetry stays unknown instead of becoming zero', (t) => {
  const root = temp(t); archive(t, root, 'one', { cost: { calls: 0, tokens: null, screens: 0 } });
  const row = stats(root).rows[0];
  assert.equal(row.calls, 0); assert.equal(row.tokens, null); assert.equal(row.screens, 0); assert.equal(row.time, null);
});

test('label, evidence-strength, and DOM-assist mixes show recorded counts only', (t) => {
  const root = temp(t); archive(t, root, 'one', { cases: [
    { verdict: 'PASS', verification_strength: 'STRONG', dom_assist: true },
    { verdict: 'FAIL', verification_strength: 'WEAK', dom_assist: false },
    { verdict: 'PASS' },
  ] });
  const row = stats(root).rows[0];
  assert.deepEqual(row.label_mix, { ASSISTED: 1 });
  assert.deepEqual(row.verification_strength_mix, { STRONG: 1, WEAK: 1, NOT_RECORDED: 1 });
  assert.equal(row.dom_assist_yes, 1); assert.equal(row.dom_assist_n, 2); assert.equal(row.dom_assist_rate, 0.5);
});

test('missing archive reports remain visible in exclusions', (t) => {
  const root = temp(t); fs.mkdirSync(path.join(root, 'partial'));
  const result = stats(root); assert.equal(result.rows.length, 0);
  assert.deepEqual(result.excluded[0], { run_id: 'partial', site: 'NOT_RECORDED', reasons: ['manifest_missing'] });
});

test('malformed archive JSON fails loudly instead of silently changing denominators', (t) => {
  const root = temp(t); const dir = path.join(root, 'broken'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'manifest.json'), '{'); fs.writeFileSync(path.join(dir, 'report.json'), '{}');
  assert.throws(() => collect(root), /manifest\.json/);
});
