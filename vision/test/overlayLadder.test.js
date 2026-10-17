'use strict';
// V-3 overlay-ladder regression (numeric): synthetic fixtures ONLY - no live, no network, no LLM.
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectOverlay, dismissCandidates, STANDARD_LABELS } = require('../src/overlayLadder');

test('V-3 detectOverlay: cookie banner classified, candidates standard-only', () => {
  const r = detectOverlay({ title: 'Shop', bodyText: 'We use cookies. Accept all or reject.', elements: [
    { text: 'Accept all' }, { text: 'Reject all' }, { text: 'Close' },
  ] });
  assert.equal(r.class, 'cookie_banner');
  assert.ok(r.confidence >= 0.55 && r.confidence <= 0.95);
  assert.ok(Array.isArray(r.candidates) && r.candidates.length > 0);
  for (const c of r.candidates) assert.ok(STANDARD_LABELS.some((l) => l.key === c.kind), 'standard kind: ' + c.kind);
});

test('V-3 detectOverlay: consent modal classified', () => {
  const r = detectOverlay({ title: 'Site', bodyText: 'We need your consent for GDPR tracking and personalised ads.', elements: [{ text: 'I agree' }] });
  assert.equal(r.class, 'consent_modal');
});

test('V-3 detectOverlay: modal overlay classified', () => {
  const r = detectOverlay({ title: 'App', bodyText: 'A modal dialog is open over the page.', elements: [{ text: 'Close' }] });
  assert.equal(r.class, 'modal_overlay');
});

test('V-3 detectOverlay: blocking overlay classified (highest priority)', () => {
  const r = detectOverlay({ title: 'Gate', bodyText: 'Age verification required. Are you 18+? We use cookies.', elements: [{ text: 'Close' }] });
  assert.equal(r.class, 'blocking_overlay');
});

test('V-3 detectOverlay: clean page => none, no candidates', () => {
  const r = detectOverlay({ title: 'Home', bodyText: 'Welcome to the catalog. Buy now.', elements: [{ text: 'Buy' }] });
  assert.equal(r.class, 'none');
  assert.equal(r.confidence, 0.6);
  assert.deepEqual(r.candidates, []);
});

test('V-3 detectOverlay: empty/garbage never throws', () => {
  assert.doesNotThrow(() => detectOverlay());
  assert.doesNotThrow(() => detectOverlay({}));
  assert.doesNotThrow(() => detectOverlay({ bodyText: null, elements: 'nope' }));
  const r = detectOverlay();
  assert.equal(r.class, 'none');
});

test('V-3 dismissCandidates: only standard affordances, priority sorted, no evasion labels', () => {
  const cands = dismissCandidates({ elements: [
    { text: 'Buy now' }, { text: 'Submit' }, { text: 'Close' }, { text: 'Reject all' }, { text: 'Accept all' },
  ] });
  assert.ok(cands.length >= 3);
  for (const c of cands) assert.ok(STANDARD_LABELS.some((l) => l.key === c.kind));
  // priority ascending
  for (let i = 1; i < cands.length; i++) assert.ok(cands[i].priority >= cands[i - 1].priority);
  // evasion-ish labels never proposed
  const kinds = cands.map((c) => c.kind);
  assert.ok(!kinds.includes('hide'), 'no hide affordance');
});

test('V-3 dismissCandidates: empty input => []', () => {
  assert.deepEqual(dismissCandidates(), []);
  assert.deepEqual(dismissCandidates({ elements: [] }), []);
});

test('V-3 control: no overlay on clean page yields zero dismiss attempts (negative control)', () => {
  const r = detectOverlay({ title: 'Home', bodyText: 'Plain page, nothing special here.', elements: [{ text: 'Save' }] });
  assert.equal(r.class, 'none');
  assert.equal(r.candidates.length, 0, 'no dismiss candidates on a clean page');
});
