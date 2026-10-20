'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runWorkflow } = require('./r3DbWorkflow');

function fixture(t, name = 'clean') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-db-workflow-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'db-trial', `${name}.json`), 'utf8'));
  const report = source.input.report;
  if (name === 'partial') report.execution_outcome = 'PARTIAL';
  fs.writeFileSync(path.join(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(root, source.input.evidence.path), source.input.evidence.content_utf8);
  return {
    root,
    spec: {
      manifest: source.input.manifest,
      artifacts: [
        { source: 'report.json', path: 'report.json' },
        { source: source.input.evidence.path, path: source.input.evidence.path },
      ],
    },
  };
}

function config(maxAttempts = '1') {
  return {
    baseUrl: 'https://workflow.unit.test',
    table: 'r3_runs',
    evidenceReadbackView: 'r3_evidence_readback',
    key: 'mock-key',
    keyType: 'mock',
    timeoutMs: 1000,
    maxAttempts: Number(maxAttempts),
    retryBaseMs: 0,
    maxRetryAfterMs: 0,
  };
}

function backend() {
  const rows = new Map();
  const methods = [];
  const fetchImpl = async (url, options) => {
    methods.push(options.method);
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (!rows.has(row.run_id)) rows.set(row.run_id, row);
      return { ok: true, status: 201 };
    }
    const runId = new URL(url).searchParams.get('run_id').replace(/^eq\./, '');
    return { ok: true, status: 200, json: async () => rows.has(runId) ? [rows.get(runId)] : [] };
  };
  return { rows, methods, fetchImpl };
}

test('offline default archives, validates, summarizes, and queues without network', (t) => {
  const { root, spec } = fixture(t);
  const rawReport = fs.readFileSync(path.join(root, 'report.json'));
  let networkCalls = 0;
  const result = runWorkflow(spec, { root, fetchImpl: async () => { networkCalls += 1; throw new Error('unexpected network'); } });
  assert.equal(result.mode, 'offline');
  assert.equal(result.uploaded, false);
  assert.equal(result.readback, 'NOT_RUN');
  assert.equal(networkCalls, 0);
  assert.equal(fs.readFileSync(path.join(root, 'runs', spec.manifest.run_id, 'report.json')).compare(rawReport), 0);
  const archivedManifest = JSON.parse(fs.readFileSync(path.join(root, 'runs', spec.manifest.run_id, 'manifest.json'), 'utf8'));
  assert.deepEqual(archivedManifest.artifacts.map((item) => item.path).sort(), ['evidence.json', 'report.json']);
  assert.equal(fs.existsSync(path.join(root, result.summary)), true);
  assert.equal(fs.existsSync(path.join(root, 'runs', spec.manifest.run_id, 'summary.md')), false);
  assert.equal(fs.existsSync(path.join(root, result.outbox)), true);
});

test('documented CLI command completes the offline path from a JSON input', (t) => {
  const { root, spec } = fixture(t);
  const input = path.join(root, 'workflow.json');
  fs.writeFileSync(input, `${JSON.stringify(spec, null, 2)}\n`);
  const cli = path.join(__dirname, 'r3DbWorkflow.js');
  const result = spawnSync(process.execPath, [cli, input], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORKFLOW PASS .* mode=offline/);
  assert.match(result.stdout, /UPLOAD NOT_RUN READBACK NOT_RUN/);
  assert.equal(fs.existsSync(path.join(root, 'runs', spec.manifest.run_id, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'reports', `${spec.manifest.run_id}.md`)), true);
  assert.equal(fs.existsSync(path.join(root, 'outbox', `${spec.manifest.run_id}.json`)), true);
});

test('explicit upload uses accepted uploader and exact-ID mock readback; TRIAL stays excluded', async (t) => {
  const { root, spec } = fixture(t, 'clean');
  const server = backend();
  const result = await runWorkflow(spec, { root, mode: 'upload', config: config(), fetchImpl: server.fetchImpl });
  assert.equal(result.uploaded, true);
  assert.equal(result.readback, 'PASS');
  assert.deepEqual(server.methods, ['POST', 'GET']);
  assert.equal(server.rows.size, 1);
  assert.equal([...server.rows.values()][0].experiment_kind, 'TRIAL');
  assert.equal([...server.rows.values()][0].aggregate_eligibility, 'EXCLUDED');
  assert.equal(fs.existsSync(path.join(root, result.outbox)), true);
});

test('BLOCKED and PARTIAL reports preserve status and remain excluded in offline exports', (t) => {
  for (const [name, outcome] of [['blocked', 'BLOCKED'], ['partial', 'PARTIAL']]) {
    const { root, spec } = fixture(t, name);
    const result = runWorkflow(spec, { root });
    const envelope = JSON.parse(fs.readFileSync(path.join(root, result.outbox), 'utf8'));
    assert.equal(envelope.execution_outcome, outcome, name);
    assert.equal(envelope.aggregate_eligibility, 'EXCLUDED', name);
    assert.equal(envelope.experiment_kind, 'TRIAL', name);
  }
});

test('upload failure preserves immutable archive and outbox for retry', async (t) => {
  const { root, spec } = fixture(t);
  await assert.rejects(runWorkflow(spec, {
    root,
    mode: 'upload',
    config: config(),
    fetchImpl: async () => { throw new Error('private transport detail'); },
  }), /network failure attempts=1/);
  assert.equal(fs.existsSync(path.join(root, 'runs', spec.manifest.run_id, 'manifest.json')), true);
  assert.equal(fs.existsSync(path.join(root, 'outbox', `${spec.manifest.run_id}.json`)), true);
  assert.equal(fs.existsSync(path.join(root, 'reports', `${spec.manifest.run_id}.md`)), true);
});

test('refuses archive overwrite, missing sources, identity conflicts, and conflicting outbox payloads', (t) => {
  const first = fixture(t);
  runWorkflow(first.spec, { root: first.root });
  assert.throws(() => runWorkflow(first.spec, { root: first.root }), /refuse overwrite/);

  const missing = fixture(t, 'clean');
  missing.spec.artifacts[1].source = 'missing-evidence.json';
  assert.throws(() => runWorkflow(missing.spec, { root: missing.root }), /artifact source missing\/not file/);
  assert.equal(fs.existsSync(path.join(missing.root, 'outbox')), false);

  const mismatch = fixture(t, 'clean');
  mismatch.spec.manifest.run_id = 'different-run';
  assert.throws(() => runWorkflow(mismatch.spec, { root: mismatch.root }), /manifest\/report run_id mismatch/);
  assert.equal(fs.existsSync(path.join(mismatch.root, 'outbox')), false);

  const conflict = fixture(t, 'clean');
  fs.mkdirSync(path.join(conflict.root, 'outbox'));
  fs.writeFileSync(path.join(conflict.root, 'outbox', `${conflict.spec.manifest.run_id}.json`), '{"payload_sha256":"different"}\n');
  assert.throws(() => runWorkflow(conflict.spec, { root: conflict.root }), /same run_id has different sanitized payload/);
  assert.equal(fs.existsSync(path.join(conflict.root, 'runs', conflict.spec.manifest.run_id, 'manifest.json')), true);
});

test('refuses unsupported mode and missing report artifact before archive creation', (t) => {
  const { root, spec } = fixture(t);
  assert.throws(() => runWorkflow(spec, { root, mode: 'automatic' }), /mode must be offline or upload/);
  assert.throws(() => runWorkflow({ ...spec, artifacts: [] }, { root }), /source report.json artifact/);
  assert.equal(fs.existsSync(path.join(root, 'runs')), false);
});

test('rejects a report evidence path omitted from archive artifacts before creating data', (t) => {
  const { root, spec } = fixture(t, 'clean');
  spec.artifacts = [spec.artifacts[0]];
  assert.throws(() => runWorkflow(spec, { root }), /report evidence missing from archive artifacts: evidence\.json/);
  assert.equal(fs.existsSync(path.join(root, 'runs')), false);
  assert.equal(fs.existsSync(path.join(root, 'outbox')), false);
});
