'use strict';

// H3 real-fixture chain: filter -> candidates -> queue over REAL recorded
// perceive snapshots (copies, never live). No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { filterInputs, isInputType } = require('../src/inputFilter');
const { buildCandidates } = require('../src/explorer');

const FIX = path.join(__dirname, 'fixtures', 'perceive');
const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

// Chain under test (real modules only): inputFilter -> buildCandidates ->
// seeded-queue order (fill-class candidates in rank order). Returns the
// raw|filtered|fired table row; saucedemo snapshots with <2 surviving
// inputs take path B (report the gap) — path A (underline/crop fix) needs
// a live image and can never fire offline, so it must report, never throw.
function chainFixture(doc, site) {
  const raw = doc.elements.filter((el) => el && isInputType(el.type)).length;
  const { elements: filtered } = filterInputs(doc.elements);
  const kept = filtered.filter((el) => el && isInputType(el.type));
  const cands = buildCandidates({ elements: filtered }, new Set(), new Map(), 'h3');
  const queue = cands.filter((c) => c && isInputType(c.type));
  if (site === 'saucedemo' && kept.length < 2) {
    return { raw, filtered: kept.length, fired: 0, reported: { gap: 'saucedemo-inputs<2', path: 'B-report' } };
  }
  return { raw, filtered: kept.length, fired: queue.length, reported: null };
}

test('H3 fixtures: 3 real snapshots load with pinned element counts', () => {
  assert.equal(load('saucedemo-login.json').element_count, 18);
  assert.equal(load('todomvc-empty.json').element_count, 27);
  assert.equal(load('saucedemo-checkout-complete.json').element_count, 17);
});

test('H3 chain todomvc-empty: raw|filtered|fired table row', () => {
  const row = chainFixture(load('todomvc-empty.json'), 'todomvc');
  assert.equal(row.raw, 1);
  assert.equal(row.filtered, 1);
  assert.ok(row.fired >= 1, 'the empty-todo input reaches the seeded queue');
  assert.equal(row.reported, null);
});

test('H3 chain saucedemo-login: both real fields survive to the queue', () => {
  const row = chainFixture(load('saucedemo-login.json'), 'saucedemo');
  assert.equal(row.raw, 2);
  assert.equal(row.filtered, 2);
  assert.ok(row.fired >= 2, 'user+pass fields both queued');
  assert.equal(row.reported, null);
});

test('H3 saucedemo<2: B-report path (reported, zero fired, never throws)', () => {
  // Fixture is the checkout-COMPLETE page (shared state_008 filename was
  // overwritten by a later run; 0 inputs either way — the rule triggers on
  // count, and the underline-input class is documented, not re-proven here).
  const row = chainFixture(load('saucedemo-checkout-complete.json'), 'saucedemo');
  assert.equal(row.filtered, 0);
  assert.equal(row.fired, 0);
  assert.deepEqual(row.reported, { gap: 'saucedemo-inputs<2', path: 'B-report' });
});
