'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeSheet } = require('./spotcheck');

function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spotcheck-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function addRun(root, folder, opts = {}) {
  const dir = path.join(root, folder); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ run_id: opts.runId || folder, site: opts.site || 'fixture-site', label: opts.label || 'ASSISTED' }));
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ sample_class: opts.sampleClass || 'clean', cases: opts.cases || [
    { id: 'A', verdict: 'PASS', evid_paths: ['evidence/a.json'] }, { id: 'B', verdict: 'FAIL', evid_paths: ['shots/b.png'], screenshot_path: 'shots/b.png' }, { id: 'C', verdict: 'BLOCKED', evid_paths: ['evidence/c.json'] }, { id: 'D', verdict: 'PASS', evid_paths: ['evidence/d.json'] },
  ] }));
  return dir;
}

test('spot-check selects exactly three cases deterministically and leaves human fields blank', (t) => {
  const root = temp(t); addRun(root, 'run-a');
  const first = makeSheet(root, 7); const second = makeSheet(root, 7);
  assert.equal(first, second);
  const lines = first.trimEnd().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.match(lines[0], /"run_id","site","run_label","sample_class","tc_id","evid_paths"/);
  assert.ok(!lines[0].includes('screenshot_path'));
  assert.ok(lines.some((line) => line.includes('evidence/')));
  assert.ok(lines.slice(1).every((line) => line.endsWith(',"",""')));
  assert.ok(lines.every((line) => line.startsWith('"')));
});

test('spot-check preserves case.evid_paths and refuses missing evidence provenance', (t) => {
  const root = temp(t); addRun(root, 'run-evidence', { cases: [
    { id: 'A', verdict: 'PASS', evid_paths: ['evidence/a.json', 'screens/a.png'], screenshot_path: 'must-not-be-aliased.png' },
    { id: 'B', verdict: 'FAIL', evid_paths: ['evidence/b.json'] },
    { id: 'C', verdict: 'BLOCKED', evid_paths: ['evidence/c.json'] },
  ] });
  const sheet = makeSheet(root, 7);
  assert.ok(sheet.includes('"[""evidence/a.json"",""screens/a.png""]"'));
  assert.ok(!sheet.includes('must-not-be-aliased.png'));

  const bad = temp(t); addRun(bad, 'run-missing', { cases: [
    { id: 'A', verdict: 'PASS', evid_paths: ['evidence/a.json'] },
    { id: 'B', verdict: 'FAIL' },
    { id: 'C', verdict: 'BLOCKED', evid_paths: ['evidence/c.json'] },
  ] });
  assert.throws(() => makeSheet(bad, 7), /selected case requires non-empty evid_paths string\[\]/);
});

test('spot-check refuses a run with fewer than three cases', (t) => {
  const root = temp(t); addRun(root, 'run-a', { cases: [{ id: 'A', verdict: 'PASS' }] });
  assert.throws(() => makeSheet(root), /3 test cases required/);
});

test('spot-check requires both archive manifest and report', (t) => {
  const root = temp(t); fs.mkdirSync(path.join(root, 'partial'));
  assert.throws(() => makeSheet(root), /manifest.json and report.json required/);
});

test('spot-check rejects mismatched archive folder identity', (t) => {
  const root = temp(t); addRun(root, 'folder-a', { runId: 'other-run' });
  assert.throws(() => makeSheet(root), /manifest\.run_id must match archive folder/);
});

test('spot-check requires recorded site and case IDs', (t) => {
  const root = temp(t); addRun(root, 'run-a', { site: 'NOT_RECORDED' });
  assert.throws(() => makeSheet(root), /recorded manifest\.site required/);
  const next = temp(t); addRun(next, 'run-b', { cases: [
    { evid_paths: ['evidence/missing-id.json'] },
    { id: 'B', evid_paths: ['evidence/b.json'] },
    { id: 'C', evid_paths: ['evidence/c.json'] },
  ] });
  assert.throws(() => makeSheet(next), /selected case requires recorded id/);
});

test('spot-check retains TRIAL and contaminated labels without inventing review values', (t) => {
  const root = temp(t); addRun(root, 'run-a', { label: 'TRIAL', sampleClass: 'contaminated' });
  const lines = makeSheet(root).trimEnd().split(/\r?\n/);
  assert.ok(lines.slice(1).every((line) => line.includes('"TRIAL","contaminated"')));
  assert.ok(lines.slice(1).every((line) => line.endsWith(',"",""')));
});

test('spot-check validates deterministic seed range', (t) => {
  const root = temp(t); addRun(root, 'run-a');
  assert.throws(() => makeSheet(root, -1), /unsigned 32-bit integer/);
  assert.throws(() => makeSheet(root, 1.5), /unsigned 32-bit integer/);
});

test('CSV quotes embedded commas and quotes in site names', (t) => {
  const root = temp(t); addRun(root, 'run-a', { site: 'site, "quoted"' });
  assert.ok(makeSheet(root).includes('"site, ""quoted"""'));
});

test('spot-check refuses an empty archive directory', (t) => {
  const root = temp(t); assert.throws(() => makeSheet(root), /no archived run directories/);
});

test('CLI refuses to overwrite an existing human sheet', (t) => {
  const root = temp(t); addRun(path.join(root, 'runs'), 'run-a');
  const docs = path.join(root, 'docs'); fs.mkdirSync(docs);
  const target = path.join(docs, 'SPOTCHECK.csv'); fs.writeFileSync(target, 'human-owned\n');
  const before = fs.readFileSync(target, 'utf8');
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'spotcheck.js'), path.join(root, 'runs')], { cwd: root, encoding: 'utf8' });
  assert.equal(cli.status, 2); assert.match(cli.stderr, /refuse overwrite/); assert.equal(fs.readFileSync(target, 'utf8'), before);
});
