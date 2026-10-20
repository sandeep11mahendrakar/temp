'use strict';

// Build a bounded TRIAL review report only from retained manifest/report/readback artifacts.
const fs = require('node:fs');
const path = require('node:path');

const UNKNOWN = 'NOT_RECORDED';
const SECRET_PATTERNS = [/AIza[0-9A-Za-z_-]{35}/g, /sb_secret_/g, /service_role/g, /eyJ/g];
const REQUIRED_MANIFEST = ['run_id', 'started', 'ended', 'label', 'cost', 'artifacts'];
const REQUIRED_REPORT = ['run', 'result', 'integrity', 'cases', 'telemetry'];

function parseJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function shown(value) { return value === null || value === undefined || value === '' ? UNKNOWN : String(value); }
function tableRow(cells) { return `| ${cells.join(' | ')} |`; }
function missingRunEntry(displayManifest, reason) {
  const cells = [UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, `${UNKNOWN}/${UNKNOWN}/${UNKNOWN}`,
    UNKNOWN, UNKNOWN, 'FAIL', `${displayManifest}:${reason}`];
  return { lines: tableRow(cells), gaps: [`${displayManifest}:${reason}`], valid: false, secret: false, storage: UNKNOWN };
}
function cite(value, file, field) {
  return Number.isFinite(value) ? `${value} (${file}:${field})` : UNKNOWN;
}
function safeArtifactPath(root, manifestFile, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
  const base = path.dirname(path.resolve(root, manifestFile));
  const file = path.resolve(base, relative);
  return file.startsWith(base + path.sep) ? file : null;
}
function readReadback(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return { rows: [], error: true };
  try {
    const parsed = parseJson(file);
    const rows = Array.isArray(parsed) ? parsed : (isRecord(parsed) && Array.isArray(parsed.rows) ? parsed.rows : null);
    return rows ? { rows, error: false } : { rows: [], error: true };
  } catch { return { rows: [], error: true }; }
}
function secretPresent(values) {
  const text = JSON.stringify(values);
  return SECRET_PATTERNS.some((pattern) => { pattern.lastIndex = 0; return pattern.test(text); });
}
function causeValue(item) {
  if (!item) return null;
  const direct = item.cause_class || item.causeClass || item.cause;
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') {
    const leaf = direct.cause_class || direct.causeClass || direct.code || direct.reason || direct.value;
    return typeof leaf === 'string' ? leaf : null;
  }
  if (typeof item.block === 'string') return item.block;
  if (item.block && typeof item.block === 'object') {
    const leaf = item.block.cause_class || item.block.causeClass || item.block.code || item.block.reason || item.block.value;
    return typeof leaf === 'string' ? leaf : null;
  }
  return null;
}
function causeClass(report) {
  const result = report && report.result ? report.result : null;
  const explicit = causeValue(result);
  if (explicit) return explicit;
  const cases = report && Array.isArray(report.cases) ? report.cases : [];
  const causes = cases.map(causeValue).filter(Boolean);
  return causes.length ? [...new Set(causes)].join(',') : UNKNOWN;
}
function schemaGaps(manifest, report, manifestPath, reportPath) {
  const gaps = [];
  for (const field of REQUIRED_MANIFEST) if (!isRecord(manifest) || !(field in manifest)) gaps.push(`${manifestPath}:${field}`);
  for (const field of REQUIRED_REPORT) if (!isRecord(report) || !(field in report)) gaps.push(`${reportPath}:${field}`);
  if (isRecord(manifest) && (!isRecord(manifest.cost) || !('time' in manifest.cost) || !('tokens' in manifest.cost))) gaps.push(`${manifestPath}:cost.time/tokens`);
  if (isRecord(report) && (!isRecord(report.run) || !report.run.id)) gaps.push(`${reportPath}:run.id`);
  return gaps;
}
function verdictGaps(report, reportPath) {
  if (!isRecord(report)) return [];
  const gaps = [];
  const verdicts = new Set(['PASS', 'FAIL', 'PARTIAL', 'BLOCKED', 'ERROR', 'INCONCLUSIVE', 'SKIP', 'SKIPPED']);
  const knownVerdict = (value) => typeof value === 'string' && verdicts.has(value);
  const knownCause = (value) => typeof value === 'string' && value.trim() !== '' &&
    !['NONE', 'NOT_RECORDED', 'UNKNOWN', 'N/A'].includes(value.trim().toUpperCase());
  const outcome = report.result && (report.result.verdict || report.result.outcome);
  if (!knownVerdict(outcome)) gaps.push(`${reportPath}:run verdict missing_or_unknown`);
  else if (outcome !== 'PASS' && !knownCause(causeValue(report.result))) gaps.push(`${reportPath}:run cause missing_or_unknown`);
  if (!Array.isArray(report.cases) || report.cases.length === 0) {
    gaps.push(`${reportPath}:case verdicts absent`);
    return gaps;
  }
  report.cases.forEach((entry, index) => {
    const verdict = entry && entry.verdict;
    if (!knownVerdict(verdict)) gaps.push(`${reportPath}:case[${index}] verdict missing_or_unknown`);
    else if (verdict !== 'PASS' && !knownCause(causeValue(entry))) gaps.push(`${reportPath}:case[${index}] cause missing_or_unknown`);
  });
  return gaps;
}
function artifactGaps(manifest, report, root, manifestFile, displayManifest) {
  const gaps = [];
  let secret = false;
  const declared = new Set();
  const artifacts = manifest && manifest.artifacts;
  if (!Array.isArray(artifacts)) return { gaps: [`${displayManifest}:artifacts invalid`], secret };
  const realBase = fs.realpathSync(path.dirname(manifestFile));
  for (const item of artifacts) {
    const ref = item && item.path;
    const label = `${displayManifest}:artifact ${typeof ref === 'string' ? ref : 'invalid'}`;
    if (declared.has(ref)) gaps.push(`${label} duplicate`);
    declared.add(ref);
    try {
      const file = safeArtifactPath(root, manifestFile, ref);
      if (!file) throw new Error('unsafe path');
      const realFile = fs.realpathSync(file);
      if (!realFile.startsWith(realBase + path.sep)) throw new Error('path escape');
      if (!fs.statSync(realFile).isFile()) throw new Error('not a file');
      const bytes = fs.readFileSync(realFile);
      // Scan actual retained bytes, including text embedded in binary evidence.
      // Report status only; never copy matching bytes into the review output.
      if (secretPresent(bytes.toString('utf8'))) secret = true;
      if (!Number.isSafeInteger(item.bytes) || item.bytes !== bytes.length) throw new Error('byte count mismatch');
      const digest = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
      if (typeof item.sha256 !== 'string' || item.sha256.toLowerCase() !== digest) throw new Error('hash mismatch');
    } catch {
      gaps.push(`${label} missing_or_invalid`);
    }
  }
  for (const entry of report && Array.isArray(report.cases) ? report.cases : []) {
    if (!entry || entry.evid_paths === undefined) continue;
    if (!Array.isArray(entry.evid_paths) || entry.evid_paths.length === 0) {
      gaps.push(`${displayManifest}:case evidence invalid`);
      continue;
    }
    for (const ref of entry.evid_paths) {
      if (typeof ref !== 'string' || !declared.has(ref)) gaps.push(`${displayManifest}:case evidence unlisted`);
    }
  }
  return { gaps, secret };
}
function runEntry(manifestFile, root, readbacks) {
  const displayManifest = path.relative(root, manifestFile).replace(/\\/g, '/');
  if (!fs.existsSync(manifestFile) || !fs.statSync(manifestFile).isFile()) {
    return missingRunEntry(displayManifest, 'missing');
  }
  let manifest;
  try { manifest = parseJson(manifestFile); } catch {
    return missingRunEntry(displayManifest, 'invalid_json');
  }
  const runId = shown(manifest && manifest.run_id);
  let report = null; let reportPath = UNKNOWN; let reportDisplay = UNKNOWN;
  const reportRef = isRecord(manifest) && Array.isArray(manifest.artifacts) && manifest.artifacts.find((item) => item && item.path === 'report.json');
  if (reportRef) {
    const file = safeArtifactPath(root, manifestFile, reportRef.path);
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      reportPath = file;
      reportDisplay = path.relative(root, file).replace(/\\/g, '/');
      try { report = parseJson(file); } catch { report = null; }
    }
  }
  const readbackRows = readbacks.rows.filter((row) => row && (row.run_id || row.runId || row.id) === runId);
  const row = readbackRows.length === 1 ? readbackRows[0] : null;
  const reportId = report && report.run && report.run.id;
  const identityOk = !!runId && reportId === runId;
  const hashOk = !!row && reportPath !== UNKNOWN &&
    row.manifest_sha256 === sha256(manifestFile) && row.report_sha256 === sha256(reportPath);
  const readbackStatus = readbackRows.length !== 1 ? UNKNOWN : (identityOk && hashOk ? 'PASS' : 'FAIL');
  const outcome = report && report.result ? shown(report.result.verdict || report.result.outcome) : UNKNOWN;
  const integrity = report && report.integrity ? shown(report.integrity.verdict) : UNKNOWN;
  const gaps = schemaGaps(manifest, report, displayManifest, reportDisplay);
  gaps.push(...verdictGaps(report, reportDisplay));
  const artifacts = artifactGaps(manifest, report, root, manifestFile, displayManifest);
  gaps.push(...artifacts.gaps);
  const time = isRecord(manifest.cost) ? cite(manifest.cost.time, displayManifest, 'cost.time') : UNKNOWN;
  const calls = isRecord(manifest.cost) ? cite(manifest.cost.calls, displayManifest, 'cost.calls') : UNKNOWN;
  const tokens = isRecord(manifest.cost) ? cite(manifest.cost.tokens, displayManifest, 'cost.tokens') : UNKNOWN;
  const screens = isRecord(manifest.cost) ? cite(manifest.cost.screens, displayManifest, 'cost.screens') : UNKNOWN;
  const storage = shown((row && (row.storage_status || row.storage)) || (manifest && (manifest.storage_status || manifest.storage)) || (report && report.storage_status));
  const secret = artifacts.secret || secretPresent({ manifest, report, readback: row });
  function experimentKindConsistent(m, r) {
    const mKind = m && m.experiment_kind;
    const rKind = r && r.experiment_kind;
    if (mKind !== undefined && mKind !== null && rKind !== undefined && rKind !== null && String(mKind) !== String(rKind)) return false;
    if (m && m.label === 'TRIAL' && rKind !== undefined && rKind !== null && String(rKind).toUpperCase() !== 'TRIAL') return false;
    return true;
  }
  const citableOk = manifest.citable === undefined || manifest.citable === null || manifest.citable === false;
  const aggregateOk = manifest.aggregate_eligibility === undefined || manifest.aggregate_eligibility === null || manifest.aggregate_eligibility === 'EXCLUDED';
  const reportCitableOk = !report || report.citable === undefined || report.citable === null || report.citable === false;
  const reportAggregateOk = !report || report.aggregate_eligibility === undefined || report.aggregate_eligibility === null || report.aggregate_eligibility === 'EXCLUDED';
  const kindOk = experimentKindConsistent(manifest, report);
  if (!kindOk) gaps.push(`${displayManifest}:contradictory experiment_kind`);
  const valid = identityOk && readbackStatus === 'PASS' && gaps.length === 0 && integrity === 'CLEAN' && manifest.label === 'TRIAL' && citableOk && aggregateOk && reportCitableOk && reportAggregateOk && kindOk;
  const line = tableRow([runId, outcome, causeClass(report), integrity, time, `${calls}/${tokens}/${screens}`,
    storage, secret ? 'FAIL' : 'CLEAR', readbackStatus, `${displayManifest}; ${reportDisplay}`]);
  if (!identityOk) gaps.push(`${displayManifest}:manifest/report identity mismatch`);
  if (readbackRows.length !== 1) gaps.push(`${displayManifest}:readback row missing_or_duplicate`);
  else if (!hashOk) gaps.push(`${displayManifest}:readback hashes missing_or_mismatch`);
  return { lines: line, gaps, valid, secret, reportPath, storage };
}
function generateReport(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const paths = Array.isArray(options.manifests) ? options.manifests : [];
  const rowsFile = options.readback ? path.resolve(root, options.readback) : null;
  const readbacks = readReadback(rowsFile);
  const entries = paths.map((item) => runEntry(path.resolve(root, item), root, readbacks));
  const gaps = entries.flatMap((entry) => entry.gaps);
  const inputMissing = paths.length === 0 || readbacks.error || entries.length === 0;
  if (paths.length === 0) gaps.push('manifest paths:NOT_RECORDED');
  if (readbacks.error) gaps.push(`${options.readback || 'readback'}:missing_or_invalid`);
  if (entries.length === 0) entries.push(missingRunEntry(UNKNOWN, 'missing'));
  const secret = entries.some((entry) => entry.secret);
  const ready = !inputMissing && entries.every((entry) => entry.valid) && !secret;
  const gapLines = gaps.length ? gaps.map((item) => `- ${item}`) : ['- NONE (manifest/report artifacts inspected)'];
  const report = [
    '# TRIAL_REPORT',
    'label=TRIAL | citable:false | aggregate_eligibility=EXCLUDED',
    'Purpose=review readiness only; this report does not authorize freeze, research, upload, or campaign.',
    '',
    '| run_id | outcome | cause_class | integrity | time | calls/tokens/screens | storage | secret_scan | readback | source artifacts |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...entries.map((entry) => entry.lines),
    '',
    'Schema gaps:',
    ...gapLines,
    '',
    `Storage status=${entries.length && entries.every((entry) => entry.storage && entry.storage !== UNKNOWN) ? 'see per-run artifact-backed values above' : 'NOT_RECORDED (one or more inputs omit storage evidence)'}. Missing cost/time/token values remain NOT_RECORDED.`,
    `Secret status=${secret ? 'FAIL (marker detected; value withheld)' : (inputMissing ? 'NOT_RECORDED (required input missing)' : 'CLEAR (scanned listed artifacts; counts only)')}.`,
    `Recommendation=${ready ? 'GO for independent T-4/TV-4 review only' : 'NO-GO; required evidence missing or invalid'}. T-5 owner freeze remains separate.`,
  ];
  const text = report.join('\n') + '\n';
  if (text.trimEnd().split('\n').length > 60) throw new Error('report exceeds 60 lines');
  return { ok: ready, text, lines: text.trimEnd().split('\n').length, gapCount: gaps.length };
}
function parseArgs(args) {
  const result = { manifests: [], readback: null, output: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--manifest' && args[i + 1]) result.manifests.push(args[++i]);
    else if (args[i] === '--readback' && args[i + 1]) result.readback = args[++i];
    else if (args[i] === '--output' && args[i + 1]) result.output = args[++i];
    else throw new Error('usage: node tools/trialReport.js --manifest <manifest.json> [--manifest <manifest.json>] --readback <rows.json> [--output <report.md>]');
  }
  return result;
}
function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = generateReport(args);
    if (args.output) fs.writeFileSync(path.resolve(args.output), result.text, { encoding: 'utf8', flag: 'wx' });
    else process.stdout.write(result.text);
    console.log(`TRIAL_REPORT ${result.ok ? 'PASS' : 'FAIL'}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`TRIAL_REPORT_REFUSED ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { generateReport, parseArgs };
if (require.main === module) main();
