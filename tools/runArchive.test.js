'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { archiveRun, MISSING } = require('./runArchive');

test('archives files with hashes and preserves missing evidence as NOT_RECORDED', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({ run: { id: 'sample-clean' }, result: { verdict: 'PASS' }, cost: { api_calls: 2, tokens_in: 3, tokens_out: 4 } }) + '\n');
  fs.writeFileSync(path.join(root, 'calls.jsonl'), '{"call":1}\n');
  const result = archiveRun({ run_id: 'sample-clean', artifacts: [{ source: 'report.json', path: 'report.json' }], calls_source: 'calls.jsonl' }, { root });
  assert.equal(result.manifest.site, MISSING);
  assert.equal(result.manifest.brain.blind, MISSING);
  assert.equal(result.manifest.verdict, 'PASS');
  assert.equal(result.manifest.cost.llm_calls, 2);
  assert.equal(result.manifest.cost.tokens, 7);
  assert.equal(result.manifest.not_recorded['cost.screens'], 'screen count absent from input and report');
  assert.match(result.manifest.not_recorded['cost.screens'], /absent/);
  assert.equal(result.manifest.artifacts.length, 2);
  assert.equal(result.manifest.artifacts[0].bytes, fs.statSync(path.join(root, 'runs', 'sample-clean', 'report.json')).size);
  assert.match(result.manifest.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(root, 'runs', 'sample-clean', 'per_call.jsonl')), true);
});

test('captures fixture verdict, run and stage timings, cost, and provenance without changing false or zero', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const report = {
    run: { id: 'full' },
    result: { verdict: 'PASS' }, cost: { api_calls: 3, tokens_in: 8, tokens_out: 5, screens: 4 },
    timings: { run: { started: '2026-10-19T10:00:00.000Z', ended: '2026-10-19T10:01:00.000Z' },
      stages: { explore: { started: '2026-10-19T10:00:01.000Z', ended: '2026-10-19T10:00:50.000Z', duration_ms: 49 } } },
  };
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report));
  fs.writeFileSync(path.join(root, 'calls.jsonl'), '{"call":1}\n');
  const result = archiveRun({ run_id: 'full', site: 'fixture', url: 'https://example.invalid',
    head: 'abc123', dirty: false, model_provider: 'provider', model_id: 'model',
    contract_hash: 'a'.repeat(64), prompt_hash: 'b'.repeat(64), browser: 'chromium', viewport: { width: 800, height: 600 },
    os: 'test-os', limits: {}, seed: 0, label: 'ASSISTED', brain: { mode: 'ASSISTED', role: 'worker', blind: false },
    cost: { llm_calls: 0, tokens: 0, screens: 0, time: 0 }, calls_source: 'calls.jsonl',
    artifacts: [{ source: 'report.json', path: 'report.json' }] }, { root });
  assert.equal(result.manifest.verdict, 'PASS');
  assert.equal(result.manifest.verdict_source, 'report.json');
  assert.deepEqual(result.manifest.timings.run, report.timings.run);
  assert.deepEqual(result.manifest.timings.stages.explore, report.timings.stages.explore);
  assert.equal(result.manifest.cost.llm_calls, 0);
  assert.equal(result.manifest.cost.tokens, 0);
  assert.equal(result.manifest.cost.screens, 0);
  assert.equal(result.manifest.cost.time, 0);
  assert.equal(result.manifest.dirty, false);
  assert.equal(result.manifest.seed, 0);
  assert.deepEqual(result.manifest.provenance.viewport, { width: 800, height: 600 });
  assert.equal(Object.keys(result.manifest.not_recorded).length, 0);
});

test('unavailable report and measurements stay NOT_RECORDED with reasons', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = archiveRun({ run_id: 'unknown', site: MISSING, dirty: false,
    cost: { calls: MISSING, tokens: null, screens: MISSING, time: MISSING },
    brain: { mode: MISSING, role: MISSING, blind: false } }, { root });
  assert.equal(result.manifest.verdict, MISSING);
  assert.equal(result.manifest.verdict_source, MISSING);
  assert.equal(result.manifest.timings.run.started, MISSING);
  assert.equal(result.manifest.timings.stages, MISSING);
  assert.equal(result.manifest.cost.llm_calls, MISSING);
  assert.equal(result.manifest.cost.tokens, null);
  assert.equal(result.manifest.dirty, false);
  assert.match(result.manifest.not_recorded.site, /not captured/);
  assert.match(result.manifest.not_recorded['cost.llm_calls'], /absent/);
  assert.match(result.manifest.not_recorded['cost.calls'], /absent/);
  assert.match(result.manifest.not_recorded.verdict, /report.json absent/);
  assert.match(result.manifest.not_recorded['cost.tokens'], /unavailable/);
  assert.match(result.manifest.not_recorded['provenance.model_id'], /not captured/);

  fs.writeFileSync(path.join(root, 'partial-report.json'), JSON.stringify({ run: { id: 'partial' }, result: { verdict: 'MIXED' },
    timings: { stages: { explore: { started: '2026-10-19T10:00:00.000Z' } } } }));
  const partial = archiveRun({ run_id: 'partial', artifacts: [{ source: 'partial-report.json', path: 'report.json' }] }, { root });
  assert.equal(partial.manifest.timings.stages.explore.started, '2026-10-19T10:00:00.000Z');
  assert.equal(partial.manifest.timings.stages.explore.ended, MISSING);
  assert.match(partial.manifest.not_recorded['timings.stages.explore.ended'], /not captured/);
  assert.match(partial.manifest.not_recorded['timings.stages.explore.duration_ms'], /not captured/);
});

test('rejects report identity mismatch and detects archived report tampering', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({ run: { id: 'other' }, result: { verdict: 'PASS' } }));
  assert.throws(() => archiveRun({ run_id: 'expected', artifacts: [{ source: 'report.json', path: 'report.json' }] }, { root }), /manifest\/report run_id mismatch/);
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({ run: { id: 'expected' }, result: { verdict: 'PASS' } }));
  const result = archiveRun({ run_id: 'expected', artifacts: [{ source: 'report.json', path: 'report.json' }] }, { root });
  const archived = path.join(root, 'runs', 'expected', 'report.json');
  assert.equal(result.manifest.artifacts[0].sha256, require('node:crypto').createHash('sha256').update(fs.readFileSync(archived)).digest('hex'));
  fs.appendFileSync(archived, 'tamper');
  const actual = require('node:crypto').createHash('sha256').update(fs.readFileSync(archived)).digest('hex');
  assert.notEqual(actual, result.manifest.artifacts[0].sha256);
});

test('refuses an existing run archive without overwriting it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'runs', 'same'), { recursive: true });
  assert.throws(() => archiveRun({ run_id: 'same' }, { root }), /refuse overwrite/);
});

test('rejects traversal and paths outside the archive root', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'report.json'), '{}');
  assert.throws(() => archiveRun({ run_id: 'safe', artifacts: [{ source: 'report.json', path: '../escape' }] }, { root }), /unsafe artifact path/);
});

test('rejects direct and symlink-parent source escapes before copying outside bytes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'run-archive-outside-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'evidence.json'), '{"private":"synthetic"}\n');
  assert.throws(() => archiveRun({ run_id: 'direct', artifacts: [{ source: '../outside/evidence.json', path: 'evidence.json' }] }, { root }), /artifact source must stay inside project root/);
  fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
  assert.throws(() => archiveRun({ run_id: 'linked', artifacts: [{ source: 'linked/evidence.json', path: 'evidence.json' }] }, { root }), /artifact source must stay inside project root/);
  assert.equal(fs.existsSync(path.join(root, 'runs', 'direct')), false);
  assert.equal(fs.existsSync(path.join(root, 'runs', 'linked')), false);
  assert.equal(fs.readFileSync(path.join(outside, 'evidence.json'), 'utf8'), '{"private":"synthetic"}\n');
});
