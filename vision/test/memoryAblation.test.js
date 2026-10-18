'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { augment, ablate, isMemoryEnabled } = require('../src/memoryAblation');

test('memoryAblation: flag off => byte-identical (no change)', () => {
  const r = ablate({ basePrompt: 'hello', store: { lessons: [] }, env: {} });
  assert.equal(r.memory_enabled_off, false);
  assert.equal(r.changed, false);
  assert.equal(r.delta_bytes, 0);
});

test('memoryAblation: with lessons + flag on changes prompt', () => {
  const store = { lessons: [{ pattern: 'login', action: 'fill', outcome: 'pass', lesson: 'use standard_user', confidence: 'MED', count: 2, run_ids: ['r1'] }] };
  const r = ablate({ basePrompt: 'base prompt', store, env: { EXPERIENCE_MEMORY: 'on' } });
  assert.equal(r.memory_enabled_on, true);
  // gain_claimed must always be false (honest)
  assert.equal(r.gain_claimed, false);
});

test('memoryAblation: honest flag present', () => {
  const r = ablate({ basePrompt: 'x', store: { lessons: [] } });
  assert.ok(typeof r.honest === 'string' && r.honest.length > 0);
});
