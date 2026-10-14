'use strict';

// K6 robustness minis (offline-first, mock-only, zero LLM/browser/network).
// One minimal pin per RUN_ANALYSIS root cause R1-R8. Each mini PASSES by
// asserting the honest CURRENT behavior; the robustness verdict per R
// (PASS = guard holds offline, FAIL = gap reproduces, UNSUPPORTED = needs
// live browser) is reported on the board, not in the test outcome.
// Live re-verification of R6/R7 rides HOLDER after K4 (W2 live lane).

process.env.STUB_LLM = 'true';
process.env.SEED_USERNAME = 'standard_user';
process.env.SEED_PASSWORD = 'secret_sauce';

const test = require('node:test');
const assert = require('node:assert/strict');

const explorer = require('../src/explorer');
const { planGoal, advancePhase } = require('../src/goalPlanner');
const {
  resolveTarget,
  resolveLowConfFill,
  snapCheckToNativeInput,
} = require('../src/executeTests');

const FP = 'https://x/|a|b';
const mkCand = (over = {}) => ({
  elementId: 'elem-0', type: 'text_input', text: '', x: 100, y: 100,
  alreadyTried: false, _key: 'k', ...over,
});
const el = (id, type, text, cx, cy, conf) => ({
  id, type, text, conf: conf ?? 0.8, cx, cy,
  bbox: { x1: cx - 10, y1: cy - 5, x2: cx + 10, y2: cy + 5 },
});

// R1 model-myopia: submit with empty password converts to a password fill.
test('K6 R1: guard converts empty-password submit into seeded fill', () => {
  const cands = [mkCand({ elementId: 'e-user', y: 100 }), mkCand({ elementId: 'e-pass', y: 200 })];
  const filled = [{ from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 100, y: 100, value: 'standard_user' } }];
  const got = explorer.pickUnfilledInput(cands, filled, FP);
  assert.equal(got.candidate.elementId, 'e-pass');
  assert.equal(got.value, 'secret_sauce');
});

// R2 pre-submit gate: empty sibling blocks submit; full form releases it.
test('K6 R2: submit blocked while any input empty, released when full', () => {
  const cands = [mkCand({ elementId: 'e1', y: 100 })];
  assert.ok(explorer.pickUnfilledInput(cands, [], FP) !== null, 'empty blocks submit');
  const filled = [{ from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 100, y: 100, value: 'standard_user' } }];
  assert.equal(explorer.pickUnfilledInput(cands, filled, FP), null, 'full releases submit');
});

// R3 phase-judge attribution: junk clicks never become phase evidence.
test('K6 R3: distill drops scrolls + empty-text + glyph clicks, keeps fills', () => {
  const chain = [
    { action: 'fill', elementText: '', value: 'standard_user' },
    { action: 'fill', elementText: '', value: 'secret_sauce' },
    { action: 'scroll', elementText: '' },
    { action: 'click', elementText: '' },
    { action: 'click', elementText: '°' },
    { action: 'click', elementText: 'Login' },
  ];
  const plan = { phases: [{ successSignals: ['Login', 'inventory'] }] };
  const kept = explorer.distillGoalSteps(chain, plan);
  assert.equal(kept.length, 3);
  assert.ok(kept.every((s) => s.action === 'fill' || s.elementText === 'Login'));
});

// R4 OCR placeholder blindness: positional rule fills both Young fields.
test('K6 R4: stacked empty inputs batch top=username bottom=password', () => {
  const cands = [mkCand({ elementId: 'e1', y: 100 }), mkCand({ elementId: 'e2', y: 200 })];
  const batch = explorer.pickUnfilledInputBatch(cands, [], FP, 4);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].value, 'standard_user');
  assert.equal(batch[1].value, 'secret_sauce');
});

// R5 trailing-slash: login-page -> login-page/ is NOT navigation.
test('K6 R5: submit judge ignores trailing-slash-only URL change', () => {
  const plan = planGoal('login');
  const submit = plan.phases.find((p) => p.id === 'login-submit');
  const live = { ...submit, done: false, failCount: 0 };
  assert.equal(advancePhase(live, { urlBefore: 'https://x', urlAfter: 'https://x/' }), false);
  assert.equal(live.done, false);
});

// R6 toggle precision: label-text point snaps to the native control center.
test('K6 R6: snap moves label-text point onto the native input (geometry)', async () => {
  const fake = { evaluate: async () => ({ x: 535, y: 285 }) };
  const snap = await snapCheckToNativeInput(fake, 632, 284);
  assert.equal(snap.snapped, true);
  assert.deepEqual([snap.x, snap.y], [535, 285]);
});

// R7 perception gap: zero inputs in view stays honestly unresolved.
test('K6 R7: empty post-todo input replays as unresolved_target, never stale', () => {
  const pool = Array.from({ length: 40 }, (_, i) =>
    el(`e${i}`, i % 2 ? 'text' : 'button', `item ${i}`, 100 + i * 5, 200, 0.7));
  const r = resolveLowConfFill(pool, { x: 790, y: 162, target: { type: 'search_field', text: '' } });
  assert.equal(r.resolved, false);
  assert.match(r.reason, /no input-class element/);
});

// R8 stale coordinates: re-detect replaces recorded points, never clicks them.
test('K6 R8: re-detect resolves fresh center; recorded point only a hint', () => {
  const elements = [el('e-new', 'button', 'Login', 640, 325)];
  const r = resolveTarget(elements, { target: { type: 'button', text: 'Login' }, x: 10, y: 10 });
  assert.equal(r.resolved, true);
  assert.deepEqual([r.element.cx, r.element.cy], [640, 325]);
});
