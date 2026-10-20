'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verify, scanSecrets, dedupRows } = require('./trialVerifier');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
function tmpFile(content) {
  const p = path.join(os.tmpdir(), 'tv-' + Math.random().toString(36).slice(2) + '.txt');
  fs.writeFileSync(p, content);
  return { path: p, hash: crypto.createHash('sha256').update(content).digest('hex') };
}
test('POS valid manifest and readback passes all checks', () => {
  const f1 = tmpFile('hello1');
  const f2 = tmpFile('hello2');
  const manifest = { run_count: 2, runs: [
    { run_id: 'r1', target_file: f1.path, sha256: f1.hash, platform: 'web', schema: '1.0' },
    { run_id: 'r2', target_file: f2.path, sha256: f2.hash, platform: 'web', schema: '1.0' },
  ] };
  const rows = [
    { run_id: 'r1', target_file: f1.path, sha256: f1.hash, eligibility: 'eligible', platform: 'web', schema: '1.0' },
    { run_id: 'r2', target_file: f2.path, sha256: f2.hash, eligibility: 'eligible', platform: 'web', schema: '1.0' },
  ];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, true);
  assert.equal(r.counts.readback_rows, 2);
});

test('NEG GAP-1 row field missing but in manifest rejected', () => {
  const f = tmpFile('hello');
  const manifest = { runs: [{ run_id: 'r1', target_file: f.path, sha256: f.hash, platform: 'web' }] };
  const rows = [{ run_id: 'r1', target_file: f.path, sha256: f.hash, eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG GAP-2 row extra differing field manifest lacks rejected', () => {
  const f = tmpFile('hello');
  const manifest = { runs: [{ run_id: 'r1', target_file: f.path, sha256: f.hash }] };
  const rows = [{ run_id: 'r1', target_file: f.path, sha256: f.hash, eligibility: 'eligible', extra: 'x' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG GAP-3 missing target file rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', sha256: A }] };
  const rows = [{ run_id: 'r1', sha256: A, eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG hash mismatch rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [{ run_id: 'r1', sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'target_file_sha256_equals_manifest_row_hash');
  assert.equal(c.pass, false);
});

test('NEG duplicate run_id rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [
    { run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible' },
    { run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible' },
  ];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'duplicate_run_id_collapsed_to_one_row');
  assert.equal(c.pass, false);
  const c2 = r.checks.find((x) => x.name === 'readback_row_count_equals_manifest_run_count');
  assert.equal(c2.pass, false);
});

test('NEG conflicting same run_id hash rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [
    { run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible' },
    { run_id: 'r1', sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', eligibility: 'eligible' },
  ];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'duplicate_run_id_collapsed_to_one_row');
  assert.equal(c.pass, false);
});

test('NEG missing run_id rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [{ sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG missing hash rejected', () => {
  const manifest = { runs: [{ run_id: 'r1' }] };
  const rows = [{ run_id: 'r1', eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG fake SHA rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'notahash' }] };
  const rows = [{ run_id: 'r1', sha256: 'notahash', eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG missing target file rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', target_file: 'nope.txt', sha256: 'a'.repeat(64) }] };
  const rows = [{ run_id: 'r1', target_file: 'nope.txt', sha256: 'a'.repeat(64), eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG app_id mismatch rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', sha256: A, app_id: 'x' }] };
  const rows = [{ run_id: 'r1', sha256: A, eligibility: 'eligible', app_id: 'y' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG orphan row rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', sha256: A }] };
  const rows = [{ run_id: 'r2', sha256: A, eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG target_file metadata mismatch rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', sha256: A, target_file: 'a.txt' }] };
  const rows = [{ run_id: 'r1', sha256: A, eligibility: 'eligible', target_file: 'b.txt' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG platform mismatch rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', sha256: A, platform: 'web' }] };
  const rows = [{ run_id: 'r1', sha256: A, eligibility: 'eligible', platform: 'mobile' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG nested object mismatch rejected', () => {
  const f = tmpFile('hello');
  const manifest = { runs: [{ run_id: 'r1', target_file: f.path, sha256: f.hash, meta: { a: 1 } }] };
  const rows = [{ run_id: 'r1', target_file: f.path, sha256: f.hash, eligibility: 'eligible', meta: { a: 2 } }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG directory target file rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', target_file: os.tmpdir(), sha256: A }] };
  const rows = [{ run_id: 'r1', target_file: os.tmpdir(), sha256: A, eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG schema mismatch rejected', () => {
  const A = 'a'.repeat(64);
  const manifest = { runs: [{ run_id: 'r1', sha256: A, schema: '1.0' }] };
  const rows = [{ run_id: 'r1', sha256: A, eligibility: 'eligible', schema: '2.0' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG blocked row inside eligible set rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'BLOCKED', eligible: true }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'eligibility_excludes_blocked_and_partial_rows');
  assert.equal(c.pass, false);
});

test('NEG top-level eligible list containing blocked row rejected', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'BLOCKED' }];
  const r = verify({ manifest, rows, eligible: ['r1'] });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'eligibility_excludes_blocked_and_partial_rows');
  assert.equal(c.pass, false);
});

test('NEG secret marker present fails scan', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible', note: 'service_role leaked' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'payload_secret_scan_counts_only');
  assert.equal(c.pass, false);
  assert.ok(r.secret_total > 0);
});

test('scanSecrets counts only no text', () => {
  const out = scanSecrets({ a: 'eyJabc sb_secret_ x', b: 'service_role' });
  assert.equal(out.counts.eyJ, 1);
  assert.equal(out.counts.sb_secret_, 1);
  assert.equal(out.counts.service_role, 1);
  assert.equal(typeof out.total, 'number');
});

test('dedupRows counts duplicates', () => {
  const { unique, duplicates } = dedupRows([{ run_id: 'a' }, { run_id: 'a' }, { run_id: 'b' }]);
  assert.equal(unique.length, 2);
  assert.equal(duplicates, 1);
});

test('NEG readback count mismatch', () => {
  const manifest = { run_count: 2, runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, { run_id: 'r2', sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }] };
  const rows = [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible' }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'readback_row_count_equals_manifest_run_count');
  assert.equal(c.pass, false);
});

test('partial row excluded from eligible pass (NEG)', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }] };
  const rows = [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'partial', eligible: true }];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
});

test('NEG secret marker in different row fails scan', () => {
  const manifest = { runs: [{ run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, { run_id: 'r2', sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }] };
  const rows = [
    { run_id: 'r1', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', eligibility: 'eligible' },
    { run_id: 'r2', sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', eligibility: 'eligible', token: 'eyJsecret' },
  ];
  const r = verify({ manifest, rows });
  assert.equal(r.ok, false);
  const c = r.checks.find((x) => x.name === 'payload_secret_scan_counts_only');
  assert.equal(c.pass, false);
});
