'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function defaultReadResult(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createVisionTrialExecutor(options = {}) {
  const spawnProcess = typeof options.spawnProcess === 'function' ? options.spawnProcess : spawn;
  const readResult = typeof options.readResult === 'function' ? options.readResult : defaultReadResult;
  const runVisionPath = options.runVisionPath || path.join(process.cwd(), 'vision', 'runVision.js');
  const maxStates = options.maxStates || 10;
  const visionRoot = options.visionRoot || path.join(process.cwd(), 'vision');

  return async function execute(site, context = {}) {
    const signal = context.signal;
    const runIdHint = site.run_id || site.id;
    const url = site.url || site.target_url;
    if (!url) throw new Error('site.url is required');

    const args = [runVisionPath, '--explore', url];
    if (site.goal) args.push('--goal', site.goal);

    const child = spawnProcess('node', args, {
      cwd: visionRoot,
      env: { ...process.env, EXPLORE_MAX_STATES: String(maxStates), VISION_HEADED: 'false' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    if (child.stdout) child.stdout.on('data', d => { stdout += d; });
    if (child.stderr) child.stderr.on('data', d => { stderr += d; });

    const exitCode = await new Promise((resolve, reject) => {
      const onAbort = () => { try { child.kill(); } catch (_) {} };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      child.on('error', err => { if (signal) signal.removeEventListener('abort', onAbort); reject(err); });
      child.on('exit', code => { if (signal) signal.removeEventListener('abort', onAbort); resolve(code); });
    });

    const match = stdout.match(/test_cases_file:\s*(.+\.json)/i) || stdout.match(/Test cases from history:\s*(.+\.json)/i);
    const tcFile = match ? match[1].trim() : null;
    const resultRunId = tcFile ? path.basename(tcFile).replace(/^test_cases_/, '').replace(/_exploration\.json$/, '') : runIdHint;

    const resultPath = path.join(visionRoot, 'storage', 'outputs', `${resultRunId}_exploration_result.json`);

    let exploration = null;
    let readError = null;
    try {
      exploration = readResult(resultPath);
    } catch (e) {
      readError = e;
    }

    if (exitCode !== 0) {
      return {
        status: 'FAILED',
        error: `runVision exited ${exitCode}: ${stderr.slice(0, 300)}`,
        archive_input: exploration ? buildArchiveInput(runIdHint || resultRunId, exploration, resultPath) : undefined
      };
    }
    if (readError || !exploration) {
      return {
        status: 'FAILED',
        error: `missing or unreadable exploration result: ${readError ? readError.message : 'not found'}`,
        archive_input: undefined
      };
    }

    const archiveInput = buildArchiveInput(runIdHint || resultRunId, exploration, resultPath);
    const termination = String(exploration.termination_reason || '').toLowerCase();
    const blocked = termination.includes('blocked') || termination.includes('captcha');
    return {
      status: blocked ? 'BLOCKED' : 'COMPLETE',
      archive_input: archiveInput
    };
  };
}

function buildArchiveInput(runId, exploration, resultPath) {
  const root = process.cwd();
  const relResult = path.relative(root, resultPath).replace(/\\/g, '/');
  return {
    run_id: runId,
    label: 'TRIAL',
    citable: false,
    aggregate_eligibility: 'EXCLUDED',
    experiment_kind: 'TRIAL',
    site: exploration.site || null,
    url: exploration.url || null,
    started: exploration.started || null,
    ended: exploration.ended || null,
    model_provider: exploration.model_provider || null,
    model_id: exploration.model_id || null,
    cost: {
      calls: exploration.totals && exploration.totals.llm_calls != null ? exploration.totals.llm_calls : null,
      tokens: exploration.totals && exploration.totals.tokens != null ? exploration.totals.tokens : null,
      screens: exploration.totals && exploration.totals.screens != null ? exploration.totals.screens : null,
      time: exploration.totals && exploration.totals.time_ms != null ? exploration.totals.time_ms : null
    },
    artifacts: [
      { source: relResult, path: 'exploration_result.json' }
    ]
  };
}

module.exports = { createVisionTrialExecutor };