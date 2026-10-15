'use strict';

// Q6 fixture-manifest-counts: pins vision/test/fixtures content. Fails on
// unexpected add/remove/corrupt so blind-fire chains keep stable inputs.
// Reads disk only - no browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'fixtures', 'perceive');
const EXPECTED = [
  'saucedemo-checkout-complete.json',
  'saucedemo-login.json',
  'todomvc-empty.json',
];

test('Q6 fixture manifest counts: exactly the 3 pinned perceive fixtures', () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  assert.deepEqual(files, [...EXPECTED].sort());
  assert.equal(files.length, 3);
});

test('Q6 fixture manifest shape: each parses with elements array + metadata', () => {
  for (const f of EXPECTED) {
    const o = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    assert.ok(Array.isArray(o.elements), f + ' elements must be an array');
    assert.equal(typeof o.element_count, 'number', f + ' element_count must be a number');
    assert.equal(typeof o.source, 'string', f + ' source must be a string');
    assert.ok(o.elements.length > 0, f + ' must not be empty');
  }
});
