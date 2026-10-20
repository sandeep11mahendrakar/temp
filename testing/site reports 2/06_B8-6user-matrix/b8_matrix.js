'use strict';
// B8 live-matrix (LoopB scratch, headed, api_calls=0, mock-LLM only).
// Per hint user: author login replay -> executor -> verdict vs expects ->
// mergeRun memory -> reportSchema matrix INDEX. Serial, one browser at a time.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { LOGIN_HINTS } = require('../../src/archetypes');
const { mergeRun, emptyMemory } = require('../../src/runMemory');
const { buildReport, indexRow } = require('../../src/reportSchema');

const OUT = __dirname;
const BASE = 'https://www.saucedemo.com/';

function chainFor(username, password) {
  return [{
    action: 'fill', elementId: null, expect_navigation: true,
    expected_result: `Login as ${username}`,
    expected_text: username === 'locked_out_user' ? 'locked out' : 'Products',
    id: `B8-${username}`,
    objective: `B8 matrix login as ${username}`,
    steps: [
      { action: 'fill', target: { text: '', type: 'text_input' }, value: username, x: 640, y: 174 },
      { action: 'fill', target: { text: '', type: 'text_input' }, value: password, x: 640, y: 228 },
      { action: 'click', target: { text: 'Login', type: 'button' }, value: '', x: 640, y: 325 },
    ],
  }];
}

(async () => {
  let mem = emptyMemory();
  const rows = [];
  for (const u of LOGIN_HINTS.users) {
    const cf = path.join(OUT, `b8_${u.username}.json`);
    const rf = path.join(OUT, `b8_rep_${u.username}.json`);
    fs.writeFileSync(cf, JSON.stringify(chainFor(u.username, LOGIN_HINTS.password)));
    try {
      execSync(`node src/executeTests.js "${cf}" ${BASE} "${rf}"`, {
        cwd: path.join(OUT, '..', '..'),
        env: { ...process.env, VISION_HEADED: 'true' },
        timeout: 300000,
        stdio: 'pipe',
      });
    } catch (e) { /* rep file still written on FAIL; ERROR leaves rep missing */ }
    let rep = null;
    try { rep = JSON.parse(fs.readFileSync(rf, 'utf8')); } catch (_) { /* no rep */ }
    const r = rep && rep.results && rep.results[0];
    const doneSteps = r ? (r.steps_executed || []).filter((s) => s.ok).map((s) => `step${s.index}-${s.action}`) : [];
    mem = mergeRun(mem, {
      site: 'saucedemo-login', run_id: (rep && rep.run_id) || null,
      summary: '', phases_done: doneSteps,
      verdict: r ? r.status : 'ERROR',
    });
    const last = mem.runs[mem.runs.length - 1];
    const match = r && ((u.expects === 'PASS' && r.status === 'PASS') || (u.expects === 'FAIL' && r.status !== 'PASS'));
    rows.push({
      user: u.username, expects: u.expects,
      verdict: r ? (r.verdict || r.status) : 'ERROR',
      match: Boolean(match), url_after: r ? r.url_after : null,
      evidence: rf, delta: last.delta,
    });
    console.log(`${u.username}: expects=${u.expects} verdict=${r ? (r.verdict || r.status) : 'ERROR'} match=${Boolean(match)}`);
  }
  const report = buildReport({
    runId: `b8-matrix-${Date.now()}`, source: 'vision-loopB-b8',
    loops: [],
    cases: rows.map((w) => ({
      id: `B8-${w.user}`, verdict: w.match ? 'PASS' : 'FAIL', weak_steps: 0, evidence: w.evidence,
    })),
    cost: { api_calls: 0, tokens_in: 0, tokens_out: 0, usd_estimated: null },
    storagePaths: rows.map((w) => w.evidence),
  });
  const matrix = { ts: new Date().toISOString(), api_calls: 0, rows, mem, report, index: indexRow(report) };
  fs.writeFileSync(path.join(OUT, 'b8_matrix.json'), JSON.stringify(matrix, null, 2));
  console.log('MATRIX saved b8_matrix.json');
  console.log('MATCH ' + rows.filter((w) => w.match).length + '/' + rows.length);
  console.log(indexRow(report));
})().catch((e) => { console.error('MATRIX-FAIL ' + e.message); process.exit(1); });
