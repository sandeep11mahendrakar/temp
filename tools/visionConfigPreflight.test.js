'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkPreflight, loadEnv, parseEnv } = require('./visionConfigPreflight');

test('presence only, no values', () => {
  const r = checkPreflight({ SEED_USERNAME: 'u', SEED_PASSWORD: '' });
  assert.equal(r.SEED_USERNAME, 'Y');
  assert.equal(r.SEED_PASSWORD, 'N');
  assert.doesNotMatch(JSON.stringify(r), /'u'|"u"/);
});

test('NEG: missing env returns N', () => {
  const r = checkPreflight({});
  assert.equal(r.SEED_USERNAME, 'N');
  assert.equal(r.SEED_PASSWORD, 'N');
});

test('NEG: whitespace-only values count as absent', () => {
  const r = checkPreflight({ SEED_USERNAME: '   ', SEED_PASSWORD: '\t' });
  assert.equal(r.SEED_USERNAME, 'N');
  assert.equal(r.SEED_PASSWORD, 'N');
});

test('parseEnv reads plain, quoted, and commented lines', () => {
  const parsed = parseEnv('# comment\nA=1\nB="two"\nC=\'three\'\nBAD LINE\n9BAD=x\n');
  assert.equal(parsed.A, '1');
  assert.equal(parsed.B, 'two');
  assert.equal(parsed.C, 'three');
  assert.equal(parsed['BAD LINE'], undefined);
  assert.equal(parsed['9BAD'], undefined);
});

test('loadEnv reads vision/.env from the given cwd', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-'));
  fs.mkdirSync(path.join(root, 'vision'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vision', '.env'), 'SEED_USERNAME=alpha\nSEED_PASSWORD=beta\n');
  const env = {};
  const res = loadEnv(root, env);
  assert.equal(res.loaded, true);
  assert.equal(env.SEED_USERNAME, 'alpha');
  assert.equal(env.SEED_PASSWORD, 'beta');
  fs.rmSync(root, { recursive: true, force: true });
});

test('NEG: loadEnv on a cwd without vision/.env loads nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-'));
  const env = {};
  const res = loadEnv(root, env);
  assert.equal(res.loaded, false);
  assert.equal(env.SEED_USERNAME, undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

test('NEG: loadEnv does not overwrite an existing process value', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vcp-'));
  fs.mkdirSync(path.join(root, 'vision'), { recursive: true });
  fs.writeFileSync(path.join(root, 'vision', '.env'), 'SEED_USERNAME=fromfile\n');
  const env = { SEED_USERNAME: 'fromprocess' };
  loadEnv(root, env);
  assert.equal(env.SEED_USERNAME, 'fromprocess');
  fs.rmSync(root, { recursive: true, force: true });
});

test('checkPreflight never echoes a value', () => {
  const r = checkPreflight({ SEED_USERNAME: 'super-secret-user', SEED_PASSWORD: 'super-secret-pass' });
  assert.equal(r.SEED_USERNAME, 'Y');
  assert.equal(r.SEED_PASSWORD, 'Y');
  assert.doesNotMatch(JSON.stringify(r), /super-secret/);
});
