'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluate, format, loadOwnerRef, main, parseOwnerRef } = require('./credPreflight');

const FAKE_ENV = {
  SUPABASE_URL: 'https://fake-project.supabase.test',
  SUPABASE_SERVICE_KEY: 'FAKE_SECRET_VALUE_MUST_NOT_LEAK_123456',
};

test('present fake env and matching injected refs produce config-only readiness without values', () => {
  const result = evaluate({ env: FAKE_ENV, ownerRef: 'fake-project-ref', targetRef: 'fake-project-ref' });
  const output = format(result);
  assert.equal(result.ok, true);
  assert.equal(result.decision, 'READY_CONFIG_ONLY');
  assert.equal(result.reachability, 'SKIPPED(no network)');
  assert.match(output, /env SUPABASE_URL=present length=\d+/);
  assert.match(output, /env SUPABASE_SERVICE_KEY=present length=\d+/);
  assert.doesNotMatch(output, /fake-project\.supabase\.test|FAKE_SECRET_VALUE/);
});

test('missing required env name fails closed and prints no present value', () => {
  const result = evaluate({ env: { SUPABASE_SERVICE_KEY: FAKE_ENV.SUPABASE_SERVICE_KEY }, ownerRef: 'same-ref', targetRef: 'same-ref' });
  const output = format(result);
  assert.equal(result.ok, false);
  assert.equal(result.decision, 'STOP');
  assert.match(output, /SUPABASE_URL=absent length=0/);
  assert.doesNotMatch(output, /FAKE_SECRET_VALUE/);
});

test('missing owner file, malformed owner ref, and target mismatch stop', () => {
  assert.equal(loadOwnerRef('does-not-exist-owner-target.json').ok, false);
  assert.equal(parseOwnerRef('{"project":"wrong-field"}'), null);
  const malformed = evaluate({ env: FAKE_ENV, ownerRef: null, targetRef: 'fake-project-ref' });
  const mismatch = evaluate({ env: FAKE_ENV, ownerRef: 'owner-ref', targetRef: 'other-ref' });
  assert.equal(malformed.targetStatus, 'STOP(owner-ref-missing)');
  assert.equal(mismatch.targetStatus, 'STOP(ref-mismatch)');
  assert.equal(malformed.ok, false);
  assert.equal(mismatch.ok, false);
});

test('owner file through a parent junction escaping the project is refused', () => {
  const projectFixture = fs.mkdtempSync(path.join(__dirname, '.cred-preflight-junction-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-preflight-outside-'));
  const junction = path.join(projectFixture, 'redirect');
  try {
    fs.writeFileSync(path.join(outside, 'owner-target.json'), '{"project_ref":"outside-ref"}', 'utf8');
    fs.symlinkSync(outside, junction, 'junction');
    const relative = path.relative(path.resolve(__dirname, '..'), path.join(junction, 'owner-target.json'));
    const outsideFile = path.resolve(outside, 'owner-target.json');
    const originalReadFileSync = fs.readFileSync;
    let outsideBytesRead = false;
    fs.readFileSync = function (file, ...args) {
      if (path.resolve(String(file)) === outsideFile) outsideBytesRead = true;
      return originalReadFileSync.call(this, file, ...args);
    };
    let result;
    try { result = loadOwnerRef(relative); }
    finally { fs.readFileSync = originalReadFileSync; }
    assert.deepEqual(result, { ok: false, reason: 'owner target input escapes project root' });
    assert.equal(outsideBytesRead, false);
    assert.doesNotMatch(JSON.stringify(result), /outside-ref/);
  } finally {
    fs.rmSync(junction, { recursive: false, force: true });
    fs.rmSync(projectFixture, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('owner file parser accepts a project_ref field without exposing its contents', () => {
  assert.equal(parseOwnerRef('{"project_ref":"synthetic-owner-ref"}'), 'synthetic-owner-ref');
  assert.equal(parseOwnerRef('project_ref=synthetic-owner-ref'), 'synthetic-owner-ref');
  assert.equal(parseOwnerRef('project_ref=bad value'), null);
});

test('CLI emits only fake env metadata, matching status, and explicit no-network skip', () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    const code = main(['--owner-target-file', 'owner-input.local', '--target-ref', 'fake-project-ref'], {
      env: FAKE_ENV,
      loadOwnerRef: () => ({ ok: true, ownerRef: 'fake-project-ref' }),
    });
    assert.equal(code, 0);
  } finally {
    console.log = originalLog;
  }
  const output = lines.join('\n');
  assert.match(output, /target=MATCH/);
  assert.match(output, /reachability=SKIPPED\(no network\)/);
  assert.doesNotMatch(output, /fake-project\.supabase\.test|FAKE_SECRET_VALUE|fake-project-ref/);
});
