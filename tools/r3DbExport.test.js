'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildExport, writeOutbox } = require('./r3DbExport');

function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fixture(root, id = 'export-clean') {
  const dir = path.join(root, id); fs.mkdirSync(dir);
  const report = { schema_version: '1.0', experiment_kind: 'TRIAL', citable: false, aggregate_eligibility: 'EXCLUDED', sample_class: 'clean', run: { id, source: 'synthetic test' }, result: { verdict: 'PASS' }, integrity: { verdict: 'CLEAN', reasons: [] }, cases: [{ id: `${id}-case`, verdict: 'PASS', app_outcome: 'n/a', tc_source: 'fixture', label: 'ASSISTED', block: null, strength: 'NOT_RECORDED', evid_paths: ['evidence.json'] }], telemetry: { duration_ms: 0, calls: 'NOT_RECORDED', tokens: null, screens: 0 }, diagnostics: { api_key: 'synthetic-dropped' } };
  const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const manifest = { run_id: id, site: 'synthetic', url: 'https://example.test/path?access_token=synthetic#frag', head: 'NOT_RECORDED', dirty: false, model_provider: 'NOT_RECORDED', model_id: 'NOT_RECORDED', contract_hash: 'NOT_RECORDED', prompt_hash: 'NOT_RECORDED', browser: 'NOT_RECORDED', viewport: 'NOT_RECORDED', os: 'NOT_RECORDED', limits: 'NOT_RECORDED', seed: 'NOT_RECORDED', started: 'NOT_RECORDED', ended: 'NOT_RECORDED', label: 'ASSISTED', brain: { mode: 'fixture', role: 'test', blind: 'N' }, cost: { calls: 0, tokens: null, screens: 0, time: 'NOT_RECORDED' }, per_call: 'NOT_RECORDED', experiment_kind: 'TRIAL', citable: false, aggregate_eligibility: 'EXCLUDED', artifacts: [{ path: 'report.json', bytes: reportBytes.length, sha256: hash(reportBytes) }, { path: 'evidence.json', bytes: 2, sha256: hash(Buffer.from('{}')) }] };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'manifest.json'), manifestBytes); fs.writeFileSync(path.join(dir, 'report.json'), reportBytes); fs.writeFileSync(path.join(dir, 'evidence.json'), '{}');
  return { dir, manifest, report };
}
function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-export-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }

test('exports clean synthetic trial with distinct raw and sanitized hashes and keeps zero telemetry', (t) => {
  const root = temp(t); const input = fixture(root); const result = buildExport(input.dir);
  assert.equal(result.envelope.run_id, input.manifest.run_id);
  assert.equal(result.envelope.experiment_kind, 'TRIAL'); assert.equal(result.envelope.aggregate_eligibility, 'EXCLUDED');
  assert.equal(result.envelope.manifest.cost.calls, 0); assert.equal(result.envelope.report.telemetry.duration_ms, 0);
  assert.equal(result.envelope.manifest.url, 'https://example.test/path');
  assert.equal(result.envelope.report.diagnostics, undefined);
  assert.notEqual(result.export_sha256, result.source_hashes.report_sha256);
  assert.equal(result.envelope.payload_sha256, result.export_sha256);
});

test('rejects prohibited markers in source keys and values, including nested content and URLs', (t) => {
  const root = temp(t); const input = fixture(root);
  for (const [where, value] of [['url', 'https://example.test/?x=service_role'], ['report', 'sb_secret_SYNTHETIC_NOT_A_KEY'], ['nested key', 'key']]) {
    const report = JSON.parse(fs.readFileSync(path.join(input.dir, 'report.json'), 'utf8'));
    if (where === 'url') input.manifest.url = value;
    else if (where === 'report') report.notes = value;
    else report.diagnostics = { service_role: 'synthetic-marker' };
    fs.writeFileSync(path.join(input.dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    input.manifest.artifacts[0].bytes = fs.statSync(path.join(input.dir, 'report.json')).size;
    input.manifest.artifacts[0].sha256 = hash(fs.readFileSync(path.join(input.dir, 'report.json')));
    fs.writeFileSync(path.join(input.dir, 'manifest.json'), `${JSON.stringify(input.manifest, null, 2)}\n`);
    assert.throws(() => buildExport(input.dir), /prohibited credential marker/);
    input.manifest.url = 'https://example.test/path';
  }
});

test('rejects identity mismatch and source artifact tampering', (t) => {
  const root = temp(t); const input = fixture(root);
  let report = JSON.parse(fs.readFileSync(path.join(input.dir, 'report.json'), 'utf8')); report.run.id = 'other';
  fs.writeFileSync(path.join(input.dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  assert.throws(() => buildExport(input.dir), /schema|run_id mismatch/);
  const second = fixture(root, 'tamper'); fs.writeFileSync(path.join(second.dir, 'evidence.json'), 'tampered');
  assert.throws(() => buildExport(second.dir), /artifact byte mismatch|artifact sha256 mismatch/);
});

test('outbox is immutable: identical duplicate is no-op and changed same-ID payload conflicts', (t) => {
  const root = temp(t); const input = fixture(root); const outbox = path.join(root, 'outbox');
  assert.equal(writeOutbox(input.dir, outbox).duplicate, false);
  assert.equal(writeOutbox(input.dir, outbox).duplicate, true);
  const report = JSON.parse(fs.readFileSync(path.join(input.dir, 'report.json'), 'utf8')); report.result.verdict = 'FAIL';
  fs.writeFileSync(path.join(input.dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  input.manifest.artifacts[0].bytes = fs.statSync(path.join(input.dir, 'report.json')).size;
  input.manifest.artifacts[0].sha256 = hash(fs.readFileSync(path.join(input.dir, 'report.json')));
  fs.writeFileSync(path.join(input.dir, 'manifest.json'), `${JSON.stringify(input.manifest, null, 2)}\n`);
  assert.throws(() => writeOutbox(input.dir, outbox), /same run_id has different sanitized payload/);
});

test('exports W4 synthetic clean, blocked, partial, and contaminated fixtures as excluded trials', (t) => {
  const root = temp(t);
  for (const name of ['clean', 'blocked', 'partial', 'contaminated']) {
    const fixtureData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'db-trial', `${name}.json`), 'utf8'));
    const dir = path.join(root, name); fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(fixtureData.input.manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'report.json'), `${JSON.stringify(fixtureData.input.report, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, fixtureData.input.evidence.path), fixtureData.input.evidence.content_utf8);
    const result = buildExport(dir);
    assert.equal(result.envelope.experiment_kind, 'TRIAL', name);
    assert.equal(result.envelope.aggregate_eligibility, 'EXCLUDED', name);
    assert.equal(result.envelope.integrity_verdict, fixtureData.expected.integrity_verdict, name);
  }
});
