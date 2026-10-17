'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isMemoryEnabled, retrieveTopLessons, augmentPrompt } = require('../src/lessonRetrieval');

test('E-2 flag OFF by default', () => {
  assert.equal(isMemoryEnabled({}), false);
  assert.equal(isMemoryEnabled({ EXPERIENCE_MEMORY: 'off' }), false);
});

test('E-2 flag ON only when EXPERIENCE_MEMORY=on', () => {
  assert.equal(isMemoryEnabled({ EXPERIENCE_MEMORY: 'on' }), true);
});

test('E-2 retrieveTopLessons ranks by count then run_ids', () => {
  const store = { lessons: [
    { pattern: 'p1', lesson: 'l1', count: 2, run_ids: ['r1'] },
    { pattern: 'p2', lesson: 'l2', count: 5, run_ids: ['r2', 'r3'] },
    { pattern: 'p3', lesson: 'l3', count: 1, run_ids: ['r4'] },
    { pattern: 'p4', lesson: 'l4', count: 5, run_ids: ['r5'] },
  ] };
  const top = retrieveTopLessons(store, { k: 3 });
  assert.equal(top.length, 3);
  assert.equal(top[0].pattern, 'p2'); // count 5, more run_ids
  assert.equal(top[1].pattern, 'p4'); // count 5
  assert.equal(top[2].pattern, 'p1'); // count 2
});

test('E-2 flag OFF => prompt byte-identical', () => {
  const store = { lessons: [{ pattern: 'p', lesson: 'l', count: 1, run_ids: ['r'] }] };
  const prompt = 'hello world';
  const out = augmentPrompt(prompt, store, { env: {} });
  assert.equal(out, prompt);
});

test('E-2 flag ON => prompt augmented with top-3', () => {
  const store = { lessons: [{ pattern: 'p', lesson: 'l', count: 1, run_ids: ['r'] }] };
  const prompt = 'hello world';
  const out = augmentPrompt(prompt, store, { env: { EXPERIENCE_MEMORY: 'on' } });
  assert.notEqual(out, prompt);
  assert.ok(out.includes('LESSONS (top-1)'));
});
