'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildProposals, writeProposalFile } = require('../src/archetypeProposals');

test('E-3 no proposals when fewer than 3 runs', () => {
  const store = { lessons: [{ pattern: 'p', action: 'a', count: 2, run_ids: ['r1', 'r2'] }] };
  assert.equal(buildProposals(store).length, 0);
});

test('E-3 proposal when >=3 distinct runs', () => {
  const store = { lessons: [{ pattern: 'p', action: 'a', count: 3, run_ids: ['r1', 'r2', 'r3'], lesson: 'l', outcome: 'o', confidence: 'MED' }] };
  const p = buildProposals(store);
  assert.equal(p.length, 1);
  assert.equal(p[0].auto_edit, false);
  assert.equal(p[0].distinct_runs, 3);
});

test('E-3 writeProposalFile roundtrip + auto_edit false', () => {
  const f = path.join(os.tmpdir(), `prop_${Date.now()}.json`);
  const props = [{ pattern: 'p', action: 'a', auto_edit: false }];
  writeProposalFile(f, props);
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(data.auto_edit, false);
  assert.equal(data.proposals.length, 1);
  fs.unlinkSync(f);
});
