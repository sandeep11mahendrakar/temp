'use strict';

// B4 run memory: offline tests. Real temp files only (os.tmpdir), no repo writes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SUMMARY_MAX,
  emptyMemory,
  loadMemory,
  buildSummary,
  mergeRun,
  saveMemoryAtomic,
} = require('../src/runMemory');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'b4-')), 'memory.json');

test('B4 memory: first run for a site stores null delta', () => {
  const mem = mergeRun(emptyMemory(), {
    site: 'saucedemo-login', run_id: 'r1', ts: '2026-10-13T00:00:00.000Z',
    summary: buildSummary({ verdict: 'PASS', phasesDone: ['login-fill'], totalPhases: 3, urlAfter: 'https://www.saucedemo.com/inventory.html' }),
    phases_done: ['login-fill'], verdict: 'PASS',
  });
  assert.equal(mem.runs.length, 1);
  assert.equal(mem.runs[0].delta, null);
  assert.ok(mem.runs[0].summary.length <= SUMMARY_MAX);
});

test('B4 memory: second run records only-new phases as delta', () => {
  let mem = emptyMemory();
  mem = mergeRun(mem, { site: 's', run_id: 'r1', summary: 'PASS 1/3', phases_done: ['a'], verdict: 'PASS' });
  mem = mergeRun(mem, { site: 'other', run_id: 'x', summary: 'PASS 1/1', phases_done: ['z'], verdict: 'PASS' });
  mem = mergeRun(mem, { site: 's', run_id: 'r2', summary: 'PASS 2/3', phases_done: ['a', 'b'], verdict: 'PASS' });
  assert.deepEqual(mem.runs[2].delta, ['b']);
  assert.equal(mem.runs.length, 3);
});

test('B4 memory: summary is capped at 40 chars', () => {
  const s = buildSummary({
    verdict: 'PASS_WEAK(1)', phasesDone: ['a', 'b', 'c'],
    totalPhases: 11, urlAfter: 'https://todomvc.com/examples/react/dist/#/active',
  });
  assert.ok(s.length <= SUMMARY_MAX, `summary len ${s.length}`);
  assert.match(s, /PASS_WEAK/);
});

test('B4 memory: atomic save/load roundtrip; missing+corrupt load empty', () => {
  const file = tmpFile();
  assert.deepEqual(loadMemory(file + '.missing'), emptyMemory());
  fs.writeFileSync(file, '{not json', 'utf8');
  assert.deepEqual(loadMemory(file), emptyMemory());
  const mem = mergeRun(emptyMemory(), {
    site: 's', run_id: 'r1', summary: 'PASS 1/1', phases_done: ['a'], verdict: 'PASS',
  });
  saveMemoryAtomic(file, mem);
  assert.deepEqual(loadMemory(file), mem);
  assert.ok(!fs.existsSync(`${file}.${process.pid}.tmp`), 'no temp residue');
});
