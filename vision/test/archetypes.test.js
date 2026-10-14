'use strict';

// B3 archetype registry: offline tests. Pure modules, no LLM/browser/network.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ARCHETYPES,
  classifyGoal,
  LOGIN_HINTS,
  TEMPLATES,
  ORACLES,
  CONTRACT,
  detectAll,
  expandAll,
  verdictFor,
} = require('../src/archetypes');
const { planGoal } = require('../src/goalPlanner');

test('B3 registry exposes index+login+crudlist+generic with matchers', () => {
  assert.deepEqual(Object.keys(ARCHETYPES).sort(), ['crudlist', 'generic', 'index', 'login']);
  for (const [id, a] of Object.entries(ARCHETYPES)) {
    assert.equal(typeof a.match, 'function', `${id} has a matcher`);
    assert.ok(Array.isArray(a.templates), `${id} lists templates`);
  }
  assert.equal(classifyGoal('browse the catalog'), 'index');
  assert.equal(classifyGoal('do something cool on this site'), 'generic');
});

test('B3 login archetype covers fill-submit-verify shapes; planner output matches', () => {
  assert.deepEqual(ARCHETYPES.login.templates.slice().sort(), ['formSubmit', 'login', 'search', 'signup']);
  const plan = planGoal('login to saucedemo');
  const expected = TEMPLATES.login.phases().map((p) => p.id);
  assert.deepEqual(plan.phases.map((p) => p.id), expected);
  assert.deepEqual(plan.need_input, ['username', 'password']);
});

test('B3 crudlist covers cart+checkout; todo verbs classify without changing phases', () => {
  assert.deepEqual(ARCHETYPES.crudlist.templates.slice().sort(), ['addToCart', 'checkout']);
  assert.equal(classifyGoal('add to cart the backpack'), 'crudlist');
  assert.equal(classifyGoal('checkout my order'), 'crudlist');
  assert.equal(classifyGoal('add Buy milk to the todos'), 'crudlist');
  // Classification never invents phases: todo goals keep generic fallback.
  const plan = planGoal('add Buy milk to the todos');
  assert.deepEqual(plan.phases.map((p) => p.id), ['explore-observe', 'explore-interact']);
});

test('B3 generic fallback never empty (compat pin)', () => {
  for (const g of ['', '   ', 'xyzzy qqq']) {
    assert.equal(classifyGoal(g), 'generic');
    const plan = planGoal(g);
    assert.ok(plan.phases.length > 0);
  }
});

test('B3 login-hints matrix: 6 users + negatives with honest outcomes', () => {
  assert.equal(LOGIN_HINTS.users.length, 6);
  assert.deepEqual(LOGIN_HINTS.users.map((u) => u.username), [
    'standard_user', 'locked_out_user', 'problem_user',
    'performance_glitch_user', 'error_user', 'visual_user',
  ]);
  const locked = LOGIN_HINTS.users.find((u) => u.username === 'locked_out_user');
  assert.equal(locked.locked, true);
  assert.equal(locked.expects, 'FAIL');
  assert.ok(LOGIN_HINTS.negatives.length >= 3, 'negatives cover locked+bad+unknown');
  for (const n of LOGIN_HINTS.negatives) assert.equal(n.expects, 'FAIL');
});

test('B3 refactor compat: all 6 intent goals yield identical phase ids', () => {
  const cases = [
    ['login to saucedemo', ['login-fill', 'login-submit', 'login-verify']],
    ['sign up for a new account', ['signup-fill', 'signup-submit', 'signup-verify']],
    ['search for red shoes', ['search-enter', 'search-submit', 'search-verify']],
    ['add to cart the backpack', ['cart-find', 'cart-add', 'cart-verify']],
    ['checkout my order', ['checkout-open', 'checkout-fill', 'checkout-complete', 'checkout-verify']],
    ['fill and submit the contact form', ['form-fill', 'form-submit', 'form-verify']],
  ];
  for (const [goal, ids] of cases) {
    assert.deepEqual(planGoal(goal).phases.map((p) => p.id), ids, goal);
  }
});

test('AUDIT contract: detect scores 0..1, login-form ranks login first', () => {
  const vdom = { elements: [
    { type: 'text_input', text: '' }, { type: 'password', text: '' },
    { type: 'button', text: 'Login' },
  ] };
  const ranked = detectAll(vdom, {});
  assert.equal(ranked[0].name, 'login');
  for (const r of ranked) assert.ok(r.score >= 0 && r.score <= 1, r.name + ' in range');
});

test('AUDIT contract: hints parse OCR usernames, empty text falls back to demo matrix', () => {
  const ocr = 'Accepted usernames are: standard_user, locked_out_user Password for all users: secret_sauce';
  const tcs = expandAll('login', { elements: [] }, ocr, {});
  assert.ok(tcs.some((t) => t.id === 'login-standard_user'));
  assert.ok(tcs.some((t) => t.id === 'login-locked_out_user' && t.expect_rejection === true));
  const noHint = expandAll('login', { elements: [] }, 'no credentials here', {});
  assert.ok(noHint.some((t) => t.id === 'login-standard_user'), 'demo fallback keeps matrix');
});

test('AUDIT contract: login expand yields user matrix + 3 negatives, tc shape', () => {
  const tcs = expandAll('login to saucedemo', { elements: [] }, '', {});
  assert.ok(tcs.length >= 9, '6 users + 3 negatives, got ' + tcs.length);
  for (const t of tcs) {
    assert.ok(t.id && t.archetype === 'login' && t.params && Array.isArray(t.steps));
    assert.ok(t.oracle && t.oracle.kind && t.oracle.expect !== undefined && t.oracle.strength);
    assert.ok(Array.isArray(t.tags));
    for (const st of t.steps) assert.ok(st.action && st.target && st.target.type !== undefined);
  }
  assert.ok(tcs.some((t) => t.id === 'login-negative-empty-pass'));
  assert.ok(tcs.some((t) => t.id === 'login-negative-wrong-pass'));
});

test('AUDIT contract: crudlist expand add/toggle/filter/clear with oracles', () => {
  const tcs = expandAll('complete todos', { elements: [{ type: 'checkbox', text: 'Buy milk' }, { type: 'text', text: '2 items left' }] }, '2 items left', {});
  assert.deepEqual(tcs.map((t) => t.id), ['crud-add', 'crud-toggle', 'crud-filter', 'crud-clear']);
  assert.ok(tcs.every((t) => t.archetype === 'crudlist' && t.oracle && t.oracle.kind));
});

test('AUDIT contract: generic fallback one-per-control, never empty, observed allowed', () => {
  const tcs = expandAll('do something cool', { elements: [{ type: 'button', text: 'Go' }] }, '', {});
  assert.ok(tcs.length >= 1);
  const empty = expandAll('xyzzy', { elements: [] }, '', {});
  assert.equal(empty.length, 1);
  assert.equal(empty[0].oracle.kind, 'observed');
});

test('AUDIT verdict: locked_out rejection is PASS/rejected, not FAIL', () => {
  const tcs = expandAll('login', { elements: [] }, '', {});
  const locked = tcs.find((t) => t.id === 'login-locked_out_user');
  assert.equal(locked.expect_rejection, true);
  assert.deepEqual(
    verdictFor(locked, { urlChanged: false, pageText: 'Sorry, this user has been locked out.' }),
    { verdict: 'PASS', app_outcome: 'rejected' });
  assert.equal(
    verdictFor(locked, { urlChanged: false, pageText: 'Products page' }).verdict, 'FAIL');
  const ok = tcs.find((t) => t.id === 'login-standard_user');
  assert.deepEqual(
    verdictFor(ok, { urlChanged: true, pageText: 'Products' }),
    { verdict: 'PASS', app_outcome: 'accepted' });
  assert.equal(verdictFor({ oracle: { kind: 'observed' } }, {}).verdict, 'OBSERVED');
});

test('AUDIT contract string documents detect/hints/expand/oracles', () => {
  assert.match(CONTRACT, /detect.*hints.*expand.*oracles/);
  assert.ok(ORACLES.loginSuccess && ORACLES.loginRejected && ORACLES.observed);
});

// J3 form plugin: demoqa practice-form vdom scores top + hints/expand shape.
const FORM_VDOM = { elements: [
  { type: 'text_input', text: 'First Name' },
  { type: 'text_input', text: 'Last Name' },
  { type: 'text_input', text: 'Email' },
  { type: 'text_input', text: 'Mobile Number' },
  { type: 'radio', text: 'Male' },
  { type: 'radio', text: 'Female' },
  { type: 'checkbox', text: 'Sports' },
  { type: 'button', text: 'Submit' },
] };

test('J3 form plugin: practice-form vdom detects form top', () => {
  const ranked = detectAll(FORM_VDOM, {});
  assert.equal(ranked[0].name, 'form');
  assert.ok(ranked[0].score >= 0.8);
});

test('J3 form plugin: hints capture fields+options, expand fills+submit', () => {
  const tcs = expandAll('enter student details and send', FORM_VDOM, '', {});
  assert.equal(tcs.length, 1);
  assert.equal(tcs[0].archetype, 'form');
  assert.equal(tcs[0].id, 'form-fill-submit');
  assert.ok(tcs[0].steps.length >= 5, '4 fills + submit click');
  assert.equal(tcs[0].steps.at(-1).action, 'click');
  assert.equal(tcs[0].oracle.kind, 'text_present');
});

// J3 table plugin: demoqa webtables vdom scores top + search/add/rows shape.
const TABLE_VDOM = { elements: [
  { type: 'text', text: 'Add' },
  { type: 'search_field', text: 'Type to search' },
  { type: 'text', text: 'Alden Cantrell' },
  { type: 'text', text: 'Edit' },
  { type: 'text', text: 'Delete' },
  { type: 'text', text: 'Cierra Vega' },
  { type: 'text', text: 'Edit' },
  { type: 'text', text: 'Delete' },
] };

test('J3 table plugin: webtables vdom detects table top', () => {
  const ranked = detectAll(TABLE_VDOM, {});
  assert.equal(ranked[0].name, 'table');
  assert.ok(ranked[0].score >= 0.8);
});

test('J3 table plugin: hints capture rows+search, expand search/add/rows', () => {
  const tcs = expandAll('look through the user grid', TABLE_VDOM, '', {});
  assert.deepEqual(tcs.map((t) => t.id), ['table-search', 'table-add-open', 'table-rows']);
  assert.ok(tcs.every((t) => t.archetype === 'table' && t.oracle && t.oracle.kind));
});

test('J3 plugins: core contract entries still win their own fixtures', () => {
  const crud = expandAll('complete todos', { elements: [{ type: 'checkbox', text: 'Buy milk' }, { type: 'text', text: '2 items left' }] }, '2 items left', {});
  assert.equal(crud[0].archetype, 'crudlist');
  const gen = expandAll('do something cool', { elements: [{ type: 'button', text: 'Go' }] }, '', {});
  assert.ok(gen.length >= 1);
  assert.ok(!gen.some((t) => t.archetype === 'form' || t.archetype === 'table'), 'no plugin hijack on generic page');
});

test('J3 plugins: button-typed Add still recalls table at mid tier', () => {
  const vdom = { elements: [
    { type: 'button', text: 'Add' },
    { type: 'text', text: 'Alden Cantrell' },
    { type: 'text', text: 'Edit' },
    { type: 'text', text: 'Delete' },
  ] };
  const ranked = detectAll(vdom, {});
  const table = ranked.find((r) => r.name === 'table');
  assert.ok(table.score >= 0.55, 'mid-tier recall without search box');
});
