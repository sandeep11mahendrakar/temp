'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseArgs, runSelfCheck } = require('./tv1LocalRunner');
function location(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'p59-selftest-'));
  t.after(() => {
    if (process.env.TV1_TEST_EVIDENCE_ROOT && fs.existsSync(path.join(parent, 'evidence'))) {
      const retained = path.join(path.resolve(process.env.TV1_TEST_EVIDENCE_ROOT), path.basename(parent));
      fs.mkdirSync(retained, { recursive: true });
      for (const name of ['run.json', 'notices.json', 'results.json']) {
        const file = path.join(parent, 'evidence', name);
        if (fs.existsSync(file)) fs.writeFileSync(path.join(retained, name), fs.readFileSync(file, 'utf8'), { encoding: 'utf8', flag: 'wx' });
      }
      fs.writeFileSync(path.join(retained, 'test.json'), JSON.stringify({ name: t.name }) + '\n', { encoding: 'utf8', flag: 'wx' });
    }
    fs.rmSync(parent, { recursive: true, force: true });
  });
  return path.join(parent, 'evidence');
}
function read(root, name) { return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')); }
async function negative(t, options, pattern) {
  const root = location(t);
  await assert.rejects(runSelfCheck(root, { expectedBaseline: 'zero', ...options }), pattern);
  const r = read(root, 'run.json');
  assert.equal(r.exit, 1);
  assert.equal(r.close.attempted, true);
  assert.equal(r.close.closed, true);
  assert.equal(r.postcheck.fresh_connection, true);
  return r;
}
test('parse explicit profiles and reject unknown flags', () => {
  const r = parseArgs(['--self-check', '--expected-baseline', 'six', '--fixture-baseline', 'six', '--evidence-root', 'fresh']);
  assert.equal(r.expectedBaseline, 'six');
  assert.equal(r.fixtureBaseline, 'six');
  assert.throws(() => parseArgs(['--unknown']), /unknown argument/);
});
test('missing expected inventory and remote mode reject before database/evidence creation', async (t) => {
  const root = location(t);
  await assert.rejects(runSelfCheck(root), /explicit expected baseline/);
  await assert.rejects(runSelfCheck(root, { expectedBaseline: 'zero', remote: true }), /REMOTE_MODE_REJECTED/);
  assert.equal(fs.existsSync(root), false);
  const cli = spawnSync(process.execPath, [path.join(__dirname, 'tv1LocalRunner.js'), '--remote-url', 'https://example.invalid'], { encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.match(cli.stderr, /REMOTE_MODE_REJECTED/);
});
for (const profile of ['zero', 'six']) {
  test(`POS actual SQL ${profile} fixture preserves baseline and rows after rollback and reopening`, async (t) => {
    const root = location(t);
    const r = await runSelfCheck(root, { expectedBaseline: profile, fixtureBaseline: profile });
    assert.equal(r.exit, 0);
    assert.equal(r.baseline.objects_n, profile === 'six' ? 6 : 0);
    assert.equal(r.postcheck.same_baseline, true);
    assert.equal(r.postcheck.same_team_rows, true);
    assert.equal(r.postcheck.fixture_count, 0);
    assert.equal(r.rollback.ok, true);
    assert.equal(r.close.ok, true);
    assert.equal(r.postcheck_closed, true);
    assert.match(r.runtime.version, /^PostgreSQL /);
    assert.equal(r.runtime.pglite, '0.5.10');
    const rows = read(root, 'results.json').flatMap(x => x.statements.flatMap(s => s.rows || []));
    assert.ok(rows.some(x => x.case_id === 'FINAL-IN-TX' && Number(x.fixture_count) === 4));
    assert.ok(rows.some(x => x.case_id === 'POST-ROLLBACK' && Number(x.fixture_count) === 0));
    const notices = read(root, 'notices.json');
    assert.ok(notices.some(x => /NEG-04.*actual=23505/.test(x.message)));
    assert.ok(notices.some(x => /NEG-05.*actual=23514/.test(x.message)));
    await assert.rejects(runSelfCheck(root, { expectedBaseline: profile }), { code: 'EEXIST' });
  });
}
for (const [expectedBaseline, fixtureBaseline] of [['zero', 'six'], ['six', 'zero']]) {
  test(`NEG approved ${expectedBaseline} inventory mismatches actual ${fixtureBaseline} before diagnostic writes`, async (t) => {
    const r = await negative(t, { expectedBaseline, fixtureBaseline }, /PREFLIGHT\/BASELINE/);
    assert.equal(r.postcheck.fixture_count, 0);
    assert.equal(r.postcheck.same_baseline, true);
    assert.equal(r.postcheck.same_team_rows, true);
  });
}
test('NEG real catalog fingerprint drift is detected, not treated as empty', async (t) => {
  const r = await negative(t, { testFault: 'fingerprint' }, /PREFLIGHT\/BASELINE/);
  assert.equal(r.postcheck.same_baseline, false);
  assert.deepEqual(r.postcheck.inventory.names, ['unexpected_drift']);
});
for (const [fault, reason] of [['rls', /CAT\/RLS/], ['invoker', /CAT\/SECURITY-INVOKER/], ['trigger', /PREFLIGHT\/TRIGGER/], ['role', /PREFLIGHT\/OWNER/]]) {
  test(`NEG actual ${fault} capability defect fails for intended reason`, async (t) => {
    const r = await negative(t, { testFault: fault }, reason);
    assert.equal(r.postcheck.fixture_count, 0);
    assert.equal(r.postcheck.same_baseline, true);
  });
}
test('NEG error after four real fixture inserts rolls back and closes before fresh verification', async (t) => {
  const r = await negative(t, { testFault: 'sql' }, /INJECTED_SQL_FAILURE fixtures=4/);
  assert.equal(r.rollback.ok, true);
  assert.equal(r.postcheck.fixture_count, 0);
  assert.equal(r.postcheck.same_baseline, true);
  assert.equal(r.errors[0].code, 'P0001');
});
test('NEG notice-capture failure rolls back and closes without fabricated PASS', async (t) => {
  const r = await negative(t, { testFault: 'notice' }, /INJECTED_NOTICE_CAPTURE_FAILURE/);
  assert.equal(r.rollback.ok, true);
  assert.equal(r.postcheck.fixture_count, 0);
});
test('NEG rollback failure preserves original SQL error; close still aborts and fresh postcheck runs', async (t) => {
  const r = await negative(t, { testFault: 'rollback' }, /INJECTED_SQL_FAILURE fixtures=4/);
  assert.equal(r.rollback.ok, false);
  assert.ok(r.errors.some(e => e.stage === 'rollback' && /INJECTED_ROLLBACK_FAILURE/.test(e.message)));
  assert.equal(r.postcheck.fixture_count, 0);
});
test('NEG close failure is retained as failure even after actual close', async (t) => {
  const r = await negative(t, { testFault: 'close' }, /INJECTED_CLOSE_FAILURE/);
  assert.equal(r.close.ok, false);
  assert.equal(r.postcheck.fixture_count, 0);
});
test('NEG preexisting diagnostic IDs refused and retained, never cleaned as owned new rows', async (t) => {
  const r = await negative(t, { testFault: 'collision' }, /fixture collision/);
  assert.equal(r.postcheck.fixture_count, 4);
  assert.equal(r.postcheck.same_baseline, true);
});
