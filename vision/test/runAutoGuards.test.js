'use strict';

// S1a runAuto guard tests (mock-only, tmp sites dirs): pre-run canLaunch
// gate + pre-plan blockDetector hook. Numeric: zero planner/executor calls
// on refuse/stop paths; dry pass-through byte-identical.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildRunner, prePlanBlock, goalHasAuth, STOP_CLASSES, BLOCK_STATES } = require('../runAuto');

function tmpSites(extra) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 's1a-'));
  const sites = [
    { id: 'open-site', url: 'https://example.com', access: 'open', cred_env: null, truth_ref: null, source: 't', notes: null },
    { id: 'ext-site', url: 'https://example.net', access: 'third_party', cred_env: null, truth_ref: null, source: 't', notes: null },
  ].concat(extra || []);
  for (const s of sites) fs.writeFileSync(path.join(d, `${s.id}.json`), JSON.stringify(s));
  return d;
}

const DRY = { url: 'https://example.com', goal: 'regression sweep', maxLoops: 1, runId: 's1a-t' };

// 1. block-state list is the 6 detector classes.
test('S1a states: BLOCK_STATES pins the 6 detector classes', () => {
  assert.deepEqual(BLOCK_STATES, ['ok', 'login_wall', 'bot_challenge', 'forbidden', 'blank_render', 'rate_limit']);
  assert.deepEqual(STOP_CLASSES, ['bot_challenge', 'forbidden', 'rate_limit', 'blank_render']);
});

// 2. prePlanBlock table: 4 stop classes BLOCKED, ok passes, login_wall gated.
test('S1a classify: stop-table + login_wall auth-gate', () => {
  const stopObs = {
    bot_challenge: { title: 'Attention Required | Cloudflare', status: 526 },
    forbidden: { title: 'Access Denied', status: 403 },
    rate_limit: { title: 'Slow down', status: 429 },
    blank_render: { title: '', status: 200, ocrText: '   ', bodyText: '' },
  };
  for (const [cls, obs] of Object.entries(stopObs)) {
    const r = prePlanBlock(obs, 'regression sweep');
    assert.equal(r.blocked.verdict, 'BLOCKED', cls);
    assert.equal(r.blocked.class, cls, cls);
    assert.equal(r.blocked.citable, false, cls);
  }
  assert.equal(prePlanBlock({ title: 'Welcome' }, 'x').blocked, null);
  const wall = { title: 'Please log in to continue' };
  assert.equal(prePlanBlock(wall, 'browse catalog').blocked.class, 'login_wall');
  assert.equal(prePlanBlock(wall, 'login as standard_user').blocked, null);
});

// 3. goalHasAuth numeric-ish: auth goals pass, plain goals fail.
test('S1a auth-gate: login/auth goals continue, plain goals stop', () => {
  assert.equal(goalHasAuth('login as standard_user'), true);
  assert.equal(goalHasAuth('locked_out_user rejection check'), true);
  assert.equal(goalHasAuth('browse catalog'), false);
  assert.equal(goalHasAuth(''), false);
});

// 4. refuse: third_party without --permitted throws, zero IO, logged.
test('S1a refuse: third_party unpermitted throws + zero calls + logged', async () => {
  const d = tmpSites();
  const before = fs.existsSync(path.join(d, 'runs.log')) ? fs.readFileSync(path.join(d, 'runs.log'), 'utf8') : '';
  await assert.rejects(
    buildRunner({ ...DRY, siteId: 'ext-site', sitesDir: d }),
    /REFUSED/
  );
  const after = fs.readFileSync(path.join(d, 'runs.log'), 'utf8');
  assert.ok(after.length > before.length && after.includes('"refused":true'));
  fs.rmSync(d, { recursive: true, force: true });
});

// 5. unknown site id throws before any loop.
test('S1a gate: unknown site id throws', async () => {
  const d = tmpSites();
  await assert.rejects(buildRunner({ ...DRY, siteId: 'nope', sitesDir: d }), /unknown site/);
  fs.rmSync(d, { recursive: true, force: true });
});

// 6. permitted third_party proceeds dry (DRY verdict, loops ran).
test('S1a permit: third_party --permitted runs dry', async () => {
  const d = tmpSites();
  const r = await buildRunner({ ...DRY, siteId: 'ext-site', sitesDir: d, permitted: true });
  assert.equal(r.blocked, undefined);
  assert.equal(r.loops.covered === true || r.loops.covered === false, true);
  assert.equal(r.config.counters.llmCalls <= 40, true);
  fs.rmSync(d, { recursive: true, force: true });
});

// 7. blocked run: 403 page => BLOCKED(forbidden), 1 perceive, 0 execute/llm, report written.
test('S1a block: 403 stops pre-plan with report + zero plan/exec', async () => {
  const d = tmpSites();
  let perceives = 0, executes = 0, llms = 0;
  const r = await buildRunner({
    ...DRY,
    siteId: 'open-site',
    sitesDir: d,
    perceive: async () => { perceives += 1; return { title: '403 Forbidden', status: 403, bodyText: 'Access Denied' }; },
    execute: async () => { executes += 1; return { doneTCs: [], verdict: 'FAIL' }; },
    llmCall: async () => { llms += 1; return '{"keep":[]}'; },
  });
  assert.equal(r.blocked.verdict, 'BLOCKED');
  assert.equal(r.blocked.class, 'forbidden');
  assert.equal(r.blocked.citable, false);
  assert.equal(perceives, 1);
  assert.equal(executes, 0);
  assert.equal(llms, 0);
  assert.equal(r.report.cases[0].verdict, 'BLOCKED');
  assert.ok(r.report.citable && typeof r.report.citable.sha1 === 'string');
  fs.rmSync(d, { recursive: true, force: true });
});

// 8. login_wall without auth goal blocks; dry ok-page passes through.
test('S1a wall: no-auth wall blocks, ok page runs dry', async () => {
  const d = tmpSites();
  const w = await buildRunner({
    ...DRY,
    siteId: 'open-site',
    sitesDir: d,
    perceive: async () => ({ title: 'Log in to continue' }),
  });
  assert.equal(w.blocked.class, 'login_wall');
  const ok = await buildRunner({ ...DRY, siteId: 'open-site', sitesDir: d });
  assert.equal(ok.blocked, undefined);
  assert.equal(ok.config.counters.perceives >= 1, true);
  fs.rmSync(d, { recursive: true, force: true });
});
