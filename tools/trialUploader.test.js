'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildPayload, queueRun, uploadOutbox, readEligibleRuns, configFromEnv, retainReadback } = require('./trialUploader');
const { payloadHash } = require('./r3DbContract');

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
  return {
    SUPABASE_URL: 'https://unit.test',
    SUPABASE_SECRET_KEY: 'sb_secret_synthetic-key',
    SUPABASE_RUNS_TABLE: 'r3_runs',
    SUPABASE_ELIGIBILITY_VIEW: 'r3_research_eligible',
    SUPABASE_EVIDENCE_READBACK_VIEW: 'r3_evidence_readback',
    SUPABASE_RETRY_BASE_MS: '0',
  };
}
function legacyJwt(role) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ role })}.signature`;
}
function backend() {
  const rows = new Map();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (!rows.has(row.run_id)) rows.set(row.run_id, row);
      return { ok: true, status: 201 };
    }
    const parsed = new URL(url);
    const runId = parsed.searchParams.get('run_id')?.replace(/^eq\./, '');
    return { ok: true, status: 200, json: async () => rows.has(runId) ? [rows.get(runId)] : [] };
  };
  return { rows, requests, fetchImpl };
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
  assert.equal(payload.report.local_file, undefined);
  assert.equal(payload.source_version, undefined);
  assert.equal(payload.payload_sha256, payloadHash(payload));
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
  const server = backend();
  const config = configFromEnv(env());
  const first = await uploadOutbox(queued.file, { config, fetchImpl: server.fetchImpl });
  const second = await uploadOutbox(queued.file, { config, fetchImpl: server.fetchImpl });
  assert.equal(first.verified, true);
  assert.equal(second.verified, true);
  assert.equal(server.rows.size, 1);
  assert.deepEqual(server.requests.map((request) => request.options.method), ['POST', 'GET', 'POST', 'GET']);
  assert.equal(server.requests[0].options.headers.prefer, 'resolution=ignore-duplicates,return=minimal');
  assert.equal(server.requests[0].url.startsWith('https://unit.test/rest/v1/r3_runs?'), true);
  assert.equal(server.requests[0].options.body.includes(config.key), false);
  assert.equal(server.requests[0].options.headers.apikey, config.key);
  assert.equal(server.requests[0].options.headers.authorization, undefined);
  assert.equal(server.requests[0].options.redirect, 'error');
  assert.match(server.requests[1].url, /\/rest\/v1\/r3_evidence_readback\?/);
  assert.match(server.requests[1].url, /run_id=eq\.sample-clean/);
});

test('network failure retains outbox and retry succeeds', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const first = configFromEnv({ ...env(), SUPABASE_MAX_ATTEMPTS: '1' });
  await assert.rejects(uploadOutbox(queued.file, { config: first, fetchImpl: async () => { throw new Error('private transport detail'); } }), (error) => {
    assert.match(error.message, /network failure attempts=1/);
    assert.equal(error.message.includes('private transport detail'), false);
    return true;
  });
  assert.equal(fs.existsSync(queued.file), true);
  const server = backend();
  const result = await uploadOutbox(queued.file, { config: configFromEnv(env()), fetchImpl: server.fetchImpl });
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
    assert.throws(() => queueRun(runDir, { outboxDir: outbox }), /prohibited credential marker/);
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
  assert.throws(() => buildPayload(runDir), /different report/);
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
  const parsed = new URL(call.url);
  assert.equal(parsed.pathname, '/rest/v1/r3_research_eligible');
  assert.equal(parsed.searchParams.get('select'), '*');
  assert.equal(call.options.method, 'GET');
});

test('legacy service-role JWT transport sends apikey and bearer only after role validation', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const token = legacyJwt('service_role');
  const legacyEnv = { ...env(), SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: token };
  const config = configFromEnv(legacyEnv);
  const server = backend();
  await uploadOutbox(queued.file, { config, fetchImpl: server.fetchImpl });
  assert.equal(server.requests[0].options.headers.authorization, 'Bearer ' + token);
  assert.equal(server.requests[0].options.headers.apikey, token);
});

test('requires HTTPS, server auth, and configured table/views', () => {
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_URL: 'http://remote.test' }), /HTTPS/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_URL: 'https://user:pass@unit.test?key=x' }), /must not embed/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_URL: 'https://unit.test/proxy' }), /project origin/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_RUNS_TABLE: 'runs;delete' }), /identifier/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_EVIDENCE_READBACK_VIEW: undefined }), /configuration/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_SECRET_KEY: undefined, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }), /public anon\/publishable/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_SECRET_KEY: 'malformed' }), /server secret key/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_SERVICE_ROLE_KEY: legacyJwt('service_role') }), /ambiguous/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: legacyJwt('anon') }), /service_role JWT/);
  const legacyEnv = { ...env(), SUPABASE_SECRET_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: legacyJwt('service_role') };
  assert.equal(configFromEnv(legacyEnv).keyType, 'legacy-service-role-jwt');
  assert.throws(() => configFromEnv({ ...legacyEnv, SUPABASE_SERVICE_ROLE_KEY: String.fromCharCode(101, 121, 74) + '.not-json.sig' }), /service_role JWT/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_TIMEOUT_MS: '0' }), /timeout configuration/);
  assert.throws(() => configFromEnv({ ...env(), SUPABASE_MAX_ATTEMPTS: '6' }), /attempts configuration/);
  assert.equal(configFromEnv(env()).keyType, 'secret');
});

test('ignored duplicate accepts only an exact stored payload hash', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const stored = JSON.parse(fs.readFileSync(queued.file, 'utf8'));
  stored.execution_outcome = 'PARTIAL';
  stored.payload_sha256 = payloadHash(stored);
  const server = backend();
  server.rows.set(stored.run_id, stored);
  await assert.rejects(uploadOutbox(queued.file, { config: configFromEnv(env()), fetchImpl: server.fetchImpl }), /outbox conflict/);
  assert.equal(server.rows.get(stored.run_id).execution_outcome, 'PARTIAL');
  assert.equal(fs.existsSync(queued.file), true);
});

test('excluded TRIAL reads back by exact ID outside the eligibility view', async (t) => {
  const { runDir, outbox } = fixture(t);
  const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
  report.experiment_kind = 'TRIAL';
  report.citable = false;
  report.aggregate_eligibility = 'EXCLUDED';
  writeReport(runDir, report);
  const queued = queueRun(runDir, { outboxDir: outbox });
  assert.equal(queued.payload.experiment_kind, 'TRIAL');
  assert.equal(queued.payload.aggregate_eligibility, 'EXCLUDED');
  assert.equal(queued.payload.report.citable, false);
  const server = backend();
  const result = await uploadOutbox(queued.file, { config: configFromEnv(env()), fetchImpl: server.fetchImpl });
  assert.equal(result.verified, true);
  const get = server.requests.find((request) => request.options.method === 'GET');
  assert.match(get.url, /r3_evidence_readback/);
  assert.equal(get.url.includes('r3_research_eligible'), false);
});

test('tampered outbox hash fails before any request and retains evidence', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const changed = JSON.parse(fs.readFileSync(queued.file, 'utf8'));
  changed.app_id = 'tampered';
  fs.writeFileSync(queued.file, JSON.stringify(changed), 'utf8');
  let requests = 0;
  await assert.rejects(uploadOutbox(queued.file, { config: configFromEnv(env()), fetchImpl: async () => { requests += 1; } }), /tampered outbox/);
  assert.equal(requests, 0);
  assert.equal(fs.existsSync(queued.file), true);
});

test('timeout retries stay bounded and preserve outbox without transport detail', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const config = configFromEnv({ ...env(), SUPABASE_TIMEOUT_MS: '10', SUPABASE_MAX_ATTEMPTS: '2' });
  let requests = 0;
  await assert.rejects(uploadOutbox(queued.file, {
    config,
    fetchImpl: async (url, options) => {
      requests += 1;
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private transport detail')), { once: true }));
    },
  }), (error) => {
    assert.match(error.message, /network failure attempts=2/);
    assert.equal(error.message.includes('private transport detail'), false);
    return true;
  });
  assert.equal(requests, 2);
  assert.equal(fs.existsSync(queued.file), true);
});

test('transient rate limit honors bounded Retry-After and retries same payload', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  const server = backend();
  let posts = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === 'POST' && posts++ === 0) {
      return { ok: false, status: 429, headers: { get: () => '0' } };
    }
    return server.fetchImpl(url, options);
  };
  const result = await uploadOutbox(queued.file, { config: configFromEnv({ ...env(), SUPABASE_MAX_ATTEMPTS: '2' }), fetchImpl });
  assert.equal(result.verified, true);
  assert.equal(posts, 2);
  assert.equal(server.rows.size, 1);
});

test('zero or multiple exact-ID rows cannot acknowledge upload', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  for (const rows of [[], [queued.payload, queued.payload]]) {
    const fetchImpl = async (url, options) => options.method === 'POST'
      ? { ok: true, status: 201 }
      : { ok: true, status: 200, json: async () => rows };
    await assert.rejects(uploadOutbox(queued.file, { config: configFromEnv(env()), fetchImpl }), /exactly one row/);
    assert.equal(fs.existsSync(queued.file), true);
  }
});

test('forbidden credential markers in object keys are rejected before outbox creation', (t) => {
  const { runDir, outbox } = fixture(t);
  const report = JSON.parse(fs.readFileSync(path.join(runDir, 'report.json'), 'utf8'));
  report[['sb', '_secret_', 'synthetic'].join('')] = 'synthetic';
  writeReport(runDir, report);
  assert.throws(() => queueRun(runDir, { outboxDir: outbox }), /prohibited credential marker/);
  assert.equal(fs.existsSync(outbox), false);
});

test('HTTP denial is not retried and response text is never surfaced', async (t) => {
  const { runDir, outbox } = fixture(t);
  const queued = queueRun(runDir, { outboxDir: outbox });
  let requests = 0;
  await assert.rejects(uploadOutbox(queued.file, {
    config: configFromEnv(env()),
    fetchImpl: async () => {
      requests += 1;
      return { ok: false, status: 403, text: async () => 'private server detail' };
    },
  }), (error) => {
    assert.match(error.message, /status=403/);
    assert.equal(error.message.includes('private server detail'), false);
    return true;
  });
  assert.equal(requests, 1);
  assert.equal(fs.existsSync(queued.file), true);
});


test('retainReadback writes one sanitized hosted row', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retain-readback-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [{ run_id: 'rr1', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64), storage_status: 'LOCAL_ONLY', eligibility: 'EXCLUDED' }];
  const out = path.join(root, 'readback.json');
  const result = retainReadback({ rows, provenance: { project: 'p', query: 'q' } }, { root, output: out, project: 'p', query: 'q', expected: { run_id: 'rr1', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64) } });
  assert.equal(result.row_count, 1);
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(parsed.run_id, 'rr1');
  assert.equal(parsed.provenance.project, 'p');
});
test('retainReadback refuses overwrite and path escape', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retain-readback-2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [{ run_id: 'rr1', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64) }];
  const out = path.join(root, 'readback.json');
  fs.writeFileSync(out, '{}');
  assert.throws(() => retainReadback({ rows }, { root, output: 'readback.json' }), /refuses overwrite/);
  assert.throws(() => retainReadback({ rows }, { root, output: '../escape.json' }), /must stay inside/);
});

test('retainReadback validates expected hashes and fetched provenance', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retain-readback-3-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [{ run_id: 'rr1', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64), project: 'hosted' }];
  assert.throws(() => retainReadback({ rows, provenance: { project: 'hosted' } }, { root, output: 'r.json', expected: { run_id: 'other', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64) } }), /run_id mismatch/);
  assert.throws(() => retainReadback({ rows, provenance: { project: 'hosted' } }, { root, output: 'r2.json', project: 'caller-only', expected: { run_id: 'rr1', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64) } }), /project label mismatch/);
});

function readbackFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readback-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const row = { run_id: 'publication', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), payload_sha256: 'c'.repeat(64) };
  return { root, output: path.join(root, 'readback.json'), row, options: { root, output: 'readback.json', expected: row } };
}

test('REGRESSION competing publication survives EEXIST unchanged', (t) => {
  const f = readbackFixture(t);
  const original = fs.linkSync;
  t.after(() => { fs.linkSync = original; });
  fs.linkSync = (source, destination) => {
    fs.writeFileSync(destination, '{"owner":"competing-writer"}', { flag: 'wx' });
    return original(source, destination);
  };
  assert.throws(() => retainReadback([f.row], f.options), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(f.output, 'utf8'), '{"owner":"competing-writer"}');
  assert.deepEqual(fs.readdirSync(f.root), ['readback.json']);
});

test('REGRESSION final path is absent until complete JSON publication', (t) => {
  const f = readbackFixture(t);
  const original = fs.linkSync;
  let observed = false;
  t.after(() => { fs.linkSync = original; });
  fs.linkSync = (source, destination) => {
    assert.equal(fs.existsSync(destination), false);
    assert.equal(JSON.parse(fs.readFileSync(source, 'utf8')).run_id, f.row.run_id);
    original(source, destination);
    assert.equal(JSON.parse(fs.readFileSync(destination, 'utf8')).run_id, f.row.run_id);
    observed = true;
  };
  retainReadback([f.row], f.options);
  assert.equal(observed, true);
  assert.deepEqual(fs.readdirSync(f.root), ['readback.json']);
});

test('NEG partial staging write is cleaned without publishing partial final JSON', (t) => {
  const f = readbackFixture(t);
  const original = fs.writeFileSync;
  t.after(() => { fs.writeFileSync = original; });
  fs.writeFileSync = (file, data, options) => {
    original(file, String(data).slice(0, 8), options);
    throw Object.assign(new Error('injected short write'), { code: 'EIO' });
  };
  assert.throws(() => retainReadback([f.row], f.options), { code: 'EIO' });
  assert.equal(fs.existsSync(f.output), false);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('NEG unsupported atomic publication fails closed and cleans only staging', (t) => {
  const f = readbackFixture(t);
  const original = fs.linkSync;
  t.after(() => { fs.linkSync = original; });
  fs.linkSync = () => { throw Object.assign(new Error('injected unsupported link'), { code: 'EPERM' }); };
  assert.throws(() => retainReadback([f.row], f.options), { code: 'EPERM' });
  assert.equal(fs.existsSync(f.output), false);
  assert.deepEqual(fs.readdirSync(f.root), []);
});
