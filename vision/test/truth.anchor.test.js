'use strict';

// Q3 truth-anchor: oracle.expect-vs-truth (no browser, no LLM).
// Every vision/test/targets/demoqa.json oracle MUST have a truth entry in
// vision/test/truth/demoqa.truth.json with conf H|M, else the test FAILs and
// lists the page as UNANCHORED. Kind/expect mismatch vs truth => FAIL with a
// mismatch REPORT; the truth file is NEVER auto-edited (fix by human review).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
}

test('Q3 truth-anchor: all 26 target oracles anchored (UNANCHORED listed on FAIL)', () => {
  const targets = load('targets/demoqa.json');
  const truth = load('truth/demoqa.truth.json');
  assert.equal(truth.source, 'claude-memory-unverified', 'truth source marked unverified');
  const byPath = new Map(truth.items.map((t) => [t.path, t]));
  const unanchored = targets.items.filter((it) => !byPath.has(it.path)).map((it) => it.path);
  assert.deepEqual(unanchored, [], 'UNANCHORED pages (no truth entry): ' + JSON.stringify(unanchored));
});

test('Q3 truth-anchor: kind+expect match targets (mismatch => report, never auto-edit)', () => {
  const targets = load('targets/demoqa.json');
  const truth = load('truth/demoqa.truth.json');
  const byPath = new Map(truth.items.map((t) => [t.path, t]));
  const mismatches = [];
  for (const it of targets.items) {
    const t = byPath.get(it.path);
    if (!t) continue; // owned by the UNANCHORED test above
    if (t.oracle.kind !== it.oracle.kind || t.oracle.expect !== it.oracle.expect) {
      mismatches.push({ path: it.path, target: it.oracle, truth: t.oracle });
    }
  }
  assert.deepEqual(mismatches, [], 'MISMATCH vs truth (report only, truth file untouched): ' + JSON.stringify(mismatches).slice(0, 600));
});

test('Q3 truth-anchor: conf is H|M only; H carries live evidence', () => {
  const truth = load('truth/demoqa.truth.json');
  assert.equal(truth.count, truth.items.length, 'count field honest');
  for (const t of truth.items) {
    assert.ok(t.conf === 'H' || t.conf === 'M', 'conf H|M: ' + t.path + ' got ' + t.conf);
    assert.equal(t.source, 'claude-memory-unverified', 'per-item source: ' + t.path);
    assert.ok(typeof t.evidence === 'string' && t.evidence.length > 0, 'evidence pointer: ' + t.path);
  }
  const hCount = truth.items.filter((t) => t.conf === 'H').length;
  assert.ok(hCount >= 3, 'at least the 3 K4-PASS pages are H, got ' + hCount);
});

test('Q3 truth-anchor: text_present/text_absent expects compile as regex', () => {
  const truth = load('truth/demoqa.truth.json');
  const bad = [];
  for (const t of truth.items) {
    if (t.oracle.kind === 'text_present' || t.oracle.kind === 'text_absent') {
      try {
        new RegExp(String(t.oracle.expect).slice(0, 120), 'i');
      } catch (_) {
        bad.push(t.path);
      }
    }
  }
  assert.deepEqual(bad, [], 'non-compiling expects: ' + JSON.stringify(bad));
});
