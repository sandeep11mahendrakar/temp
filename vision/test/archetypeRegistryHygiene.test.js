'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { detectAll, expandAll } = require('../src/archetypes');

const FIX_DIR = path.join(__dirname, 'fixtures', 'zoo-vdom');

test('A-5 detectAll returns descending scores and is deterministic', () => {
  const vdom = JSON.parse(fs.readFileSync(path.join(FIX_DIR, 'login-6users.json'), 'utf8'));
  const a = detectAll(vdom, {});
  const b = detectAll(vdom, {});
  assert.deepEqual(a, b, 'deterministic');
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i - 1].score >= a[i].score, 'descending order');
  }
});

test('A-5 expandAll never throws on pinned fixtures', () => {
  for (const f of fs.readdirSync(FIX_DIR).filter((x) => x.endsWith('.json'))) {
    const vdom = JSON.parse(fs.readFileSync(path.join(FIX_DIR, f), 'utf8'));
    const tcs = expandAll('do the thing', vdom, '', {});
    assert.ok(Array.isArray(tcs), `${f}: expandAll returns array`);
  }
});

test('A-5 no fixture triggers an unrelated high score (FP guard)', () => {
  // select-check-radio has no strong signal -> top score must stay <= 0.3
  const vdom = JSON.parse(fs.readFileSync(path.join(FIX_DIR, 'select-check-radio.json'), 'utf8'));
  const top = detectAll(vdom, {})[0];
  assert.ok(top.score <= 0.3, `top score ${top.score} too high for generic fixture`);
});
