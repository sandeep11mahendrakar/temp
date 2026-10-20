'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { generateReport } = require('./trialReport');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-report-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = path.join(root, 'runs', 'trial-clean');
  fs.mkdirSync(run, { recursive: true });
  const report = {
    schema_version: '1.0', experiment_kind: 'TRIAL', citable: false, aggregate_eligibility: 'EXCLUDED',
    run: { id: 'trial-clean' }, result: { verdict: options.verdict || 'PASS', cause_class: options.cause || 'NONE' },
    integrity: { verdict: 'CLEAN' }, cases: [{ id: 'case-1', verdict: options.verdict || 'PASS' }],
    telemetry: { duration_ms: 1200 },
  };
  const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(path.join(run, 'report.json'), reportBytes);
  const manifest = {
    run_id: 'trial-clean', started: '2026-10-19T10:00:00Z', ended: '2026-10-19T10:00:01Z', label: 'TRIAL',
    citable: false, aggregate_eligibility: 'EXCLUDED', cost: { time: 1200, calls: 3, tokens: null, screens: 2 },
    artifacts: [{ path: 'report.json', bytes: Buffer.byteLength(reportBytes), sha256: crypto.createHash('sha256').update(reportBytes).digest('hex') }],
  };
  const manifestPath = path.join(run, 'manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const row = {
    run_id: 'trial-clean',
    manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex'),
    report_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(run, 'report.json'))).digest('hex'),
    storage_status: 'LOCAL_ONLY',
  };
  const readbackPath = path.join(root, 'readback.json');
  fs.writeFileSync(readbackPath, `${JSON.stringify([row], null, 2)}\n`);
  return { root, manifestPath: path.relative(root, manifestPath), readbackPath: path.relative(root, readbackPath), run, report, manifest };
}

function refreshVerdictFixture(f) {
  const reportBytes = JSON.stringify(f.report) + '\n';
  fs.writeFileSync(path.join(f.run, 'report.json'), reportBytes);
  f.manifest.artifacts[0] = { path: 'report.json', bytes: Buffer.byteLength(reportBytes),
    sha256: crypto.createHash('sha256').update(reportBytes).digest('hex') };
  const manifestBytes = JSON.stringify(f.manifest) + '\n';
  fs.writeFileSync(path.join(f.run, 'manifest.json'), manifestBytes);
  fs.writeFileSync(path.join(f.root, f.readbackPath), JSON.stringify([{
    run_id: f.manifest.run_id, storage_status: 'LOCAL_ONLY',
    manifest_sha256: crypto.createHash('sha256').update(manifestBytes).digest('hex'),
    report_sha256: crypto.createHash('sha256').update(reportBytes).digest('hex'),
  }]));
}

test('NEG unknown run verdict prevents GO despite CLEAN integrity and valid readback', (t) => {
  const f = fixture(t);
  for (const value of [undefined, null, '', 'NOT_RECORDED', 'UNKNOWN', 'PENDING_VALIDATION', 'INVENTED']) {
    f.report.result.verdict = value;
    refreshVerdictFixture(f);
    const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
    assert.equal(result.ok, false);
    assert.match(result.text, /run verdict missing_or_unknown/);
  }
});

test('NEG unknown case verdict prevents GO even with recorded run PASS', (t) => {
  const f = fixture(t);
  for (const value of [undefined, null, '', 'NOT_RECORDED', 'UNKNOWN', 'INVENTED']) {
    f.report.cases[0].verdict = value;
    refreshVerdictFixture(f);
    const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
    assert.equal(result.ok, false);
    assert.match(result.text, /case\[0\] verdict missing_or_unknown/);
  }
});

test('NEG empty or malformed case list never produces GO', (t) => {
  const f = fixture(t);
  for (const cases of [[], null, {}]) {
    f.report.cases = cases;
    refreshVerdictFixture(f);
    const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
    assert.equal(result.ok, false);
    assert.match(result.text, /case verdicts absent/);
  }
});

test('NEG BLOCKED and FAIL without meaningful cause cannot produce GO', (t) => {
  const f = fixture(t);
  for (const verdict of ['BLOCKED', 'FAIL']) {
    f.report.result = { verdict, cause_class: 'NONE' };
    f.report.cases = [{ id: 'case-1', verdict }];
    refreshVerdictFixture(f);
    const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
    assert.equal(result.ok, false);
    assert.match(result.text, /run cause missing_or_unknown/);
    assert.match(result.text, /case\[0\] cause missing_or_unknown/);
  }
});

test('NEG recorded run cause cannot conceal missing failure case cause', (t) => {
  const f = fixture(t, { verdict: 'BLOCKED', cause: 'BOT_CHALLENGE' });
  refreshVerdictFixture(f);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /case\[0\] cause missing_or_unknown/);
});

test('NEG case cause cannot substitute for missing run-level cause', (t) => {
  const f = fixture(t);
  f.report.result = { verdict: 'BLOCKED' };
  f.report.cases = [{ id: 'case-1', verdict: 'BLOCKED', cause: 'BOT_CHALLENGE' }];
  refreshVerdictFixture(f);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /run cause missing_or_unknown/);
});

test('NEG non-string run cause leaves cannot be coerced into recorded causes', (t) => {
  const f = fixture(t);
  for (const leaf of [{}, [], 1, true]) {
    f.report.result = { verdict: 'BLOCKED', cause: { code: leaf } };
    f.report.cases = [{ id: 'case-1', verdict: 'BLOCKED', cause: 'BOT_CHALLENGE' }];
    refreshVerdictFixture(f);
    const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
    assert.equal(result.ok, false);
    assert.match(result.text, /run cause missing_or_unknown/);
    assert.equal(result.text.includes('[object Object]'), false);
  }
});

test('POS genuine BLOCKED with recorded run and case causes is reviewable without becoming PASS', (t) => {
  const f = fixture(t, { verdict: 'BLOCKED', cause: 'BOT_CHALLENGE' });
  f.report.cases[0].cause = { code: 'BOT_CHALLENGE' };
  refreshVerdictFixture(f);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, true);
  assert.match(result.text, /\| trial-clean \| BLOCKED \| BOT_CHALLENGE/);
});

function refreshEvidenceFixture(f, evidence, declared = true) {
  f.report.cases[0].evid_paths = ['shot.png'];
  fs.writeFileSync(path.join(f.run, 'report.json'), JSON.stringify(f.report) + '\n');
  const reportBytes = fs.readFileSync(path.join(f.run, 'report.json'));
  f.manifest.artifacts[0] = {
    path: 'report.json', bytes: reportBytes.length,
    sha256: crypto.createHash('sha256').update(reportBytes).digest('hex'),
  };
  if (evidence !== null) fs.writeFileSync(path.join(f.run, 'shot.png'), evidence);
  if (declared) f.manifest.artifacts.push({
    path: 'shot.png', bytes: 4, sha256: crypto.createHash('sha256').update('shot').digest('hex'),
  });
  fs.writeFileSync(path.join(f.run, 'manifest.json'), JSON.stringify(f.manifest) + '\n');
  fs.writeFileSync(path.join(f.root, f.readbackPath), JSON.stringify([{
    run_id: f.manifest.run_id, storage_status: 'LOCAL_ONLY',
    manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(f.run, 'manifest.json'))).digest('hex'),
    report_sha256: crypto.createHash('sha256').update(reportBytes).digest('hex'),
  }]));
}

test('REGRESSION missing declared case screenshot prevents GO despite matching readback', (t) => {
  const f = fixture(t);
  refreshEvidenceFixture(f, null);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /artifact shot.png missing_or_invalid/);
});

test('POS retained and hashed case evidence permits review-only GO', (t) => {
  const f = fixture(t);
  refreshEvidenceFixture(f, 'shot');
  assert.equal(generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath }).ok, true);
});

test('NEG same-length tampered case evidence prevents GO', (t) => {
  const f = fixture(t);
  refreshEvidenceFixture(f, 'fake');
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /artifact shot.png missing_or_invalid/);
});

test('NEG existing but unlisted case evidence prevents GO', (t) => {
  const f = fixture(t);
  refreshEvidenceFixture(f, 'shot', false);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /case evidence unlisted/);
});

const evidenceMarkers = [
  ['opaque', 'sb' + '_secret_' + 'FAKE_ONLY'],
  ['role', ['service', 'role'].join('_')],
  ['jwt', 'ey' + 'Jsynthetic'],
  ['api', 'AI' + 'za' + '0'.repeat(35)],
];
for (const [label, marker] of evidenceMarkers) {
  test(`REGRESSION ${label} marker in correctly hashed evidence bytes rejects GO without echo`, (t) => {
    const f = fixture(t);
    refreshEvidenceFixture(f, 'shot');
    const bytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(marker)]);
    fs.writeFileSync(path.join(f.run, 'shot.png'), bytes);
    f.manifest.artifacts[1].bytes = bytes.length;
    f.manifest.artifacts[1].sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const manifestBytes = JSON.stringify(f.manifest) + '\n';
    fs.writeFileSync(path.join(f.run, 'manifest.json'), manifestBytes);
    const rowFile = path.join(f.root, f.readbackPath);
    const rows = JSON.parse(fs.readFileSync(rowFile, 'utf8'));
    rows[0].manifest_sha256 = crypto.createHash('sha256').update(manifestBytes).digest('hex');
    fs.writeFileSync(rowFile, JSON.stringify(rows));
    const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
    assert.equal(result.ok, false);
    assert.equal(result.gapCount, 0, 'hashes, schema and evidence remain valid; secret alone must prevent GO');
    assert.match(result.text, /Secret status=FAIL/);
    assert.match(result.text, /Recommendation=NO-GO/);
    assert.equal(result.text.includes(marker), false);
  });
}

test('POS renders artifact-backed trial row with citations and review-only GO', (t) => {
  const f = fixture(t);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, true);
  assert.match(result.text, /TRIAL \| citable:false/);
  assert.match(result.text, /1200 \(runs\/trial-clean\/manifest\.json:cost\.time\)/);
  assert.match(result.text, /3 \(runs\/trial-clean\/manifest\.json:cost\.calls\)/);
  assert.match(result.text, /NONE \(manifest\/report artifacts inspected\)/);
  assert.match(result.text, /GO for independent T-4\/TV-4 review only/);
  assert.ok(result.lines <= 60);
});

test('NEG missing manifest/readback is NOT_RECORDED and fails without fake values', (t) => {
  const f = fixture(t);
  const result = generateReport({ root: f.root, manifests: ['runs/missing/manifest.json'], readback: 'missing-rows.json' });
  assert.equal(result.ok, false);
  assert.match(result.text, /NOT_RECORDED/);
  assert.match(result.text, /NO-GO; required evidence missing or invalid/);
  const missingRow = result.text.split('\n').find((line) => line.includes('runs/missing/manifest.json'));
  assert.equal(missingRow.split('|').length - 2, 10);
  assert.match(result.text, /Storage status=NOT_RECORDED/);
  assert.doesNotMatch(result.text, /\| 0 \|/);
});

test('REGRESSION missing manifest row has 10 cells and storage remains NOT_RECORDED', (t) => {
  const f = fixture(t);
  const result = generateReport({ root: f.root, manifests: ['runs/absent/manifest.json'], readback: f.readbackPath });
  const row = result.text.split('\n').find((line) => line.includes('runs/absent/manifest.json'));
  assert.equal(result.ok, false);
  assert.equal(row.split('|').length - 2, 10);
  assert.match(row, /NOT_RECORDED/);
  assert.match(result.text, /Storage status=NOT_RECORDED/);
  assert.match(result.text, /Recommendation=NO-GO/);
});

test('NEG readback identity/hash fields missing prevents GO', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, f.readbackPath), JSON.stringify([{ run_id: 'trial-clean' }]));
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /\| FAIL \|/);
  assert.match(result.text, /NO-GO/);
});

test('NEG declared readback hashes that differ from retained bytes prevent GO', (t) => {
  const f = fixture(t);
  const changed = [{ run_id: 'trial-clean', manifest_sha256: 'a'.repeat(64), report_sha256: 'b'.repeat(64), storage_status: 'LOCAL_ONLY' }];
  fs.writeFileSync(path.join(f.root, f.readbackPath), JSON.stringify(changed));
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /readback hashes missing_or_mismatch/);
});

test('POS preserves failure cause class and never rewrites a failed outcome as PASS', (t) => {
  const f = fixture(t, { verdict: 'BLOCKED', cause: 'BOT_CHALLENGE' });
  fs.writeFileSync(path.join(f.run, 'report.json'), `${JSON.stringify(f.report, null, 2)}\n`);
  const m = JSON.parse(fs.readFileSync(path.join(f.run, 'manifest.json'), 'utf8'));
  const bytes = fs.readFileSync(path.join(f.run, 'report.json'));
  m.artifacts[0].bytes = bytes.length;
  m.artifacts[0].sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(f.run, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.match(result.text, /\| trial-clean \| BLOCKED \| BOT_CHALLENGE \|/);
});

test('NEG secret marker is reported by status only and never echoed', (t) => {
  const f = fixture(t);
  f.manifest.synthetic = { nested: 'sb_secret_FAKE_ONLY' };
  fs.writeFileSync(path.join(f.run, 'manifest.json'), `${JSON.stringify(f.manifest, null, 2)}\n`);
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /Secret status=FAIL \(marker detected; value withheld\)/);
  assert.doesNotMatch(result.text, /sb_secret_/);
});

test('CLI materializes and reads a DB-6 authored fixture without claiming a live run', (t) => {
  const f = fixture(t);
  const db6 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'db-trial', 'blocked.json'), 'utf8'));
  const report = db6.input.report;
  const reportFile = path.join(f.run, 'report.json');
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  const manifest = { ...db6.input.manifest, artifacts: [{ path: 'report.json', bytes: fs.statSync(reportFile).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(reportFile)).digest('hex') }] };
  fs.writeFileSync(path.join(f.run, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(f.root, f.readbackPath), JSON.stringify([{ run_id: manifest.run_id, manifest_sha256: 'c'.repeat(64), report_sha256: 'd'.repeat(64) }]));
  const output = path.join(f.root, 'trial-report.md');
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'trialReport.js'), '--manifest', f.manifestPath, '--readback', f.readbackPath, '--output', output], { cwd: f.root, encoding: 'utf8' });
  assert.equal(cli.status, 1, cli.stderr || cli.stdout);
  const rendered = fs.readFileSync(output, 'utf8');
  assert.match(rendered, /BLOCKED/);
  assert.match(rendered, /TRIAL \| citable:false/);
  assert.doesNotMatch(rendered, /GO for independent/);
});
test('NEG contradictory experiment_kind (TRIAL manifest / RESEARCH report) fails', (t) => {
  const f = fixture(t);
  const report = JSON.parse(fs.readFileSync(path.join(f.run, 'report.json'), 'utf8'));
  report.experiment_kind = 'RESEARCH';
  fs.writeFileSync(path.join(f.run, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const bytes = fs.readFileSync(path.join(f.run, 'report.json'));
  const m = JSON.parse(fs.readFileSync(path.join(f.run, 'manifest.json'), 'utf8'));
  m.artifacts[0].bytes = bytes.length;
  m.artifacts[0].sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(f.run, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.equal(result.ok, false);
  assert.match(result.text, /contradictory experiment_kind/);
});

test('POS cause from cases[].cause string and object block', (t) => {
  const f = fixture(t);
  const report = JSON.parse(fs.readFileSync(path.join(f.run, 'report.json'), 'utf8'));
  report.result = { verdict: 'BLOCKED' };
  report.cases = [{ id: 'case-1', verdict: 'BLOCKED', tc_source: 'fixture', label: 'ASSISTED', cause: 'BOT_CHALLENGE', evid_paths: ['evidence.json'] }];
  fs.writeFileSync(path.join(f.run, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const bytes = fs.readFileSync(path.join(f.run, 'report.json'));
  const m = JSON.parse(fs.readFileSync(path.join(f.run, 'manifest.json'), 'utf8'));
  m.artifacts[0].bytes = bytes.length;
  m.artifacts[0].sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(f.run, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const result = generateReport({ root: f.root, manifests: [f.manifestPath], readback: f.readbackPath });
  assert.match(result.text, /\| trial-clean \| BLOCKED \| BOT_CHALLENGE \|/);
});
