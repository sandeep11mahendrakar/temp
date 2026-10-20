'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluate, format } = require('./trialReadiness');

test('missing prerequisites block local readiness', () => {
  const r = evaluate({ p4_1: false, p1_1: false, t2_pre: false, h3: false, subRelease: false, executor: false, env: {} });
  assert.equal(r.local, 'BLOCKED');
  assert.equal(r.upload, 'BLOCKED');
});

test('available files alone do not authorize live run', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  fs.mkdirSync(path.join(root, 'vision'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vision', 'runVision.js'), '');
  const r = evaluate({ root, p4_1: true, p1_1: true, t2_pre: true, h3: false, subRelease: false, env: {} });
  assert.equal(r.local, 'BLOCKED');
  assert.match(format(r), /h3=BLOCKED/);
});

test('local readiness does not imply upload readiness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tr2-'));
  fs.mkdirSync(path.join(root, 'vision'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vision', 'runVision.js'), '');
  const r = evaluate({ root, p4_1: true, p1_1: true, t2_pre: true, h3: true, subRelease: true, db5Tv1: false, h8: false, env: { SUPABASE_URL: 'x', SUPABASE_SERVICE_KEY: 'y' }, ownerRef: 'ref', targetRef: 'ref' });
  assert.equal(r.local, 'READY');
  assert.equal(r.upload, 'BLOCKED');
});

test('fake secret values never appear in output', () => {
  const r = evaluate({ env: { SUPABASE_SERVICE_KEY: 'sb_secret_FAKE' } });
  const text = format(r);
  assert.doesNotMatch(text, /sb_secret_/);
});
