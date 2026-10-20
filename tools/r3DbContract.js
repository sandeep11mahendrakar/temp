'use strict';

// Offline R3 database envelope contract. This module validates provenance and
// statuses; it does not sanitize data or perform database/network operations.
const crypto = require('node:crypto');

const SCHEMA_VERSION = '1.0';
const HASH = /^[a-f0-9]{64}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const EXPERIMENT_KINDS = new Set(['RESEARCH', 'TRIAL', 'PENDING_VALIDATION']);
const EXECUTION_OUTCOMES = new Set(['PASS', 'PARTIAL', 'FAIL', 'BLOCKED', 'ERROR', 'INCONCLUSIVE', 'NOT_RECORDED']);
const INTEGRITY_VERDICTS = new Set(['CLEAN', 'QUARANTINED', 'CONTAMINATED', 'INCONCLUSIVE', 'NOT_EVALUATED', 'PENDING_VALIDATION']);
const AGGREGATE_ELIGIBILITY = new Set(['ELIGIBLE', 'EXCLUDED', 'PENDING_VALIDATION']);
const AVAILABILITY = new Set(['RECORDED', 'NOT_RECORDED', 'NOT_APPLICABLE', 'STAGE_NOT_RUN', 'BLOCKED', 'ERROR', 'INCONCLUSIVE', 'REDACTED', 'PENDING_VALIDATION']);
const SERVER_FIELDS = new Set(['created_at', 'inserted_at', 'updated_at', 'server_timestamp']);
const CONTRACT_FIELDS = ['run_id', 'app_id', 'comparison_id', 'platform', 'stage', 'experiment_kind', 'execution_outcome',
  'integrity_verdict', 'aggregate_eligibility', 'supersedes_report', 'manifest_sha256', 'report_sha256'];
const COST_FIELDS = ['manifest.cost.calls', 'manifest.cost.tokens', 'manifest.cost.screens', 'manifest.cost.time'];

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function has(object, key) { return isRecord(object) && Object.prototype.hasOwnProperty.call(object, key); }
function first(object, paths) {
  for (const pointer of paths) {
    const value = pointer.split('.').reduce((part, key) => part == null ? undefined : part[key], object);
    if (value !== undefined && value !== null && value !== '') return { value, pointer };
  }
  return { value: null, pointer: null };
}
function deepClone(value) { return JSON.parse(JSON.stringify(value)); }
function availability(value) {
  if (value === null || value === undefined || value === 'NOT_RECORDED') return 'NOT_RECORDED';
  if (typeof value === 'string' && AVAILABILITY.has(value)) return value;
  return 'RECORDED';
}
function optionalSource(source) {
  return source.value === 'NOT_RECORDED' ? { value: null, pointer: source.pointer } : source;
}

function normalizeExecution(value) {
  const aliases = { SUCCESS: 'PASS', PASSED: 'PASS', MIXED: 'PARTIAL', PARTIAL_FAILURE: 'PARTIAL', FAILED: 'FAIL', FAILURE: 'FAIL' };
  const normalized = typeof value === 'string' ? (aliases[value.toUpperCase()] || value.toUpperCase()) : 'NOT_RECORDED';
  return normalized;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function hashInput(envelope) {
  if (!isRecord(envelope)) throw new Error('envelope must be an object');
  const copy = { ...envelope };
  delete copy.payload_sha256;
  for (const field of SERVER_FIELDS) delete copy[field];
  return stableValue(copy);
}

function canonicalJson(envelope) { return JSON.stringify(hashInput(envelope)); }
function payloadHash(envelope) { return crypto.createHash('sha256').update(canonicalJson(envelope), 'utf8').digest('hex'); }

function buildEnvelope(input) {
  if (!isRecord(input)) throw new Error('input must be an object');
  const { manifest, report, manifest_sha256: manifestHash, report_sha256: reportHash } = input;
  if (!isRecord(manifest)) throw new Error('manifest root must be an object');
  if (!isRecord(report)) throw new Error('report root must be an object');
  const runId = manifest.run_id;
  if (typeof runId !== 'string' || !RUN_ID.test(runId) || runId === '.' || runId === '..') throw new Error('manifest.run_id must be valid text');
  if (!isRecord(report.run) || typeof report.run.id !== 'string' || !RUN_ID.test(report.run.id)) throw new Error('report.run.id must be valid text');
  if (report.run.id !== runId) throw new Error('manifest/report run ID mismatch');
  if (typeof manifestHash !== 'string' || !HASH.test(manifestHash)) throw new Error('manifest_sha256 must be lowercase SHA-256');
  if (typeof reportHash !== 'string' || !HASH.test(reportHash)) throw new Error('report_sha256 must be lowercase SHA-256');

  const app = optionalSource(first({ manifest, report }, ['report.app_id', 'manifest.app_id']));
  const comparison = optionalSource(first({ manifest, report }, ['report.comparison_id', 'manifest.comparison_id']));
  const platform = optionalSource(first({ manifest, report }, ['report.platform', 'manifest.platform']));
  const stage = optionalSource(first({ manifest, report }, ['report.stage', 'manifest.stage']));
  const kind = optionalSource(first({ manifest, report }, ['report.experiment_kind', 'manifest.experiment_kind']));
  const reportOutcome = first({ manifest, report }, ['report.execution_outcome']);
  const legacyOutcome = first({ manifest, report }, ['report.result.verdict']);
  const manifestOutcome = first({ manifest, report }, ['manifest.execution_outcome', 'manifest.overall_status']);
  const legacyContaminated = reportOutcome.value === null && legacyOutcome.value === 'CONTAMINATED';
  const outcome = reportOutcome.value !== null ? reportOutcome
    : legacyOutcome.value !== null ? legacyOutcome : manifestOutcome;
  const explicitIntegrity = first({ manifest, report }, ['report.integrity_verdict', 'report.integrity.verdict', 'manifest.integrity_verdict']);
  const integrity = explicitIntegrity.value === null && legacyContaminated
    ? { value: 'CONTAMINATED', pointer: legacyOutcome.pointer } : optionalSource(explicitIntegrity);
  const eligibility = optionalSource(first({ manifest, report }, ['report.aggregate_eligibility', 'report.eligibility.aggregate', 'manifest.aggregate_eligibility']));
  const supersedes = optionalSource(first({ manifest, report }, ['report.supersedes_report', 'manifest.supersedes_report']));

  const experimentKind = kind.value === null ? 'PENDING_VALIDATION' : String(kind.value).toUpperCase();
  const executionOutcome = normalizeExecution(legacyContaminated ? null : outcome.value);
  const integrityVerdict = integrity.value === null ? 'PENDING_VALIDATION' : String(integrity.value).toUpperCase();
  const aggregateEligibility = eligibility.value === null ? 'PENDING_VALIDATION' : String(eligibility.value).toUpperCase();
  const supersedesReport = supersedes.value === null ? null : supersedes.value;
  const sourcePointers = {
    run_id: 'manifest.run_id', app_id: app.pointer, comparison_id: comparison.pointer,
    platform: platform.pointer, stage: stage.pointer, experiment_kind: kind.pointer,
    execution_outcome: outcome.pointer, integrity_verdict: integrity.pointer,
    aggregate_eligibility: eligibility.pointer, supersedes_report: supersedes.pointer,
    manifest_sha256: 'manifest.json:raw-bytes', report_sha256: 'report.json:raw-bytes',
  };
  const sourceValues = { run_id: runId, app_id: app.value, comparison_id: comparison.value, platform: platform.value,
    stage: stage.value, experiment_kind: kind.value, execution_outcome: outcome.value,
    integrity_verdict: integrity.value, aggregate_eligibility: eligibility.value, supersedes_report: supersedes.value,
    manifest_sha256: manifestHash, report_sha256: reportHash };
  const availabilityMap = Object.fromEntries(Object.entries(sourcePointers).map(([key, pointer]) => [key,
    key.endsWith('_sha256') || key === 'run_id' ? 'RECORDED' : pointer && sourceValues[key] !== null && sourceValues[key] !== 'NOT_RECORDED' ? 'RECORDED' : 'NOT_RECORDED']));
  availabilityMap['manifest.cost.calls'] = availability(manifest.cost?.calls);
  availabilityMap['manifest.cost.tokens'] = availability(manifest.cost?.tokens);
  availabilityMap['manifest.cost.screens'] = availability(manifest.cost?.screens);
  availabilityMap['manifest.cost.time'] = availability(manifest.cost?.time);

  const envelope = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    app_id: app.value,
    comparison_id: comparison.value,
    platform: platform.value,
    stage: stage.value,
    experiment_kind: experimentKind,
    execution_outcome: executionOutcome,
    integrity_verdict: integrityVerdict,
    aggregate_eligibility: aggregateEligibility,
    supersedes_report: supersedesReport,
    manifest_sha256: manifestHash,
    report_sha256: reportHash,
    manifest: deepClone(manifest),
    report: deepClone(report),
    source_pointers: sourcePointers,
    availability: availabilityMap,
  };
  const errors = validateEnvelope(envelope);
  if (errors.length) throw new Error(`invalid R3 envelope: ${errors.join('; ')}`);
  envelope.payload_sha256 = payloadHash(envelope);
  return envelope;
}

function validateEnvelope(envelope) {
  const errors = [];
  if (!isRecord(envelope)) return ['envelope root must be an object'];
  if (envelope.schema_version !== SCHEMA_VERSION) errors.push('unsupported schema_version');
  if (typeof envelope.run_id !== 'string' || !RUN_ID.test(envelope.run_id) || envelope.run_id === '.' || envelope.run_id === '..') errors.push('invalid run_id');
  if (!isRecord(envelope.manifest)) errors.push('manifest must be an object');
  if (!isRecord(envelope.report)) errors.push('report must be an object');
  if (isRecord(envelope.manifest) && envelope.manifest.run_id !== envelope.run_id) errors.push('manifest run_id mismatch');
  if (isRecord(envelope.report) && (!isRecord(envelope.report.run) || envelope.report.run.id !== envelope.run_id)) errors.push('report run ID mismatch');
  for (const key of ['app_id', 'comparison_id', 'platform', 'stage']) {
    if (envelope[key] !== null && (typeof envelope[key] !== 'string' || !envelope[key].trim())) errors.push(`${key} must be non-empty text or null`);
  }
  if (!EXPERIMENT_KINDS.has(envelope.experiment_kind)) errors.push('unsupported experiment_kind');
  if (!EXECUTION_OUTCOMES.has(envelope.execution_outcome)) errors.push('unsupported execution_outcome');
  if (!INTEGRITY_VERDICTS.has(envelope.integrity_verdict)) errors.push('unsupported integrity_verdict');
  if (!AGGREGATE_ELIGIBILITY.has(envelope.aggregate_eligibility)) errors.push('unsupported aggregate_eligibility');
  if (envelope.experiment_kind === 'TRIAL' && envelope.aggregate_eligibility === 'ELIGIBLE') errors.push('trial cannot be ELIGIBLE');
  if (envelope.aggregate_eligibility === 'ELIGIBLE' && envelope.experiment_kind !== 'RESEARCH') errors.push('ELIGIBLE requires explicit RESEARCH experiment_kind');
  if (envelope.aggregate_eligibility === 'ELIGIBLE' && (!envelope.app_id || envelope.app_id === 'NOT_RECORDED' || !envelope.comparison_id || envelope.comparison_id === 'NOT_RECORDED')) errors.push('ELIGIBLE requires explicit app_id and comparison_id');
  if (envelope.supersedes_report !== null && (typeof envelope.supersedes_report !== 'string' || !envelope.supersedes_report.trim())) errors.push('supersedes_report must be non-empty text or null');
  if (envelope.supersedes_report === envelope.run_id) errors.push('supersedes_report must identify a different report');
  for (const key of ['manifest_sha256', 'report_sha256']) if (typeof envelope[key] !== 'string' || !HASH.test(envelope[key])) errors.push(`${key} must be lowercase SHA-256`);
  if (!isRecord(envelope.source_pointers)) errors.push('source_pointers must be an object');
  else for (const key of CONTRACT_FIELDS) if (!(key in envelope.source_pointers) || (envelope.source_pointers[key] !== null && typeof envelope.source_pointers[key] !== 'string')) errors.push(`source_pointers.${key} must be text or null`);
  if (!isRecord(envelope.availability)) errors.push('availability must be an object');
  else {
    for (const key of [...CONTRACT_FIELDS, ...COST_FIELDS]) if (!(key in envelope.availability)) errors.push(`availability.${key} missing`);
    for (const [key, value] of Object.entries(envelope.availability)) if (!AVAILABILITY.has(value)) errors.push(`unsupported availability.${key}`);
  }
  if (envelope.payload_sha256 !== undefined) {
    if (typeof envelope.payload_sha256 !== 'string' || !HASH.test(envelope.payload_sha256)) errors.push('payload_sha256 must be lowercase SHA-256');
    else if (envelope.payload_sha256 !== payloadHash(envelope)) errors.push('payload_sha256 mismatch');
  }
  return errors;
}

module.exports = { SCHEMA_VERSION, FIELD_MAP: Object.freeze({
  run_id: 'manifest.run_id == report.run.id', app_id: 'report.app_id ?? manifest.app_id',
  comparison_id: 'report.comparison_id ?? manifest.comparison_id', platform: 'report.platform ?? manifest.platform',
  stage: 'report.stage ?? manifest.stage', experiment_kind: 'report.experiment_kind ?? manifest.experiment_kind',
  execution_outcome: 'report.execution_outcome ?? report.result.verdict ?? manifest.execution_outcome ?? manifest.overall_status',
  integrity_verdict: 'report.integrity_verdict ?? report.integrity.verdict ?? manifest.integrity_verdict',
  aggregate_eligibility: 'report.aggregate_eligibility ?? report.eligibility.aggregate ?? manifest.aggregate_eligibility',
  supersedes_report: 'report.supersedes_report ?? manifest.supersedes_report',
}), buildEnvelope, validateEnvelope, canonicalJson, payloadHash, hashInput, SERVER_FIELDS };
