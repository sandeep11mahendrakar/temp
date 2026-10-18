'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildEnvelope, validateEnvelope, payloadHash, hashInput } = require('./r3DbContract');

const HASH = 'a'.repeat(64);
function input(overrides = {}) {
  return {
    manifest: { run_id: 'run-1', app_id: 'app-1', comparison_id: 'cmp-1', platform: 'web', stage: 'A', cost: { calls: 0, tokens: null, screens: 0, time: 0 } },
    report: { run: { id: 'run-1' }, experiment_kind: 'RESEARCH', execution_outcome: 'SUCCESS', integrity_verdict: 'CLEAN', aggregate_eligibility: 'ELIGIBLE', cases: [] },
    manifest_sha256: HASH, report_sha256: HASH, ...overrides,
  };
}

test('builds a source-cited envelope and keeps numeric zero recorded', () => {
  const row = buildEnvelope(input());
  assert.equal(row.execution_outcome, 'PASS');
  assert.equal(row.availability['manifest.cost.calls'], 'RECORDED');
  assert.equal(row.availability['manifest.cost.tokens'], 'NOT_RECORDED');
  assert.equal(row.availability['manifest.cost.screens'], 'RECORDED');
  assert.equal(row.payload_sha256, payloadHash(row));
  assert.equal(row.source_pointers.execution_outcome, 'report.execution_outcome');
});

test('treats explicit NOT_RECORDED sentinels as unavailable, not IDs', () => {
  const source = input(); source.manifest.app_id = 'NOT_RECORDED'; source.manifest.cost.time = 'NOT_RECORDED';
  source.report.aggregate_eligibility = 'PENDING_VALIDATION';
  const row = buildEnvelope(source);
  assert.equal(row.app_id, null);
  assert.equal(row.availability.app_id, 'NOT_RECORDED');
  assert.equal(row.availability['manifest.cost.time'], 'NOT_RECORDED');
});

test('rejects manifest/report ID mismatch', () => {
  const bad = input(); bad.report.run.id = 'guessed-other';
  assert.throws(() => buildEnvelope(bad), /run ID mismatch/);
});

test('rejects guessed app/comparison pairing for ELIGIBLE research', () => {
  const bad = input(); delete bad.manifest.app_id; delete bad.manifest.comparison_id;
  assert.throws(() => buildEnvelope(bad), /ELIGIBLE requires explicit app_id and comparison_id/);
  const row = buildEnvelope({ ...bad, report: { ...bad.report, aggregate_eligibility: 'PENDING_VALIDATION' } });
  assert.equal(row.app_id, null); assert.equal(row.comparison_id, null);
  assert.equal(row.availability.app_id, 'NOT_RECORDED');
});

test('rejects unsupported execution, integrity, eligibility, and experiment statuses', () => {
  for (const [field, value] of [['execution_outcome', 'MAYBE'], ['integrity_verdict', 'TRUST_ME'], ['aggregate_eligibility', 'YES'], ['experiment_kind', 'DEMO']]) {
    const bad = input(); bad.report[field] = value;
    assert.throws(() => buildEnvelope(bad), new RegExp(`unsupported ${field}`));
  }
});

test('trial is never eligible, even with a clean run outcome', () => {
  const bad = input(); bad.report.experiment_kind = 'TRIAL';
  assert.throws(() => buildEnvelope(bad), /trial cannot be ELIGIBLE/);
});

test('missing eligibility and experiment kind remain pending validation', () => {
  const source = input(); delete source.report.experiment_kind; delete source.report.aggregate_eligibility;
  const row = buildEnvelope(source);
  assert.equal(row.experiment_kind, 'PENDING_VALIDATION');
  assert.equal(row.aggregate_eligibility, 'PENDING_VALIDATION');
});

test('maps legacy contaminated result to integrity, not execution success', () => {
  const source = input();
  delete source.report.experiment_kind; delete source.report.execution_outcome;
  delete source.report.integrity_verdict; delete source.report.aggregate_eligibility;
  source.report.result = { verdict: 'CONTAMINATED' };
  const row = buildEnvelope(source);
  assert.equal(row.execution_outcome, 'NOT_RECORDED');
  assert.equal(row.integrity_verdict, 'CONTAMINATED');
  assert.equal(row.source_pointers.integrity_verdict, 'report.result.verdict');
});

test('rejects malformed roots and source hashes', () => {
  assert.throws(() => buildEnvelope(null), /input must be an object/);
  for (const value of [null, false, []]) assert.throws(() => buildEnvelope({ ...input(), manifest: value }), /manifest root must be an object/);
  assert.throws(() => buildEnvelope(input({ report_sha256: 'not-a-hash' })), /report_sha256/);
});

test('rejects malformed envelope fields and source availability statuses', () => {
  const row = buildEnvelope(input());
  assert.ok(validateEnvelope({ ...row, schema_version: '9.0' }).includes('unsupported schema_version'));
  assert.ok(validateEnvelope({ ...row, availability: { tokens: 'ZERO_WHEN_MISSING' } }).some((e) => e.includes('availability.tokens')));
  assert.ok(validateEnvelope({ ...row, payload_sha256: 'b'.repeat(64) }).includes('payload_sha256 mismatch'));
});

test('canonical hash excludes its own hash and server timestamps only', () => {
  const row = buildEnvelope(input());
  const changed = { ...row, payload_sha256: 'b'.repeat(64), created_at: 'server-a' };
  assert.equal(payloadHash(row), payloadHash(changed));
  assert.notEqual(payloadHash(row), payloadHash({ ...row, run_id: 'run-2' }));
  assert.equal(hashInput(row).created_at, undefined);
});

test('canonical JSON is stable across key insertion order', () => {
  const row = buildEnvelope(input());
  const reordered = Object.fromEntries(Object.entries(row).reverse());
  assert.equal(payloadHash(row), payloadHash(reordered));
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(hashInput(row))).digest('hex'), row.payload_sha256);
});
