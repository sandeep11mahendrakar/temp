'use strict';

// Lane R3-T2: deterministic offline tests for the goal planner. No LLM, no
// browser, no network — pure planGoal / advancePhase contract checks.

const test = require('node:test');
const assert = require('node:assert/strict');

const { planGoal, advancePhase } = require('../src/goalPlanner');

function ids(plan) {
  return plan.phases.map((p) => p.id);
}

test('planGoal: login template yields fill->submit->verify phases', () => {
  const plan = planGoal('login to saucedemo');
  assert.ok(plan.phases.length >= 3, 'login must expand to >=3 phases');
  assert.deepEqual(ids(plan).slice(0, 3), ['login-fill', 'login-submit', 'login-verify']);
  for (const p of plan.phases) {
    assert.equal(typeof p.id, 'string');
    assert.equal(typeof p.name, 'string');
    assert.equal(p.done, false);
  }
  assert.ok(plan.need_input.includes('username'), 'login needs username');
  assert.ok(plan.need_input.includes('password'), 'login needs password');
});

test('planGoal: signup template', () => {
  const plan = planGoal('sign up for a new account');
  assert.ok(ids(plan).includes('signup-fill'));
  assert.ok(ids(plan).includes('signup-submit'));
  assert.ok(ids(plan).includes('signup-verify'));
  assert.ok(plan.need_input.includes('email'));
});

test('planGoal: add-to-cart template', () => {
  const plan = planGoal('add to cart the backpack');
  assert.ok(ids(plan).includes('cart-add'));
  assert.ok(ids(plan).includes('cart-verify'));
});

test('planGoal: checkout template', () => {
  const plan = planGoal('checkout my order');
  assert.ok(ids(plan).includes('checkout-open'));
  assert.ok(ids(plan).includes('checkout-complete'));
  assert.ok(ids(plan).includes('checkout-verify'));
});

test('planGoal: search template', () => {
  const plan = planGoal('search for red shoes');
  assert.ok(ids(plan).includes('search-enter'));
  assert.ok(ids(plan).includes('search-submit'));
  assert.ok(ids(plan).includes('search-verify'));
});

test('planGoal: form-submit template', () => {
  const plan = planGoal('fill and submit the contact form');
  assert.ok(ids(plan).includes('form-fill'));
  assert.ok(ids(plan).includes('form-submit'));
  assert.ok(ids(plan).includes('form-verify'));
});

test('planGoal: composite login-to-checkout chains both templates in order', () => {
  const plan = planGoal('login then add to cart and checkout');
  const order = ids(plan);
  assert.ok(order.indexOf('login-fill') !== -1, 'composite keeps login');
  assert.ok(order.indexOf('cart-add') !== -1, 'composite keeps cart');
  assert.ok(order.indexOf('checkout-complete') !== -1, 'composite keeps checkout');
  assert.ok(order.indexOf('login-fill') < order.indexOf('cart-add'), 'login before cart');
  assert.ok(order.indexOf('cart-add') < order.indexOf('checkout-complete'), 'cart before checkout');
});

test('planGoal: generic fallback is never empty (gibberish + empty string)', () => {
  for (const g of ['do something cool on this site', '', '   ', 'xyzzy qqq']) {
    const plan = planGoal(g);
    assert.ok(Array.isArray(plan.phases) && plan.phases.length > 0, `fallback for ${JSON.stringify(g)}`);
    assert.ok(Array.isArray(plan.need_input));
  }
});

test('advancePhase: login-fill requires two distinct verified fields', () => {
  const plan = planGoal('login');
  const fill = plan.phases.find((p) => p.id === 'login-fill');
  assert.ok(fill, 'login has a fill phase');
  assert.equal(advancePhase({ ...fill, done: false, failCount: 0 }, { inputVerified: false }), false);
  assert.equal(advancePhase({ ...fill, done: false, failCount: 0 }, {}), false);
  const live = { ...fill, done: false, failCount: 0 };
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '50,100' }), false);
  assert.equal(live.done, false, 'one filled field is insufficient');
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '50,100' }), false);
  assert.equal(live.verifiedFieldKeys.length, 1, 'same field counts once');
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '50,120' }), true);
  assert.equal(live.done, true, 'two distinct fields complete the phase');
  const generic = { ...fill, id: 'form-fill', done: false, failCount: 0 };
  assert.equal(advancePhase(generic, { inputVerified: true }), true, 'other fill phases are unchanged');
});

test('advancePhase: submit completes on url change (observable signal)', () => {
  const plan = planGoal('login');
  const submit = { ...plan.phases.find((p) => p.kind === 'submit'), done: false, failCount: 0 };
  assert.equal(
    advancePhase(submit, { urlBefore: 'https://www.saucedemo.com/', urlAfter: 'https://www.saucedemo.com/inventory.html' }),
    true
  );
});

test('advancePhase: verify completes on success text like Logout', () => {
  const plan = planGoal('login');
  const verify = { ...plan.phases.find((p) => p.kind === 'verify'), done: false, failCount: 0 };
  assert.equal(advancePhase(verify, { pageText: 'Products ... Logout ...' }), true);
});

test('advancePhase: no hallucination — same url + no text is not done', () => {
  const plan = planGoal('checkout my order');
  const verify = { ...plan.phases.find((p) => p.id === 'checkout-verify'), done: false, failCount: 0 };
  assert.equal(
    advancePhase(verify, { urlBefore: 'https://x.test/cart', urlAfter: 'https://x.test/cart', pageText: 'Your Cart empty' }),
    false
  );
});

test('advancePhase: cart verify completes on Cart text', () => {
  const plan = planGoal('add to cart');
  const verify = { ...plan.phases.find((p) => p.id === 'cart-verify'), done: false, failCount: 0 };
  assert.equal(advancePhase(verify, { pageText: 'Your Cart (1 item) Checkout' }), true);
});

test('advancePhase: stuck rule — 3 failed actions -> {blocked, reason}', () => {
  const plan = planGoal('login');
  const phase = { ...plan.phases[0], done: false, failCount: 0 };
  assert.equal(advancePhase(phase, { actionFailed: true }), false);
  assert.equal(advancePhase(phase, { actionFailed: true }), false);
  const third = advancePhase(phase, { actionFailed: true });
  assert.ok(third && typeof third === 'object', 'third failure returns an object');
  assert.equal(third.blocked, true);
  assert.equal(typeof third.reason, 'string');
  assert.ok(third.reason.length > 0);
});

// M1 gate (a): a single verified fill leaves login-fill OPEN.
test('M1 gate (a): 1 verified fill -> OPEN', () => {
  const plan = planGoal('login');
  const fill = plan.phases.find((p) => p.id === 'login-fill');
  const live = { ...fill, done: false, failCount: 0 };
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '640,174' }), false);
  assert.equal(live.done, false, 'one field must not complete login-fill');
  assert.equal(live.verifiedFieldKeys.length, 1, 'exactly 1 distinct key recorded');
});

// M1 gate (b): two distinct verified fills complete login-fill (DONE).
test('M1 gate (b): 2 distinct verified fills -> DONE', () => {
  const plan = planGoal('login');
  const fill = plan.phases.find((p) => p.id === 'login-fill');
  const live = { ...fill, done: false, failCount: 0 };
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '640,174' }), false);
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '640,228' }), true);
  assert.equal(live.done, true, 'two distinct fields complete login-fill');
  assert.equal(live.verifiedFieldKeys.length, 2, 'exactly 2 distinct keys recorded');
});

// M1 gate (c): the same field verified twice stays OPEN (no double-count).
test('M1 gate (c): same field x2 -> OPEN', () => {
  const plan = planGoal('login');
  const fill = plan.phases.find((p) => p.id === 'login-fill');
  const live = { ...fill, done: false, failCount: 0 };
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '640,174' }), false);
  assert.equal(advancePhase(live, { inputVerified: true, inputFieldKey: '640,174' }), false);
  assert.equal(live.done, false, 'same field twice must not complete login-fill');
  assert.equal(live.verifiedFieldKeys.length, 1, 'same key counted once');
});
