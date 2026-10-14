'use strict';

// B4-full: offline tests for v2 site memory (memory.js). No browser, no
// network, no LLM. runMemory.js (frozen v1) is never imported here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  emptyStore,
  loadStore,
  fingerprintFor,
  buildSummary40,
  mergeLoop,
  saveStoreAtomic,
  SUMMARY_MAX,
} = require('../src/memory');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'b4full-')), 'memory.json');

test('mergeLoop first sight: delta null, attempts 1, summary<=40', () => {
  const { store, delta, summary } = mergeLoop(emptyStore(), {
    site: 'saucedemo.com', phases_done: ['login-fill'], totalPhases: 3,
    verdict: 'PASS', urlAfter: 'https://www.saucedemo.com/inventory.html',
  });
  assert.equal(delta, null);
  assert.equal(store.sites['saucedemo.com'].attempts, 1);
  assert.deepEqual(store.sites['saucedemo.com'].coverage.done, ['login-fill']);
  assert.ok(summary.length <= SUMMARY_MAX, `summary ${summary.length}ch<=${SUMMARY_MAX}`);
});

test('mergeLoop second run: delta newly-covered only, history appended', () => {
  const first = mergeLoop(emptyStore(), {
    site: 's', phases_done: ['a'], totalPhases: 3, verdict: 'PASS', urlAfter: '',
  }).store;
  const { store, delta } = mergeLoop(first, {
    site: 's', phases_done: ['a', 'b'], totalPhases: 3, verdict: 'PASS',
    urlAfter: '', hint: 'fill both fields', finding: 'b landed',
  });
  assert.deepEqual(delta, ['b']);
  assert.equal(store.sites.s.attempts, 2);
  assert.deepEqual(store.sites.s.deltas, [[], ['b']]);
  assert.deepEqual(store.sites.s.hints, ['fill both fields']);
  assert.equal(store.sites.s.findings.length, 1);
});

test('fingerprintFor stable across variants, distinct per host', () => {
  assert.equal(fingerprintFor('https://X.com/'), fingerprintFor('http://x.com'));
  assert.equal(fingerprintFor('https://x.com/a/b'), 'x.com/a');
  assert.notEqual(fingerprintFor('https://x.com/'), fingerprintFor('https://y.com/'));
});

test('atomic round-trip + corrupt file never throws', () => {
  const f = tmpFile();
  const { store } = mergeLoop(emptyStore(), {
    site: 't', phases_done: ['x'], totalPhases: 1, verdict: 'FAIL', urlAfter: '',
  });
  saveStoreAtomic(f, store);
  const back = loadStore(f);
  assert.equal(back.version, 2);
  assert.equal(back.sites.t.attempts, 1);
  fs.writeFileSync(f, '{corrupt', 'utf8');
  assert.deepEqual(loadStore(f), emptyStore());
  assert.deepEqual(loadStore(f + '.missing'), emptyStore());
  assert.ok(buildSummary40({ verdict: 'PASS', doneCount: 2, totalPhases: 2, urlAfter: 'https://h.com/' }).length <= SUMMARY_MAX);
});
