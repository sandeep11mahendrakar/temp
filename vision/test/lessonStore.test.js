'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  emptyStore,
  isReliableOracle,
  loadStore,
  saveStoreAtomic,
  recordLesson,
} = require('../src/lessonStore');

function tmpFile() {
  return path.join(os.tmpdir(), `lesson_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
}

test('isReliableOracle: STRONG/MED only', () => {
  assert.equal(isReliableOracle('STRONG'), true);
  assert.equal(isReliableOracle('med'), true);
  assert.equal(isReliableOracle('WEAK'), false);
  assert.equal(isReliableOracle(null), false);
});

test('recordLesson rejects weak oracle', () => {
  const store = emptyStore();
  assert.throws(() => recordLesson(store, {
    pattern: 'p', action: 'a', outcome: 'o', lesson: 'l', confidence: 'low', run_id: 'r1', oracle: 'WEAK',
  }), /not reliable/);
});

test('recordLesson rejects missing run_id', () => {
  const store = emptyStore();
  assert.throws(() => recordLesson(store, {
    pattern: 'p', action: 'a', outcome: 'o', lesson: 'l', confidence: 'high', oracle: 'STRONG',
  }), /missing citable run_id/);
});

test('recordLesson adds new lesson', () => {
  const store = emptyStore();
  const r = recordLesson(store, {
    pattern: 'empty-input', action: 'fill', outcome: 'unresolved', lesson: 'underline inputs vanish',
    confidence: 'MED', run_id: 'run1', oracle: 'MED',
  });
  assert.equal(r.added, true);
  assert.equal(store.lessons.length, 1);
  assert.equal(store.lessons[0].count, 1);
  assert.deepEqual(store.lessons[0].run_ids, ['run1']);
});

test('recordLesson dedups by pattern+action and increments count', () => {
  const store = emptyStore();
  recordLesson(store, { pattern: 'p', action: 'a', outcome: 'o1', lesson: 'l1', confidence: 'STRONG', run_id: 'r1', oracle: 'STRONG' });
  const r2 = recordLesson(store, { pattern: 'p', action: 'a', outcome: 'o2', lesson: 'l2', confidence: 'STRONG', run_id: 'r2', oracle: 'STRONG' });
  assert.equal(r2.added, false);
  assert.equal(store.lessons.length, 1);
  assert.equal(store.lessons[0].count, 2);
  assert.deepEqual(store.lessons[0].run_ids, ['r1', 'r2']);
  assert.equal(store.lessons[0].lesson, 'l2');
});

test('loadStore/saveStoreAtomic roundtrip', () => {
  const f = tmpFile();
  const store = emptyStore();
  recordLesson(store, { pattern: 'p', action: 'a', outcome: 'o', lesson: 'l', confidence: 'STRONG', run_id: 'r1', oracle: 'STRONG' });
  saveStoreAtomic(f, store);
  const loaded = loadStore(f);
  assert.equal(loaded.lessons.length, 1);
  assert.equal(loaded.lessons[0].pattern, 'p');
  assert.equal(loaded.lessons[0].count, 1);
  fs.unlinkSync(f);
});

test('loadStore returns empty on missing/corrupt file', () => {
  const f = tmpFile();
  assert.equal(loadStore(f).lessons.length, 0);
  fs.writeFileSync(f, '{not json', 'utf8');
  assert.equal(loadStore(f).lessons.length, 0);
  fs.unlinkSync(f);
});
