'use strict';

// Lane R3-T11 (worker-3): TDD for buildPhaseTests. Offline only — no LLM, no
// browser, no network. Fixture below is an inline MINIMAL copy of the recorded
// run_1791724255517 history (8 transitions, 6 states); see
// docs/RUN_ANALYSIS_login_20261011.md sections 1-2 for the ground truth.
// The full artifact stays on disk; this file must never depend on it existing.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPhaseTests } = require('../src/phaseTests');
const { planGoal } = require('../src/goalPlanner');

// --- inline minimal fixture (shapes mirror the recorded history) ---
const T = (from_state, type, elementText, url_after, result, extra) => ({
  from_state,
  action: {
    type,
    elementId: (extra && extra.elementId) || 'elem-x',
    elementType: (extra && extra.elementType) || 'button',
    elementText,
    x: 1,
    y: 1,
    value: (extra && 'value' in extra) ? extra.value : null,
    reason: 'fixture',
  },
  result,
  to_state: (extra && extra.to_state) || 'state_9',
  url_after,
});

const FIX_TRANSITIONS = [
  T('state_001', 'fill', '', 'https://www.saucedemo.com/', 'executed',
    { elementId: 'elem-2', elementType: 'text_input', value: 'standard_user', to_state: 'state_002' }),
  T('state_002', 'submit', 'Login', 'https://www.saucedemo.com/', 'executed',
    { elementId: 'elem-0', to_state: 'state_003' }),
  T('state_003', 'click', 'Login', 'https://www.saucedemo.com/', 'repeated_state_skipped',
    { elementId: 'elem-0', to_state: 'state_004' }),
  T('state_003', 'click', '', 'https://www.saucedemo.com/', 'repeated_state_skipped',
    { elementId: 'elem-5', to_state: 'state_005' }),
  T('state_003', 'click', '°', 'https://www.saucedemo.com/', 'executed',
    { elementId: 'elem-18', to_state: 'state_006' }),
  T('state_006', 'click', 'performance_glitch_user', 'https://www.saucedemo.com/inventory.html', 'executed',
    { elementId: 'elem-1', elementType: 'link', to_state: 'state_007' }),
  T('state_007', 'click', 'Sauce Labs Bike Light', 'https://www.saucedemo.com/inventory-item.html?id=0', 'executed',
    { elementId: 'elem-24', elementType: 'link', to_state: 'state_008' }),
  T('state_008', 'click', 'Back to products', 'https://www.saucedemo.com/inventory.html', 'repeated_state_skipped',
    { elementId: 'elem-11', elementType: 'link', to_state: 'state_009' }),
];

const FIX_STATES = [
  { state_id: 'state_001', url: 'https://www.saucedemo.com/' },
  { state_id: 'state_002', url: 'https://www.saucedemo.com/' },
  { state_id: 'state_003', url: 'https://www.saucedemo.com/' },
  { state_id: 'state_006', url: 'https://www.saucedemo.com/' },
  { state_id: 'state_007', url: 'https://www.saucedemo.com/inventory.html' },
  { state_id: 'state_008', url: 'https://www.saucedemo.com/inventory-item.html?id=0' },
];

const loginPhases = () => planGoal('test the login').phases;
const textsOf = (t) => t.steps.map((s) => s.target.text);

test('empty / missing inputs yield no tests, never throw', () => {
  assert.deepEqual(buildPhaseTests([], [], loginPhases()), []);
  assert.deepEqual(buildPhaseTests(null, null, null), []);
  assert.deepEqual(buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, null), []);
  assert.deepEqual(buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, []), []);
  assert.deepEqual(buildPhaseTests('nope', {}, 'nope'), []);
});

test('login phases yield a fill+submit test without junk clicks', () => {
  const tests = buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, loginPhases());
  const submit = tests.find((t) => t.phase_id === 'login-submit');
  assert.ok(submit, 'login-submit phase must yield a test');
  assert.deepEqual(submit.steps.map((s) => s.action), ['fill', 'submit']);
  assert.equal(submit.steps[0].value, 'standard_user');
  assert.equal(submit.steps[1].target.text, 'Login');
  for (const t of tests) {
    for (const s of t.steps) {
      assert.ok(s.target.text !== '°', 'glyph junk must not replay');
      assert.ok(s.target.text !== 'performance_glitch_user', 'stale-label click must not replay');
      assert.ok(s.target.text !== 'Sauce Labs Bike Light', 'post-login exploring must not replay');
    }
  }
});

test('non-executed results never appear in any test', () => {
  const tests = buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, loginPhases());
  const allTexts = tests.flatMap(textsOf);
  assert.ok(!allTexts.includes('Back to products'), 'repeated-state click excluded');
  assert.equal(allTexts.filter((x) => x === 'Login').length <= 2, true);
});

test('expect_navigation comes from the URL span', () => {
  const tests = buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, loginPhases());
  const fill = tests.find((t) => t.phase_id === 'login-fill');
  const submit = tests.find((t) => t.phase_id === 'login-submit');
  assert.ok(fill && submit);
  assert.equal(fill.expect_navigation, false);
  assert.equal(submit.expect_navigation, true);
});

test('evidence carries phase_id, urls, matched signals, completion ref', () => {
  const tests = buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, loginPhases());
  const submit = tests.find((t) => t.phase_id === 'login-submit');
  assert.equal(submit.evidence.phase_id, 'login-submit');
  assert.ok(submit.evidence.urls.includes('https://www.saucedemo.com/'));
  assert.ok(submit.evidence.urls.includes('https://www.saucedemo.com/inventory.html'));
  assert.ok(submit.evidence.matched_signals.includes('inventory'));
  assert.equal(typeof submit.evidence.completed_at_transition, 'number');
});

test('steps are distilled refs carrying their transition index', () => {
  const tests = buildPhaseTests(FIX_TRANSITIONS, FIX_STATES, loginPhases());
  const submit = tests.find((t) => t.phase_id === 'login-submit');
  assert.deepEqual(submit.steps.map((s) => s.transition_index), [0, 1]);
});

test('single-fill run still yields its fill test (never-empty fallback)', () => {
  const tests = buildPhaseTests([FIX_TRANSITIONS[0]], FIX_STATES, loginPhases());
  assert.equal(tests.length, 1);
  assert.equal(tests[0].phase_id, 'login-fill');
  assert.equal(tests[0].steps.length, 1);
});

test('trailing-slash URL pair is not navigation (R5 regression)', () => {
  const trs = [
    T('state_001', 'submit', 'Go', 'https://x.test/', 'executed', { to_state: 'state_002' }),
  ];
  const sts = [{ state_id: 'state_001', url: 'https://x.test' }];
  const phases = [{ id: 'go-submit', name: 'Go', kind: 'submit', successSignals: ['elsewhere'], done: false, failCount: 0 }];
  assert.deepEqual(buildPhaseTests(trs, sts, phases), []);
});
