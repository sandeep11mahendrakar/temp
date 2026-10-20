'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const { runBatch } = require('./runBatch');
const DRIVER = path.join(__dirname, 'runBatch.js');

function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-batch-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
function archiveInput(id) { return { run_id: id, site: id, artifacts: [] }; }

test('runs in declared serial order, archives complete and blocked, and preserves the cap', async (t) => {
  const root = temp(t); const order = []; const archived = [];
  const result = await runBatch({
    sites: [{ id: 'site-a' }, { id: 'site-b' }, { id: 'site-c' }], maxSites: 2,
    checkpointFile: path.join(root, 'state.json'), timeoutMs: 100,
    execute: async (site) => { order.push(site.id); return { status: site.id === 'site-a' ? 'COMPLETE' : 'BLOCKED', archive_input: archiveInput(site.id) }; },
    archive: (input) => { archived.push(input.run_id); return { archive: `runs/${input.run_id}` }; },
  });
  assert.deepEqual(order, ['site-a', 'site-b']); assert.deepEqual(archived, order);
  assert.deepEqual(result.order, ['site-a', 'site-b']); assert.equal(result.completed, 1); assert.equal(result.blocked, 1);
  assert.equal(result.processed, 2); assert.equal(result.stopped, false);
});

test('resume skips completed and blocked sites and executes only pending sites', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); const archived = [];
  const base = { sites: [{ id: 'already-done' }, { id: 'already-blocked' }, { id: 'pending' }], checkpointFile, timeoutMs: 100,
    archive: (input) => { archived.push(input.run_id); return { archive: input.run_id }; } };
  const state = { version: 1, order: ['already-done', 'already-blocked', 'pending'], plan_hash: require('node:crypto').createHash('sha256').update(JSON.stringify([{ id: 'already-done', run_id: 'already-done' }, { id: 'already-blocked', run_id: 'already-blocked' }, { id: 'pending', run_id: 'pending' }])).digest('hex'), sites: {
    'already-done': { site_id: 'already-done', run_id: 'already-done', attempts: 1, status: 'COMPLETE' },
    'already-blocked': { site_id: 'already-blocked', run_id: 'already-blocked', attempts: 1, status: 'BLOCKED' },
  } };
  fs.writeFileSync(checkpointFile, `${JSON.stringify(state)}\n`);
  const executed = [];
  const result = await runBatch({ ...base, execute: async (site) => { executed.push(site.id); return { status: 'COMPLETE', archive_input: archiveInput(site.id) }; } });
  assert.deepEqual(executed, ['pending']); assert.deepEqual(archived, ['pending']); assert.equal(result.skipped, 2);
});

test('refuses a concurrent driver and a changed plan/order', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); const lock = `${checkpointFile}.lock`;
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token: 'held' }));
  await assert.rejects(runBatch({ sites: [{ id: 'one' }], checkpointFile, execute: async () => {} }), /another batch driver/);
  fs.unlinkSync(lock);
  await runBatch({ sites: [{ id: 'one' }], checkpointFile, execute: async () => ({ status: 'COMPLETE', archive_input: archiveInput('one') }), archive: () => ({ archive: 'one' }) });
  await assert.rejects(runBatch({ sites: [{ id: 'two' }], checkpointFile, execute: async () => ({ status: 'COMPLETE', archive_input: archiveInput('two') }), archive: () => ({ archive: 'two' }) }), /checkpoint does not match/);
});

test('timeout checkpoints without archive; resume retries only with explicit opt-in', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); let archives = 0; let aborted = false;
  const timed = await runBatch({ sites: [{ id: 'slow' }], checkpointFile, timeoutMs: 5,
    execute: (_site, { signal }) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise((resolve) => setTimeout(() => resolve({ status: 'COMPLETE', archive_input: archiveInput('slow') }), 30)); }, archive: () => { archives += 1; return { archive: 'slow' }; } });
  assert.equal(timed.stopped, true); assert.equal(archives, 0);
  assert.equal(aborted, true);
  const saved = JSON.parse(fs.readFileSync(checkpointFile, 'utf8')); assert.equal(saved.sites.slow.status, 'crashed');
  await assert.rejects(runBatch({ sites: [{ id: 'slow' }], checkpointFile, timeoutMs: 100, execute: async () => {}, archive: () => ({ archive: 'slow' }) }), /another batch driver/);
  await new Promise((resolve) => setTimeout(resolve, 40));
  const held = await runBatch({ sites: [{ id: 'slow' }], checkpointFile, timeoutMs: 100, execute: async () => { throw new Error('must not run without opt-in'); }, archive: () => ({ archive: 'slow' }) });
  assert.equal(held.processed, 0); assert.equal(held.stopped, true);
  const resumed = await runBatch({ sites: [{ id: 'slow' }], checkpointFile, timeoutMs: 100, resume: true,
    execute: async () => ({ status: 'COMPLETE', archive_input: archiveInput('slow') }), archive: () => { archives += 1; return { archive: 'slow' }; } });
  assert.equal(resumed.completed, 1); assert.equal(archives, 1);
});

test('archive failure stops the batch and resume retries archive without re-executing', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); let executions = 0; let archiveCalls = 0;
  await assert.rejects(runBatch({ sites: [{ id: 'first' }, { id: 'second' }], checkpointFile,
    execute: async () => { executions += 1; return { status: 'COMPLETE', archive_input: archiveInput('first') }; },
    archive: () => { archiveCalls += 1; throw new Error('archive denied'); } }), /batch stopped/);
  assert.equal(executions, 1); assert.equal(archiveCalls, 1);
  const resumedSites = [];
  const resumed = await runBatch({ sites: [{ id: 'first' }, { id: 'second' }], checkpointFile, resume: true,
    execute: async (site) => { executions += 1; resumedSites.push(site.id); return { status: 'COMPLETE', archive_input: archiveInput(site.id) }; },
    archive: (input) => { archiveCalls += 1; return { archive: input.run_id }; } });
  assert.equal(executions, 2); assert.deepEqual(resumedSites, ['second']); assert.equal(archiveCalls, 3); assert.equal(resumed.completed, 2);
});

test('validates duplicate IDs and requires an explicit executor', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json');
  await assert.rejects(runBatch({ sites: [{ id: 'same' }, { id: 'same' }], checkpointFile, execute: async () => {} }), /duplicate site id/);
  await assert.rejects(runBatch({ sites: [{ id: 'one' }], checkpointFile }), /explicit executor is required/);
});

test('recovers a dead driver lock but marks an interrupted site for explicit retry', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); const lockFile = `${checkpointFile}.lock`;
  const state = { version: 1, order: ['interrupted'], plan_hash: require('node:crypto').createHash('sha256').update(JSON.stringify([{ id: 'interrupted', run_id: 'interrupted' }])).digest('hex'), source_revision: 'rev-1', sites: { interrupted: { site_id: 'interrupted', run_id: 'interrupted', status: 'RUNNING', attempts: 1 } } };
  fs.writeFileSync(checkpointFile, `${JSON.stringify(state)}\n`);
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 2147483647, token: 'stale' }));
  let executions = 0;
  const paused = await runBatch({ sites: [{ id: 'interrupted' }], checkpointFile, sourceRevision: 'rev-1', execute: async () => { executions += 1; return { status: 'COMPLETE', archive_input: archiveInput('interrupted') }; }, archive: () => ({ archive: 'interrupted' }) });
  assert.equal(executions, 0); assert.equal(paused.stopped, true);
  const saved = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(saved.sites.interrupted.status, 'crashed'); assert.equal(saved.sites.interrupted.error_code, 'EINTERRUPTED');
  const resumed = await runBatch({ sites: [{ id: 'interrupted' }], checkpointFile, sourceRevision: 'rev-1', resume: true,
    execute: async () => { executions += 1; return { status: 'COMPLETE', archive_input: archiveInput('interrupted') }; }, archive: () => ({ archive: 'interrupted' }) });
  assert.equal(executions, 1); assert.equal(resumed.completed, 1);
});

test('uses P-1 archiveRun by default and retains source revision', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json');
  await runBatch({ sites: [{ id: 'archived-run' }], checkpointFile, sourceRevision: 'abc123', archiveOptions: { root },
    execute: async () => ({ status: 'COMPLETE', archive_input: { run_id: 'archived-run', site: 'synthetic', artifacts: [] } }) });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'runs', 'archived-run', 'manifest.json'), 'utf8'));
  const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(manifest.run_id, 'archived-run'); assert.equal(checkpoint.source_revision, 'abc123');
});

function waitForFile(file, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (fs.existsSync(file)) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error(`timed out waiting for ${path.basename(file)}`));
      setTimeout(check, 10);
    };
    check();
  });
}
function launch(args) {
  const child = spawn(process.execPath, [DRIVER, ...args], { cwd: path.dirname(__dirname), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  return { child, output: () => ({ stdout, stderr }) };
}

test('CLI kill then --resume restarts the crashed site and preserves completed work', async (t) => {
  const root = temp(t); const planFile = path.join(root, 'plan.json'); const executorFile = path.join(root, 'executor.js');
  const checkpointFile = path.join(root, 'checkpoint.json'); const marker = path.join(root, 'beta-started'); const attemptsFile = path.join(root, 'beta-attempts');
  const sites = [{ id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }];
  fs.writeFileSync(planFile, JSON.stringify({ sites }));
  fs.writeFileSync(executorFile, `
    const fs = require('node:fs');
    module.exports = async (site) => {
      if (site.id === 'beta') {
        const file = ${JSON.stringify(attemptsFile)};
        const n = (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0) + 1;
        fs.writeFileSync(file, String(n));
        fs.writeFileSync(${JSON.stringify(marker)}, 'started');
        if (n === 1) await new Promise(() => {});
      }
      return { status: 'COMPLETE', archive_input: { run_id: site.id, site: site.id, head: 'test-head', artifacts: [] } };
    };
  `);
  const common = ['--plan', planFile, '--executor', executorFile, '--checkpoint', checkpointFile, '--archive-root', root, '--source-revision', 'test-head'];
  const first = launch(common);
  t.after(() => { if (first.child.exitCode === null) first.child.kill(); });
  await waitForFile(marker);
  const beforeKill = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(beforeKill.sites.alpha.status, 'done'); assert.equal(beforeKill.sites.beta.status, 'running');
  first.child.kill(); await once(first.child, 'exit');
  const interrupted = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.equal(interrupted.sites.alpha.status, 'done'); assert.equal(interrupted.sites.beta.status, 'running');

  const resumed = launch([...common, '--resume']);
  const [code] = await once(resumed.child, 'exit');
  assert.equal(code, 0, resumed.output().stderr);
  const final = JSON.parse(fs.readFileSync(checkpointFile, 'utf8'));
  assert.deepEqual(Object.values(final.sites).map((record) => record.status), ['done', 'done', 'done']);
  assert.equal(final.sites.alpha.attempts, 1); assert.equal(final.sites.beta.attempts, 2); assert.equal(final.sites.gamma.attempts, 1);
  assert.equal(final.sites.alpha.head, 'test-head'); assert.equal(final.sites.beta.archive_path, 'runs/beta');
  assert.equal(fs.readFileSync(attemptsFile, 'utf8'), '2');
  for (const id of ['alpha', 'beta', 'gamma']) assert.equal(fs.existsSync(path.join(root, 'runs', id, 'manifest.json')), true);
});

test('resume never retries blocked sites or duplicates their archives', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); let blockedCalls = 0; let doneCalls = 0; const archived = [];
  const sites = [{ id: 'blocked' }, { id: 'done' }];
  const execute = async (site) => {
    if (site.id === 'blocked') { blockedCalls += 1; return { status: 'BLOCKED', archive_input: archiveInput('blocked') }; }
    doneCalls += 1; return { status: 'COMPLETE', archive_input: archiveInput('done') };
  };
  const archive = (input) => { archived.push(input.run_id); return { archive: `runs/${input.run_id}` }; };
  await runBatch({ sites, checkpointFile, execute, archive });
  const resumed = await runBatch({ sites, checkpointFile, resume: true, execute, archive });
  assert.equal(resumed.skipped, 2); assert.equal(blockedCalls, 1); assert.equal(doneCalls, 1);
  assert.deepEqual(archived, ['blocked', 'done']);
});

test('corrupt JSON and invalid checkpoint schema fail loudly before execution', async (t) => {
  const root = temp(t); const checkpointFile = path.join(root, 'state.json'); let calls = 0;
  const options = { sites: [{ id: 'one' }], checkpointFile, resume: true, execute: async () => { calls += 1; return { status: 'COMPLETE', archive_input: archiveInput('one') }; }, archive: () => ({ archive: 'one' }) };
  fs.writeFileSync(checkpointFile, '{broken');
  await assert.rejects(runBatch(options), /checkpoint is invalid JSON/);
  const order = ['one']; const planHash = crypto.createHash('sha256').update(JSON.stringify([{ id: 'one', run_id: 'one' }])).digest('hex');
  fs.writeFileSync(checkpointFile, JSON.stringify({ version: 1, order, plan_hash: planHash, sites: { one: { site_id: 'wrong', status: 'done', attempts: 1, run_id: 'one' } } }));
  await assert.rejects(runBatch(options), /checkpoint site record is invalid/);
  assert.equal(calls, 0);
});
