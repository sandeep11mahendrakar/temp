'use strict';

// Lane R3-T3: offline tests for goal wiring. No LLM, no browser, no network.
// Exercises runVision arg parsing + the explorer's goal helpers against the
// REAL Lane R3-T2 planner (require-time fallback covered by null-plan cases).

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGoalPlan,
  currentOpenPhase,
  donePhaseIds,
  goalPromptBlock,
  buildObservation,
  advanceGoalPhase,
  isDoneAllowed,
} = require('../src/explorer');
const { planGoal } = require('../src/goalPlanner');
const { parseVisionArgs } = require('../runVision');

function withGoalEnv(value, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'EXPLORE_GOAL');
  const prev = process.env.EXPLORE_GOAL;
  if (value === undefined) delete process.env.EXPLORE_GOAL;
  else process.env.EXPLORE_GOAL = value;
  try {
    fn();
  } finally {
    if (had) process.env.EXPLORE_GOAL = prev;
    else delete process.env.EXPLORE_GOAL;
  }
}

test('parseVisionArgs: --explore <url> --goal sets EXPLORE_GOAL value', () => {
  const r = parseVisionArgs(['node', 'runVision.js', '--explore', 'https://x.test', '--goal', 'log in']);
  assert.equal(r.exploreMode, true);
  assert.equal(r.targetUrl, 'https://x.test');
  assert.equal(r.goal, 'log in');
});

test('parseVisionArgs: --goal= form + flag before url', () => {
  const r = parseVisionArgs(['node', 'runVision.js', '--goal=checkout now', '--explore', 'https://y.test']);
  assert.equal(r.exploreMode, true);
  assert.equal(r.targetUrl, 'https://y.test');
  assert.equal(r.goal, 'checkout now');
});

test('parseVisionArgs: no goal -> empty string, defaults kept', () => {
  const r = parseVisionArgs(['node', 'runVision.js', '--explore', 'https://z.test']);
  assert.equal(r.goal, '');
  const d = parseVisionArgs(['node', 'runVision.js']);
  assert.equal(d.exploreMode, false);
  assert.equal(d.targetUrl, 'https://demoqa.com');
});

test('buildGoalPlan: env goal builds a real plan; empty env -> null', () => {
  withGoalEnv('log in to saucedemo', () => {
    const plan = buildGoalPlan();
    assert.ok(plan && Array.isArray(plan.phases) && plan.phases.length > 0);
    assert.ok(plan.phases.some((p) => p.id === 'login-fill'));
  });
  withGoalEnv('', () => assert.equal(buildGoalPlan(), null));
  withGoalEnv(undefined, () => assert.equal(buildGoalPlan(), null));
});

test('goalPromptBlock carries GOAL + current phase + done phases', () => {
  const plan = planGoal('log in');
  let block = goalPromptBlock(plan);
  assert.ok(block.includes('GOAL: log in'));
  assert.ok(block.includes('login-fill'));
  assert.ok(block.includes('(none yet)'));
  assert.ok(block.includes('Do NOT output "done"'));
  const fill = plan.phases.find((p) => p.kind === 'fill');
  advanceGoalPhase(plan, { inputVerified: true, inputFieldKey: '50,100' });
  assert.equal(fill.done, false, 'one verified field must leave login-fill open');
  block = goalPromptBlock(plan);
  assert.ok(block.includes('CURRENT PHASE: login-fill'));
  advanceGoalPhase(plan, { inputVerified: true, inputFieldKey: '50,120' });
  assert.equal(fill.done, true, 'two distinct verified fields complete login-fill');
  block = goalPromptBlock(plan);
  assert.ok(block.includes('COMPLETED PHASES: login-fill'));
  assert.ok(block.includes('CURRENT PHASE: login-submit'));
});

test('isDoneAllowed: false while phases open, true when all done or no plan', () => {
  const plan = planGoal('log in');
  assert.equal(isDoneAllowed(plan), false);
  assert.equal(isDoneAllowed(null), true);
  for (const p of plan.phases) p.done = true;
  assert.equal(isDoneAllowed(plan), true);
  assert.equal(goalPromptBlock(plan).includes('(all phases complete)'), true);
});

test('advanceGoalPhase: null plan is safe; errors never throw', () => {
  assert.deepEqual(advanceGoalPhase(null, {}), { advanced: false, blocked: null });
  assert.deepEqual(advanceGoalPhase(planGoal('login'), undefined), { advanced: false, blocked: null });
});

test('advanceGoalPhase: stuck rule surfaces {blocked} via real planner', () => {
  const plan = planGoal('log in');
  assert.deepEqual(advanceGoalPhase(plan, { actionFailed: true }), { advanced: false, blocked: null });
  assert.deepEqual(advanceGoalPhase(plan, { actionFailed: true }), { advanced: false, blocked: null });
  const third = advanceGoalPhase(plan, { actionFailed: true });
  assert.equal(third.advanced, false);
  assert.equal(typeof third.blocked, 'string');
  assert.ok(third.blocked.length > 0);
});

test('buildObservation keeps observables only', () => {
  assert.deepEqual(
    buildObservation({ urlBefore: 'a', urlAfter: 'b', pageText: 'Logout', inputVerified: true }),
    { urlBefore: 'a', urlAfter: 'b', pageText: 'Logout', inputVerified: true }
  );
  assert.deepEqual(buildObservation({}), {});
  assert.deepEqual(buildObservation({ inputVerified: false, actionFailed: false }), {});
  assert.deepEqual(
    buildObservation({ inputVerified: true, inputFieldKey: '50,100' }),
    { inputVerified: true, inputFieldKey: '50,100' }
  );
});

test('currentOpenPhase / donePhaseIds track progress', () => {
  const plan = planGoal('checkout my order');
  assert.equal(currentOpenPhase(plan).id, 'checkout-open');
  assert.deepEqual(donePhaseIds(plan), []);
  assert.equal(currentOpenPhase(null), null);
  assert.deepEqual(donePhaseIds(null), []);
});
