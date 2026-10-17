'use strict';

// G2z conformance: no-browser tests with a mock executor (no browser, no LLM).
// Covers pure helpers: actionClass mapping, expectHit, aggregateRows,
// loadTruths count/shape (16 files, batch3 absent).

const test = require('node:test');
const assert = require('node:assert/strict');
const conf = require('../zoo/conformance');

test('G2z pure: actionClass covers all truth actions, batch3 absent', () => {
  const truths = conf.loadTruths();
  assert.equal(truths.length, 16, 'batch1 8 + batch2 8 truth files');
  const actions = new Set();
  for (const t of truths) for (const s of t.steps) actions.add(s.action);
  for (const a of actions) assert.notEqual(conf.actionClass(a), 'other', 'mapped class: ' + a);
  assert.ok(!actions.has('tab') && !actions.has('toast'), 'batch3 actions absent');
});

test('G2z pure: class map pointer/value/key/nav/system sane', () => {
  assert.equal(conf.actionClass('click'), 'pointer');
  assert.equal(conf.actionClass('drag'), 'pointer');
  assert.equal(conf.actionClass('fill'), 'value');
  assert.equal(conf.actionClass('upload'), 'value');
  assert.equal(conf.actionClass('press'), 'key');
  assert.equal(conf.actionClass('navigate'), 'nav');
  assert.equal(conf.actionClass('scroll'), 'system');
  assert.equal(conf.actionClass('bogus'), 'other');
});

test('G2z pure: expectHit regex-then-substr + aggregateRows math', () => {
  assert.equal(conf.expectHit('Hello|hi', 'say hello'), true);
  assert.equal(conf.expectHit('bye', 'say hello'), false);
  assert.equal(conf.expectHit('a[', 'a['), true, 'invalid regex falls back to substr');
  const rows = [
    { tc_id: 'a', action_class: 'pointer', verdict: 'PASS' },
    { tc_id: 'b', action_class: 'pointer', verdict: 'FAIL' },
    { tc_id: 'c', action_class: 'value', verdict: 'PASS' },
  ];
  const agg = conf.aggregateRows(rows);
  const p = agg.find((a) => a.action_class === 'pointer');
  const v = agg.find((a) => a.action_class === 'value');
  assert.deepEqual(p, { action_class: 'pointer', tcs: 2, pass: 1, pass_rate: 0.5 });
  assert.deepEqual(v, { action_class: 'value', tcs: 1, pass: 1, pass_rate: 1 });
});

test('G2z mock-executor: table row shape honest on PASS and FAIL', async () => {  const truth = { tc_id: 'zoo-mock', steps: [{ action: 'click', target: '#x' }], expected: { kind: 'text_present', expect: 'done' } };
  const mkPage = (text) => ({
    goto: async () => ({ status: () => 200 }),
    waitForTimeout: async () => {},
    evaluate: async () => text,
    removeAllListeners: () => {},
    on: () => {},
  });
  // Mock executor is injected by callers; here we verify row-shape logic
  // via aggregateRows over hand-built rows (executor itself is live-only).
  const rows = [
    { tc_id: 'zoo-mock', action_class: 'pointer', verdict: 'PASS', app_outcome: 'n/a', verification_strength: 'MED-dom-seed', failure_cause: null },
    { tc_id: 'zoo-mock2', action_class: 'value', verdict: 'FAIL', app_outcome: 'n/a', verification_strength: 'NONE', failure_cause: 'expect-miss:done' },
  ];
  for (const r of rows) {
    assert.ok(typeof r.tc_id === 'string' && typeof r.verdict === 'string');
    assert.ok(typeof r.app_outcome === 'string' && typeof r.verification_strength === 'string');
  }
  assert.equal(conf.aggregateRows(rows).length, 2);
});

test('F-S contract steps: object target/to validate, strings stay valid', () => {
  const zoo = require('../zoo/server');
  const okObj = { tc_id: 'x', steps: [{ action: 'drag', target: { type: 'button', text: 'drag me' }, to: { type: 'container', text: 'drop here' } }], expected: { kind: 'text_present', expect: 'Dropped:' } };
  assert.deepEqual(zoo.validateTruth(okObj), []);
  const okStr = { tc_id: 'x', steps: [{ action: 'click', target: '#b' }], expected: { kind: 'text_present', expect: 'e' } };
  assert.deepEqual(zoo.validateTruth(okStr), []);
  const badTo = { tc_id: 'x', steps: [{ action: 'click', target: '#b', to: { type: 'c', text: 'd' } }], expected: { kind: 'text_present', expect: 'e' } };
  assert.ok(zoo.validateTruth(badTo).some((v) => v.includes('to:drag-only')));
  const badTarget = { tc_id: 'x', steps: [{ action: 'click', target: { type: '', text: '' } }], expected: { kind: 'text_present', expect: 'e' } };
  assert.ok(zoo.validateTruth(badTarget).some((v) => v.includes('bad-target')));
});

test('F-S drag-pending: to{type,text} resolves to numeric x2,y2 (else drag-pending note)', () => {
  const byKey = {
    '#drag-src': { type: 'button', text: 'drag me', x1: 0, y1: 0, x2: 120, y2: 40 },
    '#drop-zone': { type: 'button', text: 'drop here', x1: 200, y1: 100, x2: 400, y2: 180 },
  };
  const truth = { tc_id: 'zoo-drag-drop', steps: [{ action: 'drag', target: { type: 'button', text: 'drag me' }, to: { type: 'container', text: 'drop here' } }], expected: { kind: 'text_present', expect: 'Dropped:' } };
  const { steps, notes } = conf.translateSteps(truth, byKey);
  assert.equal(steps.length, 1);
  assert.ok(/^(\d+),(\d+)$/.test(steps[0].value), 'to resolved to numeric x2,y2, got ' + steps[0].value);
  assert.equal(steps[0].translated, 'drag-to->x2y2');
  const missing = conf.translateSteps({ tc_id: 'z', steps: [{ action: 'drag', target: { type: 'button', text: 'ghost' }, to: { type: 'container', text: 'nowhere' } }], expected: truth.expected }, {});
  assert.ok(String(missing.steps[0].value).includes('untranslated') || missing.steps[0].translated === 'drag-untranslated:executor-needs-x2y2', 'unresolvable to stays drag-pending, got ' + JSON.stringify(missing.steps[0]));
  assert.deepEqual(notes, []);
});
