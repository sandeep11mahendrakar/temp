'use strict';

// Local-first trial-run outbox and insert-only Supabase REST transport.
// Credentials are read only from SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
// (legacy fallback: SUPABASE_ANON_KEY).
// Usage: node tools/trialUploader.js queue <run-dir>
//        node tools/trialUploader.js upload <outbox-json>
//        node tools/trialUploader.js eligible
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validate } = require('./researchSchema');

const SCHEMA_VERSION = '1.0';
const SECRET_MARKER = new RegExp(['service', '_role|', 'sb', '_secret_|', String.fromCharCode(101, 121, 74)].join(''), 'i');
const SENSITIVE_KEY = /(?:secret|api[_-]?key|authorization|password|cookie|service[_-]?role)/i;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function assertNoSecretMarkers(value) {
  if (typeof value === 'string') {
    if (SECRET_MARKER.test(value)) throw new Error('payload rejected: prohibited secret marker');
  } else if (Array.isArray(value)) {
    for (const item of value) assertNoSecretMarkers(item);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) assertNoSecretMarkers(item);
  }
}
function sanitize(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([name]) => !SENSITIVE_KEY.test(name))
      .map(([name, item]) => [name, sanitize(item, name)]));
  }
  if (typeof value === 'string' && /(?:path|file)$/i.test(key)) {
    if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) return path.basename(value);
  }
  return value;
}
function buildPayload(runDir) {
  const dir = path.resolve(runDir);
  const checked = validate(dir);
  if (!checked.ok) throw new Error(`run rejected by schema: ${checked.errors.join('; ')}`);
  const manifestPath = path.join(dir, 'manifest.json');
  const reportPath = path.join(dir, 'report.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.run.id !== manifest.run_id) throw new Error('run rejected: manifest/report run_id mismatch');
  assertNoSecretMarkers([manifest, report]);
  const supersedes = report.supersedes_report ?? manifest.supersedes_report ?? null;
  if (supersedes !== null && (typeof supersedes !== 'string' || !supersedes.trim())) throw new Error('run rejected: supersedes_report must be non-empty text or null');
  if (supersedes === manifest.run_id) throw new Error('run rejected: rerun must use a new run_id');
  const rawEligibility = report.aggregate_eligibility ?? report.eligibility?.aggregate;
  const payload = {
    schema_version: SCHEMA_VERSION,
    run_id: manifest.run_id,
    supersedes_report: supersedes,
    aggregate_eligibility: typeof rawEligibility === 'string' ? rawEligibility : 'PENDING_VALIDATION',
    manifest_sha256: sha256(manifestPath),
    report_sha256: sha256(reportPath),
    manifest: sanitize(manifest),
    report: sanitize(report),
  };
  assertNoSecretMarkers(payload);
  return payload;
}
function queueRun(runDir, options = {}) {
  const payload = buildPayload(runDir);
  const outboxDir = path.resolve(options.outboxDir || path.join(path.dirname(path.resolve(runDir)), 'outbox'));
  fs.mkdirSync(outboxDir, { recursive: true });
  const file = path.join(outboxDir, `${payload.run_id}.json`);
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    fs.writeFileSync(file, body, { encoding: 'utf8', flag: 'wx' });
    return { queued: true, file, payload };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = fs.readFileSync(file, 'utf8');
    if (existing !== body) throw new Error('outbox conflict: run_id already has a different payload');
    return { queued: false, file, payload };
  }
}
function configFromEnv(env = process.env) {
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  const legacyAnonKey = env.SUPABASE_ANON_KEY;
  const key = publishableKey || legacyAnonKey;
  const table = env.SUPABASE_RUNS_TABLE;
  const view = env.SUPABASE_ELIGIBILITY_VIEW;
  if (!url || !key || !table || !view) throw new Error('missing Supabase URL, publishable/anon key, runs table, or eligibility view configuration');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('invalid Supabase URL'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Supabase URL must not embed credentials or query data');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) throw new Error('Supabase URL must use HTTPS');
  let keyType;
  if (publishableKey) {
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error('configured key is not a publishable key');
    keyType = 'publishable';
  } else {
    if (!key.startsWith(String.fromCharCode(101, 121, 74))) throw new Error('configured legacy key is not an anon JWT');
    try {
      const parts = key.split('.');
      if (parts.length !== 3 || !parts[1]) throw new Error('configured legacy key is not an anon JWT');
      const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (claims.role !== 'anon') throw new Error('configured legacy key is not an anon JWT');
      keyType = 'legacy-anon-jwt';
    } catch (error) {
      if (error.message === 'configured legacy key is not an anon JWT') throw error;
      throw new Error('configured legacy key is not an anon JWT');
    }
  }
  if (!SAFE_IDENTIFIER.test(table) || !SAFE_IDENTIFIER.test(view)) throw new Error('invalid Supabase table/view identifier');
  return { baseUrl: parsed.toString().replace(/\/$/, ''), key, keyType, table, view };
}
function headers(config, extra = {}) {
  const result = { apikey: config.key, ...extra };
  if (config.keyType === 'legacy-anon-jwt') result.authorization = `Bearer ${config.key}`;
  return result;
}
async function uploadOutbox(file, options = {}) {
  const config = options.config || configFromEnv(options.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema_version !== SCHEMA_VERSION ||
    typeof payload.run_id !== 'string' || payload.manifest?.run_id !== payload.run_id || !payload.report || typeof payload.report !== 'object' ||
    !/^[a-f0-9]{64}$/.test(payload.manifest_sha256) || !/^[a-f0-9]{64}$/.test(payload.report_sha256)) {
    throw new Error('invalid outbox payload; outbox retained for repair');
  }
  assertNoSecretMarkers(payload);
  if (!SAFE_IDENTIFIER.test(config.table)) throw new Error('outbox/config schema mismatch');
  const endpoint = `${config.baseUrl}/rest/v1/${config.table}?on_conflict=run_id`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: headers(config, { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('upload network failure; outbox retained for retry');
  }
  if (!response || !response.ok) throw new Error(`upload HTTP failure status=${response?.status ?? 'unknown'}; outbox retained for retry`);
  return { uploaded: true, run_id: payload.run_id, outbox: path.resolve(file) };
}
async function readEligibleRuns(options = {}) {
  const config = options.config || configFromEnv(options.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const response = await fetchImpl(`${config.baseUrl}/rest/v1/${config.view}?select=*`, { method: 'GET', headers: headers(config) });
  if (!response || !response.ok) throw new Error(`eligibility view HTTP failure status=${response?.status ?? 'unknown'}`);
  return response.json();
}

module.exports = { SCHEMA_VERSION, buildPayload, queueRun, configFromEnv, uploadOutbox, readEligibleRuns };

if (require.main === module) {
  (async () => {
    const [, , mode, arg] = process.argv;
    if (mode === 'queue' && arg) {
      const result = queueRun(path.resolve(arg));
      console.log(`OUTBOX ${result.queued ? 'QUEUED' : 'EXISTS'} run_id=${result.payload.run_id}`);
    } else if (mode === 'upload' && arg) {
      const result = await uploadOutbox(path.resolve(arg));
      console.log(`UPLOAD PASS run_id=${result.run_id}; outbox retained`);
    } else if (mode === 'eligible' && !arg) {
      const rows = await readEligibleRuns();
      console.log(`ELIGIBLE VIEW PASS rows=${Array.isArray(rows) ? rows.length : 'invalid-response'}`);
      if (!Array.isArray(rows)) process.exitCode = 1;
    } else {
      throw new Error('usage: trialUploader.js queue <run-dir> | upload <outbox-json> | eligible');
    }
  })().catch((error) => {
    console.error(`TRIAL-UPLOADER-REFUSED ${error.message}`);
    process.exitCode = 1;
  });
}
