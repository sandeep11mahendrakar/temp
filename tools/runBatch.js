'use strict';

// Offline-first serial batch coordinator. Execution must be injected by caller.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { archiveRun } = require('./runArchive');

const VERSION = 1;
const TERMINAL = new Set(['done', 'blocked']);
const CHECKPOINT_STATUSES = new Set(['running', 'done', 'blocked', 'crashed']);
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex'); }
function writeCheckpoint(file, value) {
  const temp = `${file}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { fs.renameSync(temp, file); return; }
      catch (error) {
        lastError = error;
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 4) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
      }
    }
    throw lastError;
  } catch (error) { try { fs.unlinkSync(temp); } catch (_) {} throw error; }
}
function readCheckpoint(file, order, planHash) {
  if (!fs.existsSync(file)) return { version: VERSION, order, plan_hash: planHash, source_revision: 'NOT_RECORDED', sites: {} };
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('checkpoint is invalid JSON'); }
  if (!data || data.version !== VERSION || data.plan_hash !== planHash || JSON.stringify(data.order) !== JSON.stringify(order) || !data.sites || typeof data.sites !== 'object' || Array.isArray(data.sites)) {
    throw new Error('checkpoint does not match the ordered plan');
  }
  for (const [siteId, record] of Object.entries(data.sites)) {
    if (!order.includes(siteId) || !record || typeof record !== 'object' || record.site_id !== siteId || typeof record.run_id !== 'string') {
      throw new Error(`checkpoint site record is invalid: ${siteId}`);
    }
    if (record.attempts === undefined) record.attempts = 0;
    if (!Number.isInteger(record.attempts) || record.attempts < 0) throw new Error(`checkpoint attempts are invalid: ${siteId}`);
    const legacy = { COMPLETE: 'done', BLOCKED: 'blocked', FAILED: 'crashed', TIMED_OUT: 'crashed', ERROR: 'crashed', ARCHIVE_FAILED: 'crashed', RUNNING: 'running' };
    if (legacy[record.status]) record.status = legacy[record.status];
    if (!CHECKPOINT_STATUSES.has(record.status)) throw new Error(`checkpoint site status is invalid: ${siteId}`);
    if (record.status === 'crashed' && record.archive_input && !record.phase) record.phase = 'archive';
  }
  return data;
}
function currentHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'NOT_RECORDED'; }
  catch { return 'NOT_RECORDED'; }
}
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return null;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM' ? true : error.code === 'ESRCH' ? false : null; }
}
function acquireLock(file) {
  const token = crypto.randomBytes(16).toString('hex');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, started_at: new Date().toISOString() }));
      return { fd, token };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing;
      try { existing = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('another batch driver holds an unreadable checkpoint lock'); }
      const alive = pidAlive(existing.pid);
      if (alive !== false) throw new Error('another batch driver holds the checkpoint lock');
      const quarantine = `${file}.stale-${existing.pid}-${crypto.randomBytes(4).toString('hex')}`;
      try { fs.renameSync(file, quarantine); } catch (moveError) { if (moveError.code === 'ENOENT') continue; throw moveError; }
    }
  }
  throw new Error('could not acquire checkpoint lock after stale-lock recovery');
}
function releaseLock(file, lock) {
  try { fs.closeSync(lock.fd); } finally {
    try {
      const current = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (current.token === lock.token) fs.unlinkSync(file);
    } catch (_) {}
  }
}
function withTimeout(promise, timeoutMs, siteId, controller) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error(`executor timed out for ${siteId}`), { code: 'ETIMEDOUT' })); }, timeoutMs); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
function validateSites(sites) {
  if (!Array.isArray(sites) || sites.length === 0) throw new Error('sites must be a non-empty array');
  const ids = new Set();
  for (const site of sites) {
    if (!site || typeof site !== 'object' || typeof site.id !== 'string' || !RUN_ID.test(site.id) || site.id === '.' || site.id === '..') throw new Error('each site requires a safe id');
    if (ids.has(site.id)) throw new Error(`duplicate site id: ${site.id}`);
    ids.add(site.id);
    const runId = site.run_id || site.id;
    if (!RUN_ID.test(runId) || runId === '.' || runId === '..') throw new Error(`invalid archive run_id for ${site.id}`);
  }
}
function save(file, state) { writeCheckpoint(file, state); }
function archivePending(record, archive, archiveOptions) {
  if (!record.archive_input || typeof record.archive_input !== 'object') throw new Error('executor result requires archive_input');
  if (record.archive_input.run_id !== record.run_id) throw new Error('archive_input.run_id must match site run_id');
  const result = archive(record.archive_input, archiveOptions);
  record.archive = result && (result.archive || result.path || result.run_id) || 'ARCHIVED';
  record.archive_path = result && (result.archive || result.path) || 'NOT_RECORDED';
  delete record.archive_input;
}

async function runBatch(options = {}) {
  const sites = options.sites;
  validateSites(sites);
  if (typeof options.execute !== 'function') throw new Error('an explicit executor is required; no live executor is provided');
  const checkpointFile = path.resolve(options.checkpointFile || 'runBatch.checkpoint.json');
  const timeoutMs = options.timeoutMs === undefined ? 300000 : options.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeoutMs must be a positive integer');
  const maxSites = options.maxSites === undefined ? sites.length : options.maxSites;
  if (!Number.isInteger(maxSites) || maxSites < 1) throw new Error('maxSites must be a positive integer');
  const ordered = sites.slice(0, maxSites);
  const order = ordered.map((site) => site.id);
  const planHash = hash(ordered.map((site) => ({ id: site.id, run_id: site.run_id || site.id })));
  const lockFile = `${checkpointFile}.lock`;
  const lock = acquireLock(lockFile);
  let deferLockRelease = false;
  let lockReleased = false;
  const releaseOwnedLock = () => { if (!lockReleased) { lockReleased = true; releaseLock(lockFile, lock); } };
  const archive = options.archive || archiveRun;
  if (typeof archive !== 'function') { releaseOwnedLock(); throw new Error('archive must be a function'); }
  try {
    const state = readCheckpoint(checkpointFile, order, planHash);
    const sourceRevision = options.sourceRevision || currentHead();
    if (state.source_revision === undefined) state.source_revision = 'NOT_RECORDED';
    if (sourceRevision !== 'NOT_RECORDED' && state.source_revision !== 'NOT_RECORDED' && state.source_revision !== sourceRevision) throw new Error('checkpoint source revision mismatch');
    if (sourceRevision !== 'NOT_RECORDED') state.source_revision = sourceRevision;
    state.started_at ||= new Date().toISOString();
    for (const record of Object.values(state.sites)) {
      if (record.status === 'running') {
        record.status = 'crashed'; record.error_code = 'EINTERRUPTED'; record.error = 'previous driver ended while site was running';
        record.updated_at = new Date().toISOString();
      }
    }
    save(checkpointFile, state);
    const summary = { processed: 0, skipped: 0, completed: 0, blocked: 0, failed: 0, stopped: false };
    for (const site of ordered) {
      const runId = site.run_id || site.id;
      let record = state.sites[site.id];
      if (record && TERMINAL.has(record.status)) { summary.skipped += 1; continue; }
      if (record && record.status === 'crashed' && options.resume !== true && options.retryInterrupted !== true) { summary.stopped = true; break; }
      if (record && record.phase === 'archive' && record.archive_input) {
        try {
          archivePending(record, archive, options.archiveOptions);
          record.phase = 'complete'; record.status = record.result_status === 'BLOCKED' ? 'blocked' : 'done'; record.updated_at = new Date().toISOString(); save(checkpointFile, state);
          if (record.status === 'done') summary.completed += 1; else summary.blocked += 1;
        }
        catch (error) { record.status = 'crashed'; record.archive_error = String(error.message || error); record.updated_at = new Date().toISOString(); save(checkpointFile, state); summary.stopped = true; throw new Error(`archive failed for ${site.id}; execution will not be repeated: ${record.archive_error}`); }
        continue;
      }
      record = { site_id: site.id, run_id: runId, status: 'running', attempts: (record?.attempts || 0) + 1, started_at: new Date().toISOString(), head: sourceRevision };
      state.sites[site.id] = record;
      save(checkpointFile, state);
      summary.processed += 1;
      let result;
      const controller = new AbortController();
      const execution = Promise.resolve().then(() => options.execute(site, { attempt: record.attempts, checkpointFile, signal: controller.signal }));
      let executionSettled = false;
      let timedOut = false;
      execution.then(() => { executionSettled = true; if (timedOut) releaseOwnedLock(); }, () => { executionSettled = true; if (timedOut) releaseOwnedLock(); });
      try { result = await withTimeout(execution, timeoutMs, site.id, controller); }
      catch (error) {
        record.status = 'crashed';
        record.error_code = error.code || 'EEXECUTOR';
        record.error = String(error.message || error).slice(0, 300);
        record.updated_at = new Date().toISOString();
        save(checkpointFile, state);
        if (error.code === 'ETIMEDOUT') { timedOut = true; deferLockRelease = !executionSettled; if (executionSettled) releaseOwnedLock(); }
        summary.stopped = true;
        break;
      }
      const resultStatus = result && result.status;
      if (!['COMPLETE', 'BLOCKED', 'FAILED'].includes(resultStatus)) {
        record.status = 'crashed'; record.error = 'executor status must be COMPLETE, BLOCKED, or FAILED';
        record.updated_at = new Date().toISOString(); save(checkpointFile, state); summary.stopped = true; break;
      }
      if (resultStatus === 'FAILED') {
        record.status = 'crashed'; record.result_status = 'FAILED'; record.phase = 'execute'; record.error = 'executor returned FAILED';
        record.updated_at = new Date().toISOString(); save(checkpointFile, state); summary.failed += 1; summary.stopped = true; break;
      }
      record.result_status = resultStatus;
      record.archive_input = result.archive_input;
      record.phase = 'archive';
      record.updated_at = new Date().toISOString();
      save(checkpointFile, state);
      try { archivePending(record, archive, options.archiveOptions); }
      catch (error) {
        record.status = 'crashed'; record.archive_error = String(error.message || error).slice(0, 300);
        save(checkpointFile, state); summary.stopped = true;
        throw new Error(`archive failed for ${site.id}; batch stopped: ${record.archive_error}`);
      }
      record.updated_at = new Date().toISOString();
      record.phase = 'complete';
      record.status = resultStatus === 'COMPLETE' ? 'done' : resultStatus === 'BLOCKED' ? 'blocked' : 'crashed';
      save(checkpointFile, state);
      if (resultStatus === 'COMPLETE') summary.completed += 1;
      else if (resultStatus === 'BLOCKED') summary.blocked += 1;
      else { summary.failed += 1; summary.stopped = true; break; }
    }
    return { ...summary, checkpoint: checkpointFile, order };
  } finally {
    if (!deferLockRelease) releaseOwnedLock();
  }
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--resume') { out.resume = true; continue; }
    if (!['--plan', '--executor', '--checkpoint', '--source-revision', '--archive-root'].includes(arg)) throw new Error(`unknown argument: ${arg}`);
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`missing value for ${arg}`);
    out[arg.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = argv[++index];
  }
  if (!out.plan || !out.executor || !out.checkpoint) throw new Error('usage: node tools/runBatch.js --plan PLAN.json --executor EXECUTOR.js --checkpoint FILE [--resume] [--source-revision HEAD] [--archive-root DIR]');
  return out;
}
async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const planFile = path.resolve(args.plan);
  const executorFile = path.resolve(args.executor);
  const checkpointFile = path.resolve(args.checkpoint);
  if (!fs.existsSync(planFile)) throw new Error(`plan not found: ${planFile}`);
  if (!fs.existsSync(executorFile)) throw new Error(`executor not found: ${executorFile}`);
  if (fs.existsSync(checkpointFile) && !args.resume) throw new Error('checkpoint exists; pass --resume to continue');
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  if (!plan || !Array.isArray(plan.sites)) throw new Error('plan must contain a sites array');
  const loaded = require(executorFile);
  const execute = typeof loaded === 'function' ? loaded : loaded.execute;
  const result = await runBatch({ sites: plan.sites, checkpointFile, resume: args.resume, sourceRevision: args.sourceRevision, archiveOptions: args.archiveRoot ? { root: path.resolve(args.archiveRoot) } : undefined, execute });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.stopped) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { process.stderr.write(`runBatch: ${String(error.message || error)}\n`); process.exitCode = 1; });

module.exports = { runBatch, main, VERSION };
