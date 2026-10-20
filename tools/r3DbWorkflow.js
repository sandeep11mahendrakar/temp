'use strict';

// Offline-first R3 archive -> report summary -> immutable outbox workflow.
// Upload mode is explicit and always delegates readback to trialUploader.
const fs = require('node:fs');
const path = require('node:path');
const { archiveRun } = require('./runArchive');
const { validate, summary } = require('./researchSchema');
const { writeOutbox } = require('./r3DbExport');
const { configFromEnv, uploadOutbox } = require('./trialUploader');

function readSpec(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('workflow input must be an object');
  if (!value.manifest || typeof value.manifest !== 'object' || Array.isArray(value.manifest)) throw new Error('workflow input requires manifest object');
  if (!Array.isArray(value.artifacts)) throw new Error('workflow input requires artifacts[]');
  if (!value.artifacts.some((item) => item && item.path === 'report.json')) throw new Error('workflow requires source report.json artifact');
  return value;
}

function normalizeArchivePath(value, fallback) {
  const input = value || fallback;
  if (typeof input !== 'string' || !input) throw new Error('archive artifact path required');
  const normalized = input.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`unsafe archive path: ${input}`);
  }
  return normalized;
}

function readEvidenceReport(spec, root) {
  const reportArtifact = spec.artifacts.find((item) => item && normalizeArchivePath(item.path, path.basename(item.source || '')) === 'report.json');
  if (!reportArtifact || typeof reportArtifact.source !== 'string') throw new Error('workflow requires source report.json artifact');
  const sourcePath = path.resolve(root, reportArtifact.source);
  const relative = path.relative(root, sourcePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('artifact source must stay inside project root');
  let report;
  try { report = JSON.parse(fs.readFileSync(sourcePath, 'utf8')); } catch (error) { throw new Error(`source report.json unreadable: ${error.message}`); }
  if (!report || typeof report !== 'object' || Array.isArray(report) || !Array.isArray(report.cases)) throw new Error('source report.json requires cases[]');
  return report;
}

function requireEvidenceArtifacts(report, artifactPaths, archiveDir) {
  const available = new Set(artifactPaths);
  for (const [index, item] of report.cases.entries()) {
    if (!item || !Array.isArray(item.evid_paths)) throw new Error(`report case[${index}] evid_paths required`);
    for (const evidencePath of item.evid_paths) {
      const normalized = normalizeArchivePath(evidencePath);
      if (!available.has(normalized)) throw new Error(`report evidence missing from archive artifacts: ${normalized}`);
      if (archiveDir) {
        const file = path.resolve(archiveDir, ...normalized.split('/'));
        const relative = path.relative(archiveDir, file);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          throw new Error(`report evidence missing from archive files: ${normalized}`);
        }
      }
    }
  }
}

function runWorkflow(spec, options = {}) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('workflow input must be an object');
  if (!spec.manifest || typeof spec.manifest !== 'object' || Array.isArray(spec.manifest)) throw new Error('workflow input requires manifest object');
  if (!Array.isArray(spec.artifacts)) throw new Error('workflow input requires artifacts[]');
  if (!spec.artifacts.some((item) => item && item.path === 'report.json')) throw new Error('workflow requires source report.json artifact');
  const mode = options.mode || 'offline';
  if (!['offline', 'upload'].includes(mode)) throw new Error('mode must be offline or upload');
  const root = path.resolve(options.root || process.cwd());
  const runsDir = path.resolve(options.runsDir || path.join(root, 'runs'));
  const reportsDir = path.resolve(options.reportsDir || path.join(root, 'reports'));
  const outboxDir = path.resolve(options.outboxDir || path.join(root, 'outbox'));
  const runId = spec.manifest.run_id;
  if (typeof runId !== 'string' || !runId) throw new Error('manifest.run_id required');
  const report = readEvidenceReport(spec, root);
  const declaredArtifactPaths = spec.artifacts.map((item) => normalizeArchivePath(item && item.path, path.basename(item && item.source || '')));
  requireEvidenceArtifacts(report, declaredArtifactPaths);
  const summaryPath = path.join(reportsDir, `${runId}.md`);
  if (fs.existsSync(summaryPath)) throw new Error(`refuse overwrite: ${path.relative(root, summaryPath)}`);

  const archived = archiveRun({ ...spec.manifest, artifacts: spec.artifacts, calls_source: spec.calls_source }, { root, runsDir });
  const archivePath = path.join(runsDir, runId);
  const checked = validate(archivePath);
  if (!checked.ok) throw new Error(`workflow validation failed: ${checked.errors.join('; ')}`);
  const archivedArtifactPaths = checked.manifest.artifacts.map((item) => normalizeArchivePath(item.path));
  requireEvidenceArtifacts(checked.report, archivedArtifactPaths, archivePath);

  // P-2's report.json is source evidence. Generate its Markdown summary beside
  // the immutable archive so finalizing the archive never changes its bytes.
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(summaryPath, summary(checked, checked), { encoding: 'utf8', flag: 'wx' });
  const queued = writeOutbox(archivePath, outboxDir);
  const result = {
    run_id: runId,
    mode,
    archive: archived.archive,
    summary: path.relative(root, summaryPath).replace(/\\/g, '/'),
    outbox: path.relative(root, queued.path).replace(/\\/g, '/'),
    queued: !queued.duplicate,
    payload_sha256: queued.envelope.payload_sha256,
    uploaded: false,
    readback: 'NOT_RUN',
  };
  if (mode === 'upload') {
    const upload = uploadOutbox(queued.path, {
      config: options.config || configFromEnv(options.env),
      fetchImpl: options.fetchImpl,
    });
    return Promise.resolve(upload).then((proof) => ({ ...result, uploaded: proof.uploaded, readback: proof.verified ? 'PASS' : 'FAIL' }));
  }
  return result;
}

function parseArgs(args) {
  let input; let mode = 'offline'; let root;
  for (const arg of args) {
    if (arg.startsWith('--mode=')) mode = arg.slice(7);
    else if (arg.startsWith('--root=')) root = arg.slice(7);
    else if (!input) input = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!input) throw new Error('usage: node tools/r3DbWorkflow.js <input.json> [--mode=offline|upload] [--root=<dir>]');
  return { input: path.resolve(input), mode, root: root && path.resolve(root) };
}

module.exports = { readSpec, runWorkflow, parseArgs };

if (require.main === module) {
  (async () => {
    const args = parseArgs(process.argv.slice(2));
    const spec = readSpec(args.input);
    const root = args.root || path.dirname(args.input);
    const result = await runWorkflow(spec, { mode: args.mode, root });
    console.log(`WORKFLOW PASS run_id=${result.run_id} mode=${result.mode}`);
    console.log(`ARCHIVE ${result.archive}`);
    console.log(`REPORT ${result.summary}`);
    console.log(`OUTBOX ${result.queued ? 'CREATED' : 'EXISTS'} ${result.outbox} sha256=${result.payload_sha256}`);
    console.log(`UPLOAD ${result.uploaded ? 'VERIFIED' : 'NOT_RUN'} READBACK ${result.readback}`);
  })().catch((error) => {
    console.error(`WORKFLOW-REFUSED ${String(error && error.message || 'unknown failure')}`);
    process.exitCode = 1;
  });
}
