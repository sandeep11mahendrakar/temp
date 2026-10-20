'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildPayload, queueRun, uploadOutbox, readEligibleRuns, configFromEnv } = require('./trialUploader');

function fixture(t, sample = 'clean') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-uploader-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runDir = path.join(root, 'run');
  fs.cpSync(path.resolve(`runs/schema-${sample}`), runDir, { recursive: true });
  const manifestPath = path.join(runDir, 'manifest.json');
  const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.run_id = report.run.id;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { root, runDir, outbox: path.join(root, 'outbox') };
}
function env() {
  return { SUPABASE_URL: 'https://unit.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit-key', SUPABASE_RUNS_TABLE: 'trial_runs', SUPABASE_ELIGIBILITY_VIEW: 'eligible_trial_runs' };
}
function legacyAnon(role) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ role })}.signature`;
}
function writeReport(runDir, report) {
  const reportPath = path.join(runDir, 'report.json');
  const bytes = Buffer.from(JSON.stringify(report));
  fs.writeFileSync(reportPath, bytes);
  const manifestPath = path.join(runDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const artifact = manifest.artifacts.find((item) => item.path === 'report.json');
  artifact.bytes = bytes.length;
  artifact.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

test('builds schema-versioned, sanitized payload with hashes and pending eligibility', (t) => {
  const { runDir } = fixture(t);
  const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
  report.local_file = 'C:\\Users\\private\\evidence.png';
  writeReport(runDir, report);
  const payload = buildPayload(runDir);
  assert.equal(payload.schema_version, '1.0');
  assert.equal(payload.aggregate_eligibility, 'PENDING_VALIDATION');
  assert.match(payload.manifest_sha256, /^[a-f0-9]{64}$/);
  assert.match(payload.report_sha256, /^[a-f0-9]{64}$/);
  assert.equal(payload.report.local_file, 'evidence.png');
});

test('queues immutable local outbox and refuses changed run_id payload', (t) => {
  const { runDir, outbox } = fixture(t);
  const first = queueRun(runDir, { outboxDir: outbox });
  assert.equal(first.queued, true);
  assert.equal(queueRun(runDir, { outboxDir: outbox }).queued, false);
  const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
  report.changed = true;
  writeReport(runDir, report);
  assert.throws(() => queueRun(runDir, { outboxDir: outbox }), /outbox conflict/);
});

test('POST is insert-only and duplicate retry leaves one run_id row', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const rows = new Map(); const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const row = JSON.parse(options.body);
    if (!rows.has(row.run_id)) rows.set(row.run_id, row);
    return { ok: true, status: 201 };
  };
  const config = configFromEnv(env());
  await uploadOutbox(queued.file, { config, fetchImpl });
  await uploadOutbox(queued.file, { config, fetchImpl });
  assert.equal(rows.size, 1);
  assert.equal(calls.every(({ options }) => options.method === 'POST'), true);
  assert.equal(calls[0].options.headers.prefer, 'resolution=ignore-duplicates,return=minimal');
  assert.equal(calls[0].url.endsWith('/rest/v1/trial_runs?on_conflict=run_id'), true);
  assert.equal(calls[0].options.body.includes(config.key), false);
  assert.equal(calls[0].options.headers.apikey, config.key);
  assert.equal(calls[0].options.headers.authorization, undefined);
});

test('network failure retains outbox and retry succeeds', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const config = configFromEnv(env());
  await assert.rejects(uploadOutbox(queued.file, { config, fetchImpl: async () => { throw new Error('private transport detail'); } }), /outbox retained for retry/);
  assert.equal(fs.existsSync(queued.file), true);
  const result = await uploadOutbox(queued.file, { config, fetchImpl: async () => ({ ok: true, status: 201 }) });
  assert.equal(result.uploaded, true);
  assert.equal(fs.existsSync(queued.file), true);
});

test('rejects all required secret-marker forms before outbox write', (t) => {
  const { runDir, outbox } = fixture(t);
  const markers = [ ['service', '_role'].join(''), ['sb', '_secret_', 'x'].join(''), String.fromCharCode(101, 121, 74) + 'x' ];
  for (const marker of markers) {
    const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
    report.result.verdict = marker;
    writeReport(runDir, report);
    assert.throws(() => queueRun(runDir, { outboxDir: outbox }), /prohibited secret marker/);
  }
  assert.equal(fs.existsSync(outbox), false);
});

test('reruns carry supersedes_report and must use a new run_id', (t) => {
  const { runDir } = fixture(t);
  const reportPath = path.join(runDir, 'report.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  report.supersedes_report = 'prior-report-id';
  writeReport(runDir, report);
  assert.equal(buildPayload(runDir).supersedes_report, 'prior-report-id');
  report.supersedes_report = 'sample-clean';
  writeReport(runDir, report);
  assert.throws(() => buildPayload(runDir), /new run_id/);
});

test('rejects manifest/report run identity mismatch', (t) => {
  const { runDir } = fixture(t);
  const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
  report.run.id = 'other-run';
  writeReport(runDir, report);
  assert.throws(() => buildPayload(runDir), /run_id mismatch/);
});

test('eligibility reads use the configured view with GET only', async () => {
  let call;
  const rows = [{ run_id: 'eligible-1' }];
  const result = await readEligibleRuns({ env: env(), fetchImpl: async (url, options) => {
    call = { url, options };
    return { ok: true, status: 200, json: async () => rows };
  } });
  assert.deepEqual(result, rows);
  assert.equal(call.url.endsWith('/rest/v1/eligible_trial_runs?select=*'), true);
  assert.equal(call.options.method, 'GET');
});

test('legacy anon JWT transport sends bearer only after role validation', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const config = configFromEnv({ ...env(), SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_ANON_KEY: legacyAnon('anon') });
  let request;
  await uploadOutbox(queued.file, { config, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201 };
  } });
  assert.equal(request.options.headers.authorization, `Bearer ${config.key}`);
  assert.equal(request.options.headers.apikey, config.key);
});

test('requires HTTPS, anon key, and configured table/view identifiers', () => {
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_URL: 'http://remote.test' }), /HTTPS/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_URL: 'https://user:pass@unit.test?key=x' }), /must not embed/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_RUNS_TABLE: 'runs;delete' }), /identifier/);
  assert.throws(() => configFromEnv({ SUPABASE_URL: env().SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: env().SUPABASE_PUBLISHABLE_KEY }), /missing Supabase/);
  const legacyEnv = { ...env(), SUPABASE_PUBLISHABLE_KEY: undefined, SUPABASE_ANON_KEY: legacyAnon('anon') };
  assert.equal(configFromEnv(legacyEnv).keyType, 'legacy-anon-jwt');
  assert.throws(() => configFromEnv({ ...legacyEnv, SUPABASE_ANON_KEY: `${String.fromCharCode(101, 121, 74)}.not-json.sig` }), /anon JWT/);
  assert.throws(() => configFromEnv({ ...legacyEnv, SUPABASE_ANON_KEY: legacyAnon('authenticated') }), /anon JWT/);
  assert.throws(() => configFromEnv({ ...legacyEnv, SUPABASE_ANON_KEY: legacyAnon(['service', '_role'].join('')) }), /anon JWT/);
  assert.equal(configFromEnv(env()).keyType, 'publishable');
});
