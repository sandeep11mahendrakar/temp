'use strict';

// S0 siteLibrary tests (mock-only, tmp dirs): add/get/list/link-run/validate,
// 4-check validate, third_party refuse/permit logging, no-secret scan, seeds.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lib = require('../src/siteLibrary');

const ROOT = lib.repoRoot();
const SEED_DIR = path.join(ROOT, 'sites');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sitelib-'));
}

const GOOD = {
  id: 'demo-site',
  url: 'https://example.com/app',
  access: 'open',
  cred_env: null,
  truth_ref: null,
  source: 'vision/test/siteLibrary.test.js',
  notes: null,
};

// 1. add: valid site writes file + regenerates index.
test('S0 add: valid site persists + index count 1', () => {
  const d = tmpDir();
  const r = lib.addSite(ROOT, d, { ...GOOD });
  assert.equal(r.ok, true);
  assert.equal(r.index_count, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(d, 'sites.index.json'), 'utf8')).count, 1);
  fs.rmSync(d, { recursive: true, force: true });
});

// 2. validate required-fields: missing url fails.
test('S0 validate: missing url fails required-fields', () => {
  const v = lib.validateSite(ROOT, { ...GOOD, url: null });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /url/.test(e)));
});

// 3. validate access-enum: bogus access fails.
test('S0 validate: bogus access fails enum', () => {
  const v = lib.validateSite(ROOT, { ...GOOD, access: 'vip' });
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /open\|credentialed\|third_party/.test(e)));
});

// 4. validate truth_ref-exists: dangling ref fails, null passes.
test('S0 validate: dangling truth_ref fails, null passes', () => {
  const bad = lib.validateSite(ROOT, { ...GOOD, truth_ref: 'vision/test/truth/nope.json' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /missing on disk/.test(e)));
  assert.equal(lib.validateSite(ROOT, { ...GOOD }).ok, true);
});

// 5. validate no-secrets: AIza + password= + key= all fail.
// NOTE: the AIza-like string is built at runtime ('AI'+'za') so this file
// never carries a scannable AIza[35] literal (secret-scan stays 0).
test('S0 validate: AIza/password=/key= payloads fail', () => {
  const aizaLike = 'AI' + 'za' + 'A'.repeat(35);
  for (const payload of [`x ${aizaLike} y`, 'x password=hunter2 y', 'x key=abc123 y']) {
    const v = lib.validateSite(ROOT, { ...GOOD, notes: payload });
    assert.equal(v.ok, false, payload);
    assert.ok(v.errors.some((e) => /secret-pattern/.test(e)));
  }
});

// 6. cred_env names-only: ENV NAMES pass, raw values fail.
test('S0 validate: cred_env ENV NAMES pass, lowercase values fail', () => {
  const ok = lib.validateSite(ROOT, { ...GOOD, cred_env: { username: 'SAUCEDEMO_USER', password: null } });
  assert.equal(ok.ok, true);
  const bad = lib.validateSite(ROOT, { ...GOOD, cred_env: { username: 'standard_user', password: null } });
  assert.equal(bad.ok, false);
});

// 7. link-run refuse: third_party without --permitted refuses + logs.
test('S0 link-run: third_party unpermitted REFUSES exit-shape + logged', () => {
  const d = tmpDir();
  assert.equal(lib.addSite(ROOT, d, { ...GOOD, id: 'ext', access: 'third_party' }).ok, true);
  const r = lib.linkRun(ROOT, d, { site: 'ext', runId: 'r1', evid: 'docs/INDEX.md', permitted: false });
  assert.equal(r.ok, false);
  assert.equal(r.refused, true);
  assert.ok(/--permitted/.test(r.reason));
  assert.equal(fs.existsSync(path.join(d, 'runs', 'r1.json')), false);
  assert.ok(fs.readFileSync(path.join(d, 'runs.log'), 'utf8').includes('"refused":true'));
  fs.rmSync(d, { recursive: true, force: true });
});

// 8. link-run permit: --permitted records MCP slots + evid_exists.
test('S0 link-run: permitted third_party records mcp slots', () => {
  const d = tmpDir();
  assert.equal(lib.addSite(ROOT, d, { ...GOOD, id: 'ext', access: 'third_party' }).ok, true);
  const r = lib.linkRun(ROOT, d, { site: 'ext', runId: 'r2', evid: 'docs/INDEX.md', permitted: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.record.mcp, { perceive: null, act: null });
  assert.equal(r.record.permitted, true);
  assert.equal(typeof r.record.evid_exists, 'boolean');
  fs.rmSync(d, { recursive: true, force: true });
});

// 9. seeds: exactly 3, urls from repo files, unknowns null.
test('S0 seeds: saucedemo/demoqa/todomvc urls + null unknowns', () => {
  const ids = lib.listSites(SEED_DIR);
  assert.deepEqual(ids, ['demoqa', 'saucedemo', 'todomvc']);
  const get = (id) => lib.loadSite(SEED_DIR, id).site;
  assert.equal(get('saucedemo').url, 'https://www.saucedemo.com');
  assert.equal(get('demoqa').url, 'https://demoqa.com');
  assert.equal(get('todomvc').url, 'https://todomvc.com/examples/react/dist/#/active');
  for (const id of ids) {
    const v = lib.validateSite(ROOT, get(id));
    assert.equal(v.ok, true, `${id}: ${v.errors.join(';')}`);
  }
  assert.equal(get('saucedemo').truth_ref, null);
  assert.equal(get('saucedemo').cred_env, null);
});
// S-1 pinFixture: pinned copy only, no overwrite, path-safe.
test('S-1 pinFixture: refuses overwrite of existing dest', () => {
  const root = lib.repoRoot();
  const scratch = path.join(root, '_S1_SCRATCH');
  fs.mkdirSync(scratch, { recursive: true });
  const srcRel = path.relative(root, path.join(scratch, 'a.txt'));
  const destRel = path.relative(root, path.join(scratch, 'b.txt'));
  fs.writeFileSync(path.join(scratch, 'a.txt'), 'x', 'utf8');
  const r1 = lib.pinFixture(root, srcRel, destRel);
  assert.equal(r1.ok, true);
  const r2 = lib.pinFixture(root, srcRel, destRel);
  assert.equal(r2.ok, false);
  assert.equal(r2.pinned, true);
  fs.rmSync(scratch, { recursive: true, force: true });
});

test('S-1 pinFixture: rejects paths escaping repo root', () => {
  const root = lib.repoRoot();
  const r = lib.pinFixture(root, '../outside.txt', 'inside.txt');
  assert.equal(r.ok, false);
});

test('S-1 pinFixture: missing src returns error', () => {
  const root = lib.repoRoot();
  const r = lib.pinFixture(root, 'definitely/missing/file.txt', 'also/missing/out.txt');
  assert.equal(r.ok, false);
});