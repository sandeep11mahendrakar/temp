'use strict';

// K3 demoqa targets: data-file contract test (no browser, no LLM).
// Pins vision/test/targets/demoqa.json: parses, item shape, canonical
// action names (STEP_ACTIONS), oracle kinds (ORACLE_CONTRACT.md), unique paths.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { assertStepAction } = require('../src/executeTests');

// Oracle kinds verbatim from docs/ORACLE_CONTRACT.md (K2 frozen set).
const ORACLE_KINDS = new Set([
  'dialog_message', 'new_page_url', 'bbox_delta', 'value',
  'text_present', 'count_delta', 'state_diff',
  'url_change', 'observed',
]);

test('K3 demoqa targets: 26 items, valid shape, canonical actions+oracles, unique paths', () => {
  const file = path.join(__dirname, 'targets', 'demoqa.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(doc.items), 'items array present');
  assert.equal(doc.items.length, 26, 'all K3 pages covered, got ' + doc.items.length);
  const seen = new Set();
  for (const item of doc.items) {
    assert.equal(typeof item.path, 'string', 'path present: ' + JSON.stringify(item.path));
    assert.ok(item.path.startsWith('/'), 'path rooted: ' + item.path);
    assert.ok(!seen.has(item.path), 'no duplicate path: ' + item.path);
    seen.add(item.path);
    assert.equal(typeof item.intent, 'string', 'intent present: ' + item.path);
    assert.ok(item.intent.length > 0, 'intent non-empty: ' + item.path);
    assert.ok(Array.isArray(item.actions) && item.actions.length > 0, 'actions non-empty: ' + item.path);
    for (const a of item.actions) assertStepAction(a);
    assert.ok(item.oracle && typeof item.oracle === 'object', 'oracle present: ' + item.path);
    assert.ok(ORACLE_KINDS.has(item.oracle.kind), 'oracle kind known: ' + item.path + ' got ' + item.oracle.kind);
    assert.equal(typeof item.oracle.expect, 'string', 'oracle expect present: ' + item.path);
  }
});
