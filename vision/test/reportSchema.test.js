'use strict';

// B7 report schema: offline tests. No I/O, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  SCHEMA_VERSION,
  ACTION_ENUM,
  checkAction,
  buildReport,
  indexRow,
  checkReport,
  blindStatus,
  resolveAutonomy,
} = require('../src/reportSchema');

const demo = () => buildReport({
  runId: 'exec_1',
  ts: '2026-10-13T00:00:00.000Z',
  source: 'vision-loopB',
  loops: [{ n: 1, delta: null, covered: false }, { n: 2, delta: ['b'], covered: true }],
  cases: [
    { id: 'S1-B2', verdict: 'PASS', weak_steps: 0, evidence: 's1_rep1.json' },
    { id: 'M6-FULLCHAIN', verdict: 'PASS_WEAK(1)', weak_steps: 1, evidence: 'm6_rep.json' },
  ],
  cost: { api_calls: 0, tokens_in: 0, tokens_out: 0, usd_estimated: null },
  storagePaths: ['storage/outputs/s1_rep1.json', 'storage/outputs/m6_rep.json'],
});

test('B7 report: schema1 assembles run/loops/cases+result/cost/storage/citable', () => {
  const r = demo();
  assert.equal(r.schema, SCHEMA_VERSION);
  assert.equal(r.cases.length, 2);
  assert.equal(r.result.pass_rate, 1);
  assert.equal(r.cost.api_calls, 0);
  assert.equal(r.storage.paths.length, 2);
  assert.match(r.citable.ref, /^run-exec_1$/);
  assert.match(r.citable.sha1, /^[0-9a-f]{40}$/);
  const again = demo();
  assert.equal(again.citable.sha1, r.citable.sha1);
});

test('B7 report: checker flags version/keys/types, clean report passes', () => {
  assert.deepEqual(checkReport(demo()), []);
  assert.ok(checkReport({ schema: 2 }).length > 0);
  assert.ok(checkReport(null).length > 0);
  const broken = demo();
  delete broken.cases;
  broken.cost.api_calls = 'zero';
  const bad = checkReport(broken);
  assert.ok(bad.includes('missing:cases'));
  assert.ok(bad.includes('cost.api_calls:not-number'));
});

test('B7 report: INDEX row renders pipes with verdict+cost+storage+sha', () => {
  const row = indexRow(demo());
  assert.match(row, /^\| run-exec_1 \|/);
  assert.ok(row.includes('n/a'), 'null usd renders n/a, never invented');
  assert.ok(row.includes('s1_rep1.json'));
  assert.ok(row.split('|').length >= 7);
});

test('G3 contract: case rows carry verdict + app_outcome (default n/a)', () => {  const r = demo();
  for (const c of r.cases) assert.equal(c.app_outcome, 'n/a');
  const r2 = buildReport({
    runId: 'x', cases: [{ id: 'neg', verdict: 'PASS', app_outcome: 'rejected' }],
  });
  assert.equal(r2.cases[0].app_outcome, 'rejected');
  assert.deepEqual(checkReport(r2), []);
});

test('N5 schema-gaps: 20-action enum validator accepts known, rejects unknown', () => {
  assert.equal(ACTION_ENUM.length, 20);
  for (const a of ACTION_ENUM) assert.equal(checkAction(a), null, `${a} known`);
  assert.equal(checkAction('right_click'), null, 'L1 action covered');
  assert.equal(checkAction('Right_Click'), null, 'case-insensitive');
  assert.equal(checkAction('dance'), 'action:unknown:dance');
  assert.equal(checkAction(''), 'action:missing');
  assert.equal(checkAction(null), 'action:missing');
});

test('N5 schema-gaps: MCP tool-schema enum is the full 20-set (gap4 closed)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../mcp/server.js'), 'utf8');
  const m = src.match(/action: \{ type: 'string', enum: \[([^\]]*)\] \}/);
  assert.ok(m, 'tool schema enum found');
  const names = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepEqual(names, ACTION_ENUM);
});

test('N5 schema-gaps: enum frozen shape (no done-terminal, unique)', () => {
  assert.ok(!ACTION_ENUM.includes('done'), 'done is terminal, not actuation');
  assert.deepEqual([...new Set(ACTION_ENUM)], ACTION_ENUM, 'unique');
  assert.ok(ACTION_ENUM.filter((a) => a !== 'selectOption').every((a) => a === a.toLowerCase()), 'lowercase except canonical camelCase selectOption');
});

test('N4 blind-rule: Y only on empty-cwd+tools-off+JSON-only', () => {
  assert.equal(blindStatus({ cwdEmpty: true, toolsOff: true, jsonOnly: true }), 'Y');
  assert.equal(blindStatus({ cwdEmpty: true, toolsOff: true, jsonOnly: false }), 'AUTONOMY_NONBLIND');
  assert.equal(blindStatus({ cwdEmpty: true, toolsOff: false, jsonOnly: true }), 'AUTONOMY_NONBLIND');
  assert.equal(blindStatus(null), 'AUTONOMY_NONBLIND');
});

test('N4 blind-rule: never AUTONOMOUS unless blind; report carries brain block', () => {
  assert.equal(resolveAutonomy({ requested: 'AUTONOMOUS', cwdEmpty: true, toolsOff: true, jsonOnly: true }), 'AUTONOMOUS');
  assert.equal(resolveAutonomy({ requested: 'AUTONOMOUS' }), 'AUTONOMY_NONBLIND');
  assert.equal(resolveAutonomy({ requested: 'ASSISTED' }), 'ASSISTED');
  assert.equal(resolveAutonomy(null), 'AUTONOMY_NONBLIND');
  const r = buildReport({ runId: 'n4', brain: { mode: 'mock', model: 'mock', cwdEmpty: true, toolsOff: true, jsonOnly: true } });
  assert.deepEqual(r.brain, { mode: 'mock', model: 'mock', blind: 'Y' });
  const r2 = buildReport({ runId: 'n4b' });
  assert.equal(r2.brain, undefined, 'pre-N4 reports carry no brain block');
  assert.deepEqual(checkReport(r2), []);
});
