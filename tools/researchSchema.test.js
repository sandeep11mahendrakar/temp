'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validate, summary } = require('./researchSchema');

function copySample(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.resolve('runs/schema-clean'), root, { recursive: true });
  return root;
}

test('validates clean/blocked/contaminated archives', () => {
  for (const sample of ['clean', 'blocked', 'contaminated']) {
    const result = validate(path.resolve(`runs/schema-${sample}`));
    assert.equal(result.ok, true, `${sample}: ${result.errors.join(', ')}`);
  }
});

test('rejects blank required strings and null case labels', (t) => {
  const root = copySample(t);
  const mp = path.join(root, 'manifest.json'); const rp = path.join(root, 'report.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')); m.model_id = '';
  const r = JSON.parse(fs.readFileSync(rp, 'utf8')); r.cases[0].label = null;
  fs.writeFileSync(mp, JSON.stringify(m)); fs.writeFileSync(rp, JSON.stringify(r));
  const result = validate(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('manifest model_id must be non-empty text or NOT_RECORDED'));
  assert.ok(result.errors.includes('case[0] label must be non-empty text'));
});

test('preserves valid dirty=false in generated summary', (t) => {
  const root = copySample(t); const mp = path.join(root, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')); m.dirty = false;
  fs.writeFileSync(mp, JSON.stringify(m));
  const result = validate(root); assert.equal(result.ok, true, result.errors.join(', '));
  assert.match(summary(result, result), /HEAD\/dirty: NOT_RECORDED \/ false/);
});

test('rejects malformed manifest count and evidence-path values', (t) => {
  const root = copySample(t);
  const mp = path.join(root, 'manifest.json'); const rp = path.join(root, 'report.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8')); m.cost.calls = -1;
  const r = JSON.parse(fs.readFileSync(rp, 'utf8')); r.cases[0].evid_paths = [null];
  fs.writeFileSync(mp, JSON.stringify(m)); fs.writeFileSync(rp, JSON.stringify(r));
  const result = validate(root);
  assert.ok(result.errors.includes('cost.calls must be a non-negative number or NOT_RECORDED'));
  assert.ok(result.errors.includes('case[0] evid_paths must be non-empty string[]'));
});

test('rejects null, false, and array roots for manifest and report', (t) => {
  const cli = path.resolve('tools/researchSchema.js');
  for (const file of ['manifest.json', 'report.json']) {
    for (const value of [null, false, []]) {
      const root = copySample(t);
      fs.writeFileSync(path.join(root, file), JSON.stringify(value));
      const result = validate(root);
      assert.equal(result.ok, false, `${file}=${JSON.stringify(value)} was accepted`);
      assert.ok(result.errors.includes(`${file === 'manifest.json' ? 'manifest' : 'report'} root must be object`));
      const cliResult = spawnSync(process.execPath, [cli, 'validate', root], { encoding: 'utf8' });
      assert.equal(cliResult.status, 1, `${file}=${JSON.stringify(value)} CLI output: ${cliResult.stdout}${cliResult.stderr}`);
      assert.match(cliResult.stdout, /VALIDATE FAIL/);
    }
  }
});
