'use strict';

// B5-full loop planner: offline tests with injected mock LLM. Zero API calls.

const test = require('node:test');
const assert = require('node:assert/strict');

const { expandForLoop, plan } = require('../src/planner');
const { LOGIN_HINTS } = require('../src/archetypes');

const keepAll = (ids) => async () => JSON.stringify({ keep: ids, note: 'all' });
const allIds = () => expandForLoop('regression', null).map((c) => c.id);

test('B5-full expand: fresh memory -> 6 users + negative + checkout = 8tc', () => {
  const cands = expandForLoop('regression', null);
  assert.equal(cands.length, 8);
  for (const c of cands) {
    assert.ok(c.id && c.objective && Array.isArray(c.steps) && c.steps.length > 0);
  }
  const locked = cands.find((c) => c.id === 'login-locked_out_user');
  assert.equal(locked.expect_rejection, true);
});

test('B5-full expand: covered users drop out next loop (memory-aware)', () => {
  const mem = { runs: [{ phases_done: ['login-standard_user', 'login-problem_user'] }] };
  const cands = expandForLoop('regression', mem);
  assert.equal(cands.length, 6);
  assert.ok(!cands.some((c) => c.id === 'login-standard_user'));
  assert.ok(cands.some((c) => c.id === 'checkout-full'));
});

test('B5-full plan: ONE-llm select + strict retry + unknown fallback', async () => {
  let calls = 0;
  const r1 = await plan(async () => { calls += 1; return keepAll(allIds())(); }, 'g', null);
  assert.equal(calls, 1);
  assert.equal(r1.test_cases.length, 8);
  assert.equal(r1.via, 'llm-first');
  const seen = [];
  const r2 = await plan(async (p) => {
    seen.push(p);
    return seen.length === 1 ? 'prose without object' : keepAll(allIds())();
  }, 'g', null);
  assert.equal(r2.attempts, 2);
  assert.equal(r2.via, 'llm-retry');
  assert.match(seen[1], /JSON ONLY/);
  const r3 = await plan(async () => 'never json', 'g', null);
  assert.equal(r3.via, 'code-order-fallback');
  assert.equal(r3.test_cases.length, 8);
});

test('B5-full plan: mock 6users->8tc shaped with navigation + rejection flags', async () => {
  const r = await plan(keepAll(allIds()), 'saucedemo regression', null);
  assert.equal(r.test_cases.length, 8);
  assert.ok(r.test_cases.every((c) => typeof c.expect_navigation === 'boolean'));
  const users = LOGIN_HINTS.users.map((u) => `login-${u.username}`);
  for (const id of users) assert.ok(r.test_cases.some((c) => c.id === id), id);
});

test('G5 lesson: login fills keep empty target text; every login expects navigation', async () => {
  const r = await plan(keepAll(allIds()), 'saucedemo regression', null);
  const logins = r.test_cases.filter((c) => c.id.startsWith('login-') && c.id !== 'login-negative-empty');
  assert.equal(logins.length, 6);
  for (const tc of logins) {
    assert.equal(tc.steps[0].target.text, '', `${tc.id} user-fill target text empty (hint-link hijack guard)`);
    assert.equal(tc.expect_navigation, true, `${tc.id} failures stay honest FAILs for the oracle layer`);
  }
  const locked = r.test_cases.find((c) => c.id === 'login-locked_out_user');
  assert.equal(locked.expect_rejection, true);
  const neg = r.test_cases.find((c) => c.id === 'login-negative-empty');
  assert.equal(neg.expect_rejection, true);
  for (const tc of r.test_cases) {
    for (const s of tc.steps) {
      if (s.action !== 'fill') continue;
      // Credential-valued fills must keep empty target text (hint-link
      // hijack guard); placeholder-fragment targets (Firs/Las/al) are the
      // deliberate borderless-input exception, proven live in T16 run4.
      const isCredential = LOGIN_HINTS.users.some((u) => u.username === s.value) ||
        s.value === LOGIN_HINTS.password;
      if (isCredential) assert.equal(s.target.text, '', `${tc.id} credential fill target text empty`);
    }
  }
});

test('M2 expand hook: custom expandFn flows through plan()', async () => {
  const custom = [{ id: 'btn-rightclick', objective: 'o', steps: [{ action: 'right_click', target: { type: 'button', text: 'Right Click Me' }, value: '', x: 1, y: 2 }] }];
  const r = await plan(async () => JSON.stringify({ keep: ['btn-rightclick'] }), 'g', null, () => custom);
  assert.equal(r.test_cases.length, 1);
  assert.equal(r.test_cases[0].steps[0].action, 'right_click');
  assert.equal(r.via, 'llm-first');
});
