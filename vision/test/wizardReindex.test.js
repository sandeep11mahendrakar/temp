'use strict';

// X-F3 wizard-step3 regression (numeric): domReindexResolve() live-DOM
// stale-pool recovery, tagged WEAK. CONTROL pins honest nulls (empty pool /
// unreadable page / unrelated target) so the caller still FAILs. No browser,
// no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { domReindexResolve, weakStepCount } = require('../src/executeTests');

const POOL = [{ type: 'text_input', text: 'Ship to', cx: 200, cy: 120, conf: null, synth: null }];

test('X-F3 resolves a revealed target from a live-DOM re-index (WEAK tag)', async () => {
  const p = { evaluate: async () => POOL };
  const r = await domReindexResolve(p, { action: 'fill', target: { type: 'text_input', text: 'Ship to' } });
  assert.equal(r.via, 'dom_reindex');
  assert.equal(r.element.cx, 200);
  assert.equal(r.element.cy, 120);
});

test('X-F3 CONTROL empty pool => null (caller FAILs)', async () => {
  const p = { evaluate: async () => [] };
  assert.equal(await domReindexResolve(p, { action: 'fill', target: { type: 'text_input', text: 'Ship to' } }), null);
});

test('X-F3 CONTROL unreadable page => null, never throws', async () => {
  const p = { evaluate: async () => { throw new Error('detached'); } };
  await assert.doesNotReject(() => domReindexResolve(p, { action: 'fill', target: { type: 'text_input', text: 'Ship to' } }));
  assert.equal(await domReindexResolve(p, { action: 'fill', target: { type: 'text_input', text: 'Ship to' } }), null);
});

test('X-F3 CONTROL unrelated target in the pool => null (no wrong resolve)', async () => {
  const p = { evaluate: async () => [{ type: 'button', text: 'Place order', cx: 1, cy: 1 }] };
  assert.equal(await domReindexResolve(p, { action: 'fill', target: { type: 'text_input', text: 'Ship to' } }), null);
});

test('X-F3 CONTROL page without evaluate => null', async () => {
  assert.equal(await domReindexResolve({}, { action: 'click', target: { type: 'button', text: 'x' } }), null);
});

test('X-F3 dom_reindex counts as a WEAK resolution', () => {
  assert.equal(weakStepCount([{ ok: true, resolution_via: 'dom_reindex' }]), 1);
  assert.equal(weakStepCount([{ ok: true, resolution_via: 'text_match' }]), 0);
});
