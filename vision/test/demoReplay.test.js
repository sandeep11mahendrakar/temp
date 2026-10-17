'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadRun, summarize, replay } = require('../src/demoReplay');

test('R-6 replay from object, offline', () => {
  const r = replay({ run_id: 'r1', site: 's', label: 'ASSISTED', brain: { role: 'planner' }, citable: true, screens: 3, llm_calls: 2, tokens: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.offline, true);
  assert.equal(r.summary.run_id, 'r1');
  assert.equal(r.summary.brain_role, 'planner');
  assert.equal(r.summary.screens, 3);
});

test('R-6 replay from file path', () => {
  const f = path.join(os.tmpdir(), `run_${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify({ run_id: 'r2', label: 'ASSISTED' }), 'utf8');
  const r = replay(f);
  assert.equal(r.summary.run_id, 'r2');
  fs.unlinkSync(f);
});

test('R-6 summarize handles missing fields gracefully', () => {
  const s = summarize({});
  assert.equal(s.run_id, null);
  assert.equal(s.citable, false);
});
