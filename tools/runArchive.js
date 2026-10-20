'use strict';

// Archive an already completed run without inventing missing evidence.
// Usage: node tools/runArchive.js <run.json>
// run.json: {run_id, ...manifest fields, artifacts:[{source,path}], calls_source?}
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const RUNS = path.join(ROOT, 'runs');
const MISSING = 'NOT_RECORDED';
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const FIELDS = ['site', 'url', 'head', 'dirty', 'model_provider', 'model_id',
  'contract_hash', 'prompt_hash', 'browser', 'viewport', 'os', 'limits',
  'seed', 'started', 'ended', 'label'];

function copyValue(v) { return v === undefined ? MISSING : v; }
function isRecord(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function firstDefined(...values) { return values.find((v) => v !== undefined); }
function usableCount(v) { return Number.isFinite(v) && v >= 0; }
function isCaptured(v) {
  if (v === undefined || v === null || v === MISSING) return false;
  if (typeof v === 'string' && ['', MISSING.toLowerCase(), 'unknown', 'n/a', 'na'].includes(v.trim().toLowerCase())) return false;
  return true;
}
function firstCaptured(...values) { return values.find(isCaptured); }
function chooseCount(...values) {
  return values.find(usableCount);
}
function chooseTokens(inputCost, reportCost) {
  const direct = [inputCost.tokens, reportCost.tokens].find((v) => v === null || usableCount(v));
  if (direct !== undefined) return direct;
  if (usableCount(reportCost.tokens_in) && usableCount(reportCost.tokens_out)) {
    return reportCost.tokens_in + reportCost.tokens_out;
  }
  return undefined;
}
function reportFile(staged) {
  const item = staged.find((entry) => entry.rel === 'report.json');
  if (!item) return null;
  const report = JSON.parse(fs.readFileSync(item.source, 'utf8'));
  if (!isRecord(report)) throw new Error('report.json must contain an object');
  const reportRunId = firstCaptured(isRecord(report.run) ? report.run.id : undefined, report.run_id);
  if (reportRunId !== undefined && reportRunId !== null && reportRunId !== '') {
    if (reportRunId !== item.runId) throw new Error('manifest/report run_id mismatch');
  } else {
    throw new Error('report.json missing run identity');
  }
  return report;
}
function stageTimings(report, notRecorded) {
  const timings = isRecord(report && report.timings) ? report.timings : {};
  const source = isRecord(timings.stages) ? timings.stages
    : (isRecord(report && report.stage_timings) ? report.stage_timings : null);
  if (!source) {
    notRecorded['timings.stages'] = 'stage timings not present in report';
    return MISSING;
  }
  const stages = {};
  for (const [name, value] of Object.entries(source)) {
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(name) || !isRecord(value)) continue;
    const timing = {};
    for (const key of ['started', 'ended', 'duration_ms']) {
      const part = value[key];
      if ((key === 'duration_ms' && usableCount(part)) || (key !== 'duration_ms' && typeof part === 'string' && part.length)) {
        timing[key] = part;
      } else {
        timing[key] = MISSING;
        notRecorded[`timings.stages.${name}.${key}`] = 'stage timing field not captured in report';
      }
    }
    if (Object.keys(timing).length) stages[name] = timing;
  }
  if (Object.keys(stages).length === 0) notRecorded['timings.stages'] = 'report contains no usable stage timing fields';
  return Object.keys(stages).length ? stages : MISSING;
}
function safeRel(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value)) throw new Error('artifact path must be relative');
  const normalized = value.replace(/\\/g, '/');
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`unsafe artifact path: ${value}`);
  return normalized;
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function archiveRun(input, opts = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('run record must be an object');
  if (typeof input.run_id !== 'string' || !RUN_ID.test(input.run_id) || input.run_id === '.' || input.run_id === '..') throw new Error('valid run_id required');
  const root = path.resolve(opts.root || ROOT);
  const runsDir = path.resolve(opts.runsDir || path.join(root, 'runs'));
  fs.mkdirSync(runsDir, { recursive: true });
  const rootReal = fs.realpathSync(root);
  const dest = path.join(runsDir, input.run_id);
  if (fs.existsSync(dest)) throw new Error(`refuse overwrite: ${path.relative(root, dest)}`);
  const entries = Array.isArray(input.artifacts) ? input.artifacts.slice() : [];
  if (input.calls_source) entries.push({ source: input.calls_source, path: 'per_call.jsonl' });
  const names = new Set();
  const staged = [];
  for (const entry of entries) {
    if (!entry || typeof entry.source !== 'string') throw new Error('each artifact requires source');
    const rel = safeRel(entry.path || path.basename(entry.source));
    if (rel === 'manifest.json' || names.has(rel)) throw new Error(`duplicate or reserved archive path: ${rel}`);
    names.add(rel);
    const sourcePath = path.resolve(root, entry.source);
    const relSource = path.relative(root, sourcePath);
    if (relSource.startsWith('..') || path.isAbsolute(relSource)) throw new Error('artifact source must stay inside project root');
    let source;
    try { source = fs.realpathSync(sourcePath); }
    catch (error) {
      if (error && error.code === 'ENOENT') throw new Error(`artifact source missing/not file: ${entry.source}`);
      throw error;
    }
    const relRealSource = path.relative(rootReal, source);
    if (relRealSource.startsWith('..') || path.isAbsolute(relRealSource)) throw new Error('artifact source must stay inside project root');
    if (!fs.statSync(source).isFile()) throw new Error(`artifact source missing/not file: ${entry.source}`);
    staged.push({ source, rel, runId: input.run_id });
  }
  const report = reportFile(staged);
  // Create destination exclusively. If anything fails, keep the partial folder
  // as a visible failed archive; a later invocation will refuse to overwrite it.
  fs.mkdirSync(dest, { recursive: false });
  const artifacts = [];
  for (const item of staged) {
    const target = path.join(dest, ...item.rel.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(item.source, target, fs.constants.COPYFILE_EXCL);
    artifacts.push({ path: item.rel, bytes: fs.statSync(target).size, sha256: sha256(target) });
  }
  const brain = isRecord(input.brain) ? input.brain : {};
  const inputCost = isRecord(input.cost) ? input.cost : {};
  const reportCost = isRecord(report && report.cost) ? report.cost : {};
  const reportRun = isRecord(report && report.run) ? report.run : {};
  const reportTimings = isRecord(report && report.timings) ? report.timings : {};
  const reportRunTimings = isRecord(reportTimings.run) ? reportTimings.run : {};
  const reportResult = isRecord(report && report.result) ? report.result : {};
  const reportProvenance = isRecord(report && report.provenance) ? report.provenance : {};
  const reportBrain = isRecord(report && report.brain) ? report.brain : {};
  const notRecorded = {};
  const readValue = (key, ...fallbacks) => {
    const value = firstCaptured(input[key], ...fallbacks);
    if (value === undefined || value === MISSING) notRecorded[key] = report ? 'not captured in input or report' : 'not captured; report.json absent';
    return copyValue(value);
  };
  const started = readValue('started', reportRunTimings.started, reportRun.started, reportRun.started_at);
  const ended = readValue('ended', reportRunTimings.ended, reportRun.ended, reportRun.ended_at);
  const verdictValue = firstCaptured(reportResult.verdict, report ? report.verdict : undefined);
  const verdict = verdictValue === undefined ? MISSING : verdictValue;
  if (verdictValue === undefined) notRecorded.verdict = report ? 'report has no run-level verdict' : 'report.json absent';
  const stageValues = stageTimings(report, notRecorded);
  const llmCalls = chooseCount(inputCost.llm_calls, inputCost.calls, reportCost.llm_calls, reportCost.api_calls, reportCost.calls);
  const tokens = chooseTokens(inputCost, reportCost);
  const screens = chooseCount(inputCost.screens, reportCost.screens);
  const time = chooseCount(inputCost.time, reportCost.time);
  if (llmCalls === undefined) {
    notRecorded['cost.llm_calls'] = 'call count absent from input and report';
    notRecorded['cost.calls'] = 'call count absent from input and report';
  }
  if (tokens === undefined || tokens === null) notRecorded['cost.tokens'] = 'token count unavailable in input and report';
  if (screens === undefined) notRecorded['cost.screens'] = 'screen count absent from input and report';
  if (time === undefined) notRecorded['cost.time'] = 'duration absent from input and report';
  const provenance = {};
  const provenanceKeys = ['head', 'dirty', 'model_provider', 'model_id', 'contract_hash', 'prompt_hash', 'browser', 'viewport', 'os'];
  for (const key of provenanceKeys) {
    const value = firstCaptured(input[key], reportProvenance[key], key === 'model_id' ? reportBrain.model : undefined);
    provenance[key] = copyValue(value);
    if (value === undefined) notRecorded[`provenance.${key}`] = 'not captured in input or report';
  }
  const trialFields = {};
  if (input.experiment_kind !== undefined) trialFields.experiment_kind = copyValue(input.experiment_kind);
  if (input.citable !== undefined) trialFields.citable = input.citable;
  if (input.aggregate_eligibility !== undefined) trialFields.aggregate_eligibility = input.aggregate_eligibility;
  const fieldFallbacks = {
    head: reportProvenance.head,
    dirty: reportProvenance.dirty,
    model_provider: reportProvenance.model_provider,
    model_id: firstCaptured(reportProvenance.model_id, reportBrain.model),
    contract_hash: reportProvenance.contract_hash,
    prompt_hash: reportProvenance.prompt_hash,
    browser: reportProvenance.browser,
    viewport: reportProvenance.viewport,
    os: reportProvenance.os,
  };
  const fields = Object.fromEntries(FIELDS.map((key) => {
    const value = firstCaptured(input[key], key === 'started' ? started : undefined,
      key === 'ended' ? ended : undefined, fieldFallbacks[key]);
    if (value === undefined) notRecorded[key] = report ? 'not captured in input or report' : 'not captured; report.json absent';
    return [key, copyValue(value)];
  }));
  for (const key of ['mode', 'role', 'blind']) {
    if (brain[key] === undefined || brain[key] === MISSING) notRecorded[`brain.${key}`] = 'not captured in input';
  }
  if (!input.calls_source) notRecorded.per_call = 'per-call artifact not supplied';
  const manifest = {
    run_id: input.run_id,
    ...fields,
    brain: Object.fromEntries(['mode', 'role', 'blind'].map((key) => [key, copyValue(brain[key])])),
    cost: {
      calls: llmCalls === undefined ? MISSING : llmCalls,
      llm_calls: llmCalls === undefined ? MISSING : llmCalls,
      tokens: tokens === undefined ? null : tokens,
      screens: screens === undefined ? MISSING : screens,
      time: time === undefined ? MISSING : time,
    },
    verdict,
    verdict_source: verdictValue === undefined ? MISSING : 'report.json',
    timings: { run: { started, ended }, stages: stageValues },
    provenance,
    not_recorded: notRecorded,
    per_call: input.calls_source ? 'per_call.jsonl' : MISSING,
    artifacts,
    ...trialFields,
  };
  fs.writeFileSync(path.join(dest, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { ok: true, archive: path.relative(root, dest).replace(/\\/g, '/'), manifest };
}

module.exports = { archiveRun, MISSING };

if (require.main === module) {
  try {
    const arg = process.argv[2];
    if (!arg) throw new Error('usage: node tools/runArchive.js <run.json>');
    const record = JSON.parse(fs.readFileSync(path.resolve(ROOT, arg), 'utf8'));
    const result = archiveRun(record);
    console.log(`ARCHIVE ${result.archive}`);
    console.log(`artifacts=${result.manifest.artifacts.length} missing_fields=${Object.values(result.manifest).filter((v) => v === MISSING).length}`);
  } catch (error) {
    console.error(`ARCHIVE-REFUSED ${error.message}`);
    process.exitCode = 1;
  }
}
