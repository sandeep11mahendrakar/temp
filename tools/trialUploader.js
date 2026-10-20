'use strict';

// Local-first, insert-only R3 transport. Credentials are read only from server
// environment variables; the sanitized immutable export is created by DB-4.
// Usage: node tools/trialUploader.js queue <run-dir>
//        node tools/trialUploader.js upload <outbox-json>
//        node tools/trialUploader.js eligible
const fs = require('node:fs');
const path = require('node:path');
const { buildExport, canonical, failIfMarker } = require('./r3DbExport');
const { validateEnvelope, payloadHash } = require('./r3DbContract');
const { scanSecrets } = require('./trialVerifier');

const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const JWT_PREFIX = String.fromCharCode(101, 121, 74);
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_TIMEOUT_MS = 30000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 100;
const MAX_RETRY_DELAY_MS = 2000;

function parseBoundedInteger(value, fallback, min, max, name) {
  if (value === undefined || value === '') return fallback;
  if (!/^[0-9]+$/.test(String(value))) throw new Error('invalid ' + name + ' configuration');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error('invalid ' + name + ' configuration');
  return number;
}

function parseJwtRole(key, role) {
  if (typeof key !== 'string' || !key.startsWith(JWT_PREFIX)) return false;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return !!header && typeof header === 'object' && claims && claims.role === role;
  } catch {
    return false;
  }
}

function configFromEnv(env = process.env) {
  const url = env.SUPABASE_URL;
  const table = env.SUPABASE_RUNS_TABLE;
  const eligibilityView = env.SUPABASE_ELIGIBILITY_VIEW;
  const evidenceReadbackView = env.SUPABASE_EVIDENCE_READBACK_VIEW;
  const credentials = [
    ['secret', env.SUPABASE_SECRET_KEY],
    ['legacy-service-role-jwt', env.SUPABASE_SERVICE_ROLE_KEY],
    ['publishable', env.SUPABASE_PUBLISHABLE_KEY],
    ['legacy-anon-jwt', env.SUPABASE_ANON_KEY],
  ].filter((entry) => typeof entry[1] === 'string' && entry[1].length > 0);
  if (!url || !table || !eligibilityView || !evidenceReadbackView || credentials.length === 0) {
    throw new Error('missing Supabase server configuration');
  }
  if (credentials.some((entry) => entry[0] === 'publishable' || entry[0] === 'legacy-anon-jwt')) {
    throw new Error('public anon/publishable credentials cannot access the companion table');
  }
  if (credentials.length !== 1) throw new Error('ambiguous Supabase server configuration');

  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('invalid Supabase URL'); }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Supabase URL must not embed credentials or query data');
  if (parsed.pathname !== '/') throw new Error('Supabase URL must be a project origin');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) throw new Error('Supabase URL must use HTTPS');
  if (![table, eligibilityView, evidenceReadbackView].every((value) => typeof value === 'string' && SAFE_IDENTIFIER.test(value))) {
    throw new Error('invalid Supabase table/view identifier');
  }

  const [credentialType, key] = credentials[0];
  let keyType = credentialType;
  if (credentialType === 'secret') {
    if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) throw new Error('configured key is not a server secret key');
  } else if (credentialType === 'legacy-service-role-jwt') {
    if (!parseJwtRole(key, 'service_role')) throw new Error('configured legacy key is not a service_role JWT');
  } else {
    throw new Error('public anon/publishable credentials cannot access the companion table');
  }

  return {
    baseUrl: parsed.toString().replace(/\/$/, ''),
    key,
    keyType,
    table,
    eligibilityView,
    evidenceReadbackView,
    timeoutMs: parseBoundedInteger(env.SUPABASE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1, MAX_TIMEOUT_MS, 'timeout'),
    maxAttempts: parseBoundedInteger(env.SUPABASE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1, MAX_ATTEMPTS, 'attempts'),
    retryBaseMs: parseBoundedInteger(env.SUPABASE_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS, 0, MAX_RETRY_DELAY_MS, 'retry delay'),
    maxRetryAfterMs: MAX_RETRY_DELAY_MS,
  };
}

function headers(config, extra = {}) {
  const result = { apikey: config.key, ...extra };
  if (config.keyType === 'legacy-service-role-jwt') result.authorization = 'Bearer ' + config.key;
  return result;
}

function endpoint(config, resource, query = {}) {
  const url = new URL('/rest/v1/' + resource, config.baseUrl);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  return url.toString();
}

function transientStatus(status) {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

function retryAfter(response, maximum) {
  const value = response && response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('retry-after') : null;
  if (value === null || value === undefined || value === '') return null;
  let milliseconds;
  if (/^[0-9]+$/.test(value.trim())) milliseconds = Number(value.trim()) * 1000;
  else {
    const date = Date.parse(value);
    if (!Number.isFinite(date)) return null;
    milliseconds = Math.max(0, date - Date.now());
  }
  return Math.min(maximum, milliseconds);
}

function delay(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestOnce(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error('request timeout');
      error.transient = true;
      reject(error);
    }, timeoutMs);
  });
  let response;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal })),
      timeout,
    ]);
  } catch (error) {
    if (error && error.transient) throw error;
    const network = new Error('network request failed');
    network.transient = true;
    throw network;
  } finally {
    clearTimeout(timer);
  }
  if (!response || !Number.isInteger(response.status) || typeof response.ok !== 'boolean') {
    throw new Error('invalid HTTP response');
  }
  return response;
}

async function requestWithRetry(fetchImpl, url, init, config) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      const response = await requestOnce(fetchImpl, url, init, config.timeoutMs);
      lastStatus = response.status;
      if (!transientStatus(response.status)) return { response, attempts: attempt };
      if (attempt === config.maxAttempts) {
        throw new Error('transient HTTP failure status=' + response.status + ' attempts=' + attempt);
      }
      const serverDelay = retryAfter(response, config.maxRetryAfterMs);
      const backoff = Math.min(config.maxRetryAfterMs, config.retryBaseMs * (2 ** (attempt - 1)));
      await delay(serverDelay === null ? backoff : serverDelay);
    } catch (error) {
      if (error && !error.transient) throw error;
      if (attempt === config.maxAttempts) throw new Error('network failure attempts=' + attempt);
      const backoff = Math.min(config.maxRetryAfterMs, config.retryBaseMs * (2 ** (attempt - 1)));
      await delay(backoff);
    }
  }
  throw new Error('request failed' + (lastStatus === null ? '' : ' status=' + lastStatus));
}

function buildPayload(runDir) {
  const envelope = { ...buildExport(runDir).envelope };
  // DB-4 includes source_version as export metadata, but it is not a DB-2
  // column. Hash the exact accepted table row after removing that metadata.
  delete envelope.source_version;
  envelope.payload_sha256 = payloadHash(envelope);
  const errors = validateEnvelope(envelope);
  if (errors.length) throw new Error('invalid database row: ' + errors.join('; '));
  return envelope;
}

function queueRun(runDir, options = {}) {
  const outboxDir = path.resolve(options.outboxDir || path.join(path.dirname(path.resolve(runDir)), 'outbox'));
  const payload = buildPayload(runDir);
  const file = path.join(outboxDir, payload.run_id + '.json');
  const bytes = canonical(payload);
  fs.mkdirSync(outboxDir, { recursive: true });
  try {
    fs.writeFileSync(file, bytes, { encoding: 'utf8', flag: 'wx' });
    return { queued: true, file, path: file, payload };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (fs.readFileSync(file, 'utf8') !== bytes) throw new Error('outbox conflict: run_id has a different payload');
    return { queued: false, file, path: file, payload };
  }
}

function readOutbox(file) {
  const resolved = path.resolve(file);
  const bytes = fs.readFileSync(resolved, 'utf8');
  let payload;
  try { payload = JSON.parse(bytes); } catch { throw new Error('invalid outbox JSON; outbox retained'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid outbox payload; outbox retained');
  const errors = validateEnvelope(payload);
  if (errors.length || payload.payload_sha256 !== payloadHash(payload)) {
    throw new Error('invalid or tampered outbox payload; outbox retained');
  }
  try { failIfMarker(payload); } catch { throw new Error('prohibited credential marker in outbox; outbox retained'); }
  if (payload.experiment_kind === 'TRIAL' &&
    (payload.report?.citable !== false || payload.aggregate_eligibility !== 'EXCLUDED')) {
    throw new Error('trial eligibility must remain excluded; outbox retained');
  }
  return { resolved, bytes, payload };
}

function verifyReadback(row, local) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('readback row invalid');
  const errors = validateEnvelope(row);
  if (errors.length || row.run_id !== local.run_id || row.manifest_sha256 !== local.manifest_sha256 ||
    row.report_sha256 !== local.report_sha256 || row.payload_sha256 !== local.payload_sha256 ||
    row.manifest?.run_id !== local.run_id || row.report?.run?.id !== local.run_id ||
    payloadHash(row) !== row.payload_sha256 || payloadHash(row) !== local.payload_sha256) {
    throw new Error('outbox conflict: stored row differs for run_id');
  }
}

async function uploadOutbox(file, options = {}) {
  const config = options.config || configFromEnv(options.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const { resolved, bytes, payload } = readOutbox(file);
  const insertUrl = endpoint(config, config.table, { on_conflict: 'run_id' });
  const post = await requestWithRetry(fetchImpl, insertUrl, {
    method: 'POST',
    headers: headers(config, { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: bytes,
  }, config);
  if (!post.response.ok && post.response.status !== 409) {
    throw new Error('upload HTTP failure status=' + post.response.status + ' attempts=' + post.attempts + '; outbox retained for retry');
  }

  const readUrl = endpoint(config, config.evidenceReadbackView, {
    select: '*',
    run_id: 'eq.' + payload.run_id,
  });
  const read = await requestWithRetry(fetchImpl, readUrl, {
    method: 'GET',
    headers: headers(config, { accept: 'application/json' }),
  }, config);
  if (!read.response.ok) {
    throw new Error('readback HTTP failure status=' + read.response.status + ' attempts=' + read.attempts + '; outbox retained');
  }
  let rows;
  try { rows = await read.response.json(); } catch { throw new Error('readback response invalid; outbox retained'); }
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('readback expected exactly one row; found=' + (Array.isArray(rows) ? rows.length : 'invalid') + '; outbox retained');
  }
  verifyReadback(rows[0], payload);
  return {
    uploaded: true,
    verified: true,
    run_id: payload.run_id,
    payload_sha256: payload.payload_sha256,
    outbox: resolved,
    attempts: post.attempts + read.attempts,
  };
}

async function readEligibleRuns(options = {}) {
  const config = options.config || configFromEnv(options.env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');
  const result = await requestWithRetry(fetchImpl, endpoint(config, config.eligibilityView, { select: '*' }), {
    method: 'GET',
    headers: headers(config, { accept: 'application/json' }),
  }, config);
  if (!result.response.ok) throw new Error('eligibility view HTTP failure status=' + result.response.status);
  try {
    const rows = await result.response.json();
    if (!Array.isArray(rows)) throw new Error('invalid response');
    return rows;
  } catch {
    throw new Error('eligibility view response invalid');
  }
}

const HASH_RE = /^[0-9a-f]{64}$/i;
function retainReadback(fetched, options = {}) {
  const opts = options || {};
  let rows;
  let provenance = {};
  if (Array.isArray(fetched)) {
    rows = fetched.slice();
  } else if (fetched && typeof fetched === 'object' && !Array.isArray(fetched)) {
    if (Array.isArray(fetched.rows)) rows = fetched.rows.slice();
    else if (Array.isArray(fetched.data)) rows = fetched.data.slice();
    else if (Array.isArray(fetched.body)) rows = fetched.body.slice();
    else throw new Error('retained readback requires a fetched row array');
    if (fetched.provenance && typeof fetched.provenance === 'object') provenance = fetched.provenance;
    else if (fetched.meta && typeof fetched.meta === 'object') provenance = fetched.meta;
  } else {
    throw new Error('retained readback requires a fetched response');
  }
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error('retained readback requires exactly one hosted row; found=' + (Array.isArray(rows) ? rows.length : 'invalid'));
  }
  const ids = rows.map((r) => r && (r.run_id || r.runId || r.id));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error('retained readback duplicate row proof: ' + duplicateIds.join(','));
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('retained readback row invalid');

  const secretScan = scanSecrets({ row, provenance, options: opts });
  if (secretScan.total > 0) {
    throw new Error('retained readback secret markers detected count=' + secretScan.total);
  }

  const runId = row.run_id || row.runId || row.id;
  const manifestHash = row.manifest_sha256 || row.manifestHash || row.manifest_hash;
  const reportHash = row.report_sha256 || row.reportHash || row.report_hash;
  const payloadDigest = row.payload_sha256 || row.payloadHash || row.payload_hash;
  if (!runId || !manifestHash || !reportHash || !payloadDigest) {
    throw new Error('retained readback missing required safe hash fields');
  }
  if (!HASH_RE.test(String(manifestHash)) || !HASH_RE.test(String(reportHash)) || !HASH_RE.test(String(payloadDigest))) {
    throw new Error('retained readback invalid hash format');
  }

  const retained = {
    run_id: String(runId),
    manifest_sha256: String(manifestHash).toLowerCase(),
    report_sha256: String(reportHash).toLowerCase(),
    payload_sha256: String(payloadDigest).toLowerCase(),
    storage_status: row.storage_status || row.storage || 'RETAINED',
    eligibility: row.eligibility || row.status || row.label || 'UNKNOWN',
    provenance: {
      project: opts.project || provenance.project || null,
      query: opts.query || provenance.query || null,
      fetched_at: opts.fetchedAt || provenance.fetched_at || new Date().toISOString(),
      row_count: rows.length,
    },
  };

  const root = path.resolve(opts.root || process.cwd());
  const requested = opts.output || path.join('readback.json');
  const output = path.resolve(root, requested);
  const relative = path.relative(root, output);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('retained readback output path must stay inside project root');
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const realRoot = fs.realpathSync(root);
  const realParent = fs.realpathSync(path.dirname(output));
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new Error('retained readback output parent escapes project root');
  }
  if (fs.existsSync(output) || fs.lstatSync(output, { throwIfNoEntry: false })) {
    throw new Error('retained readback refuses overwrite: ' + relative);
  }

  // authoritative expected inputs are mandatory
  const expected = opts.expected || {};
  const expectedRunId = expected.run_id || expected.runId || expected.id || opts.expectedRunId;
  const expectedManifest = expected.manifest_sha256 || expected.manifestHash || opts.expectedManifestSha256;
  const expectedReport = expected.report_sha256 || expected.reportHash || opts.expectedReportSha256;
  const expectedPayload = expected.payload_sha256 || expected.payloadHash || opts.expectedPayloadSha256;
  if (!expectedRunId || !expectedManifest || !expectedReport || !expectedPayload) {
    throw new Error('retained readback requires authoritative expected identity and hashes');
  }
  if (String(expectedRunId) !== String(runId)) throw new Error('retained readback run_id mismatch');
  if (String(expectedManifest).toLowerCase() !== String(manifestHash).toLowerCase()) throw new Error('retained readback manifest hash mismatch');
  if (String(expectedReport).toLowerCase() !== String(reportHash).toLowerCase()) throw new Error('retained readback report hash mismatch');
  if (String(expectedPayload).toLowerCase() !== String(payloadDigest).toLowerCase()) throw new Error('retained readback payload hash mismatch');

  // caller-written labels cannot establish hosted provenance; prefer fetched provenance
  const fetchedProject = provenance.project;
  const fetchedQuery = provenance.query;
  if (opts.project && fetchedProject && opts.project !== fetchedProject) throw new Error('retained readback project label mismatch');
  if (opts.query && fetchedQuery && opts.query !== fetchedQuery) throw new Error('retained readback query label mismatch');
  retained.provenance.project = fetchedProject || null;
  retained.provenance.query = fetchedQuery || null;

  // Publish complete bytes atomically, without replacing a concurrent writer.
  // Unsupported hard links fail closed; rename/write-to-final are unsafe fallbacks.
  const staging = fs.mkdtempSync(path.join(realParent, '.readback-stage-'));
  const stagedFile = path.join(staging, 'readback.json');
  try {
    fs.writeFileSync(stagedFile, JSON.stringify(retained, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.linkSync(stagedFile, output);
  } finally {
    // These paths belong only to this invocation. Never unlink the published path.
    try { fs.unlinkSync(stagedFile); } catch {}
    try { fs.rmdirSync(staging); } catch {}
  }
  return { path: output, retained, row_count: rows.length };
}

module.exports = { buildPayload, queueRun, configFromEnv, uploadOutbox, readEligibleRuns, retainReadback };

if (require.main === module) {
  (async () => {
    const [, , mode, arg] = process.argv;
    if (mode === 'queue' && arg) {
      const result = queueRun(path.resolve(arg));
      console.log('OUTBOX ' + (result.queued ? 'QUEUED' : 'EXISTS') + ' run_id=' + result.payload.run_id);
    } else if (mode === 'upload' && arg) {
      const result = await uploadOutbox(path.resolve(arg));
      console.log('UPLOAD VERIFIED run_id=' + result.run_id + ' attempts=' + result.attempts + '; outbox retained');
    } else if (mode === 'eligible' && !arg) {
      const rows = await readEligibleRuns();
      console.log('ELIGIBLE VIEW PASS rows=' + rows.length);
    } else {
      throw new Error('usage: node tools/trialUploader.js queue <run-dir> | upload <outbox-json> | eligible');
    }
  })().catch((error) => {
    const message = String(error && error.message || '');
    const code = message.includes('HTTP failure') ? 'HTTP_FAILURE'
      : message.includes('conflict') ? 'CONFLICT'
        : message.includes('outbox') || message.includes('payload') ? 'OUTBOX_REFUSED'
          : message.includes('configuration') || message.includes('credential') ? 'CONFIG_REFUSED'
            : 'TRANSPORT_REFUSED';
    const status = message.match(/status=([0-9]{3})/);
    const attempts = message.match(/attempts=([0-9]+)/);
    console.error('TRIAL-UPLOADER-REFUSED code=' + code +
      (status ? ' status=' + status[1] : '') +
      (attempts ? ' attempts=' + attempts[1] : ''));
    process.exitCode = 1;
  });
}
