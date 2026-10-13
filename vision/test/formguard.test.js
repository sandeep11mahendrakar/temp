'use strict';

/**
 * formguard.test.js — R3-T7 model-agnostic hardening (offline, no LLM/browser).
 * Covers: pre-submit guard helpers, lesson buffer, thought-field parsing +
 * run logging (STUB_LLM), trailing-slash URL compare in the phase judge.
 */
process.env.STUB_LLM = 'true';
process.env.SEED_USERNAME = 'standard_user';
process.env.SEED_PASSWORD = 'secret_sauce';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const explorer = require('../src/explorer');
const { advancePhase } = require('../src/goalPlanner');
const { dedupeTests } = require('../src/testGenerator');

const mkCand = (over = {}) => ({
  elementId: 'elem-0', type: 'text_input', text: '', x: 100, y: 100,
  alreadyTried: false, _key: 'k', ...over,
});
const FP = 'https://x/|a|b';

describe('pickUnfilledInput (form-completion guard)', () => {
  it('returns the topmost empty input with the username value', () => {
    const cands = [mkCand({ elementId: 'e1', y: 200 }), mkCand({ elementId: 'e2', y: 100 })];
    const got = explorer.pickUnfilledInput(cands, [], FP);
    assert.equal(got.candidate.elementId, 'e2');
    assert.equal(got.value, 'standard_user');
  });

  it('gives the bottom input of a stacked pair the password', () => {
    const cands = [mkCand({ elementId: 'e1', y: 100 }), mkCand({ elementId: 'e2', y: 200 })];
    const filled = [{ from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 100, y: 100, value: 'standard_user' } }];
    const got = explorer.pickUnfilledInput(cands, filled, FP);
    assert.equal(got.candidate.elementId, 'e2');
    assert.equal(got.value, 'secret_sauce');
  });

  it('routes /pass/ inputs to the password without position heuristics', () => {
    const cands = [mkCand({ elementId: 'e9', text: 'Password', y: 50 })];
    const got = explorer.pickUnfilledInput(cands, [], FP);
    assert.equal(got.value, 'secret_sauce');
  });

  it('returns null when every input is filled (submit may proceed)', () => {
    const cands = [mkCand({ elementId: 'e1', y: 100 })];
    const filled = [{ from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 100, y: 100, value: 'standard_user' } }];
    assert.equal(explorer.pickUnfilledInput(cands, filled, FP), null);
  });

  it('skips alreadyTried inputs so the guard can never loop forever', () => {
    const cands = [mkCand({ elementId: 'e1', alreadyTried: true })];
    assert.equal(explorer.pickUnfilledInput(cands, [], FP), null);
  });

  it('filledKeysForState ignores empty values and other fingerprints', () => {
    const tr = [
      { from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 1, y: 2, value: '' } },
      { from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 1, y: 2, value: 'v' } },
      { from_fingerprint: 'other', action: { type: 'fill', elementType: 'text_input', elementText: '', x: 1, y: 2, value: 'v' } },
    ];
    assert.equal(explorer.filledKeysForState(tr, FP).size, 1);
  });
});

describe('lesson buffer (Reflexion-lite)', () => {
  beforeEach(() => explorer.clearLessons());
  it('caps at 3, dedupes, formats as numbered block', () => {
    ['a', 'b', 'c', 'd', 'a'].forEach((t) => explorer.noteLesson(t));
    assert.equal(explorer.lessonBlock(), '1. c\n2. d\n3. a'); // 'a' cycled out, then re-added
    explorer.clearLessons();
    assert.equal(explorer.lessonBlock(), '');
  });
});

describe('thought field + run logging (STUB_LLM)', () => {
  it('parses thought and appends one jsonl line per call', async () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'llm-')), 'calls.jsonl');
    explorer.setRunLogFile(tmp);
    try {
      const cands = [{ elementId: 'e1', type: 'link', text: 'x', x: 1, y: 1, alreadyTried: true }];
      const d = await explorer.selectActionLLM(cands, 'ctx', null);
      assert.equal(d.action, 'done');
      assert.equal(typeof d.thought, 'string');
      const lines = fs.readFileSync(tmp, 'utf8').trim().split('\n');
      assert.equal(lines.length, 1);
      const e = JSON.parse(lines[0]);
      assert.equal(e.decision.action, 'done');
      assert.ok('raw' in e && 'lessons' in e);
    } finally {
      explorer.setRunLogFile(null);
      fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
    }
  });
});

describe('phase judge trailing-slash tolerance', () => {  it('submit kind: trailing slash alone is NOT a navigation', () => {
    const ph = { id: 's', kind: 'submit', successSignals: ['logout'], done: false, failCount: 0 };
    assert.equal(advancePhase(ph, { urlBefore: 'https://x.test', urlAfter: 'https://x.test/' }), false);
    assert.equal(ph.done, false);
  });

  it('submit kind: a real URL change still completes', () => {
    const ph = { id: 's', kind: 'submit', successSignals: ['logout'], done: false, failCount: 0 };
    assert.equal(advancePhase(ph, { urlBefore: 'https://x.test/', urlAfter: 'https://x.test/inventory.html' }), true);
  });
});

describe('distillGoalSteps (goal-test distillation)', () => {
  const plan = {
    goal: 'test the login',
    phases: [
      { id: 'login-fill', kind: 'fill', successSignals: [] },
      { id: 'login-submit', kind: 'submit', successSignals: ['logout', 'inventory', 'products'] },
      { id: 'login-verify', kind: 'verify', successSignals: ['logout', 'inventory'] },
    ],
  };
  const step = (over = {}) => ({
    action: 'click', elementId: 'e', elementType: 'button', elementText: '', x: 1, y: 2, value: null, ...over,
  });

  it('null plan returns the chain untouched', () => {
    const chain = [step({ action: 'fill' }), step({ elementText: 'Login' })];
    assert.deepEqual(explorer.distillGoalSteps(chain, null), chain);
  });

  it('keeps fills+submits, drops scrolls and empty-text decorative clicks', () => {
    const chain = [
      step({ action: 'fill', elementText: '' }),
      step({ action: 'fill', elementText: '' }),
      step({ action: 'click', elementText: '' }),
      step({ action: 'scroll', elementText: '' }),
      step({ action: 'click', elementText: 'Login' }),
    ];
    const got = explorer.distillGoalSteps(chain, plan);
    assert.ok(got.length >= 2 && got.length < chain.length);
    assert.ok(got.every((s) => s.action !== 'scroll'));
    assert.ok(got.filter((s) => s.action === 'fill').length === 2);
  });

  it('keeps clicks matching phase success signals', () => {
    const chain = [
      step({ action: 'fill', elementText: '' }),
      step({ action: 'click', elementText: 'Logout' }),
    ];
    const got = explorer.distillGoalSteps(chain, plan);
    assert.equal(got.length, 2);
  });

  it('never empties: all-junk chain returns the original', () => {
    const chain = [step({ action: 'click', elementText: '' }), step({ action: 'scroll', elementText: '' })];
    assert.deepEqual(explorer.distillGoalSteps(chain, plan), chain);
  });

  it('empty chain returns empty without crashing', () => {
    assert.deepEqual(explorer.distillGoalSteps([], plan), []);
  });
});

describe('pickUnfilledInputBatch (form-cluster batching)', () => {
  const batchCand = (over = {}) => ({
    elementId: 'e', type: 'text_input', text: '', x: 100, y: 100,
    alreadyTried: false, _key: 'k', ...over,
  });

  it('batches top-to-bottom with username then password values', () => {
    const cands = [batchCand({ elementId: 'u', y: 100 }), batchCand({ elementId: 'p', y: 200 })];
    const got = explorer.pickUnfilledInputBatch(cands, [], FP);
    assert.equal(got.length, 2);
    assert.equal(got[0].candidate.elementId, 'u');
    assert.equal(got[0].value, 'standard_user');
    assert.equal(got[1].candidate.elementId, 'p');
    assert.equal(got[1].value, 'secret_sauce');
  });

  it('collapses same-row fragments to one representative', () => {
    const cands = [
      batchCand({ elementId: 'u1', y: 100, x: 90 }),
      batchCand({ elementId: 'u2', y: 108, x: 150 }),
      batchCand({ elementId: 'p1', y: 200 }),
    ];
    const got = explorer.pickUnfilledInputBatch(cands, [], FP);
    assert.equal(got.length, 2);
    assert.equal(got[0].candidate.elementId, 'u1');
    assert.equal(got[1].candidate.elementId, 'p1');
  });

  it('caps the batch so spurious inputs cannot flood it', () => {
    const cands = [0, 1, 2, 3, 4, 5].map((i) => batchCand({ elementId: 'e' + i, y: 100 + i * 100 }));
    const got = explorer.pickUnfilledInputBatch(cands, [], FP);
    assert.equal(got.length, 4);
  });

  it('skips filled and alreadyTried inputs', () => {
    const cands = [batchCand({ elementId: 'u', y: 100 }), batchCand({ elementId: 'p', y: 200, alreadyTried: true })];
    const filled = [{ from_fingerprint: FP, action: { type: 'fill', elementType: 'text_input', elementText: '', x: 100, y: 100, value: 'standard_user' } }];
    const got = explorer.pickUnfilledInputBatch(cands, filled, FP);
    assert.equal(got.length, 0);
  });

  it('returns empty array when nothing is open (submit may proceed)', () => {
    assert.deepEqual(explorer.pickUnfilledInputBatch([], [], FP), []);
  });

  it('groupInputsByRow clusters within tolerance', () => {
    const rows = explorer.groupInputsByRow([
      batchCand({ elementId: 'a', y: 100 }),
      batchCand({ elementId: 'b', y: 110 }),
      batchCand({ elementId: 'c', y: 300 }),
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].length, 2);
  });
});

describe('seeded login queue (R3-T4)', () => {
  const cand = (over = {}) => ({
    elementId: 'field', type: 'text_input', text: '', x: 100, y: 100,
    alreadyTried: false, _key: 'key', ...over,
  });

  it('queues distinct username and password fields with seeded values', () => {
    const fields = [
      cand({ elementId: 'user', text: 'Username', y: 100 }),
      cand({ elementId: 'pass', text: 'Password', y: 200 }),
    ];
    const got = explorer.pickSeededLoginBatch(fields, [], FP, { id: 'login-fill' },
      { username: 'standard_user', password: 'secret_sauce' });
    assert.deepEqual(got.map(q => ({ id: q.candidate.elementId, value: q.value })), [
      { id: 'user', value: 'standard_user' },
      { id: 'pass', value: 'secret_sauce' },
    ]);
  });

  it('does not queue outside login-fill or without both credentials', () => {
    const fields = [cand({ elementId: 'u', text: 'Username' }),
      cand({ elementId: 'p', text: 'Password', y: 200 })];
    const creds = { username: 'u', password: 'p' };
    assert.deepEqual(explorer.pickSeededLoginBatch(fields, [], FP, { id: 'signup-fill' }, creds), []);
    assert.deepEqual(explorer.pickSeededLoginBatch(fields, [], FP, { id: 'login-fill' }, null), []);
    assert.deepEqual(explorer.pickSeededLoginBatch(fields, [], FP, { id: 'login-fill' },
      { username: 'u', password: '' }), []);
  });

  it('does not queue a partial batch when only one field is eligible', () => {
    const fields = [
      cand({ elementId: 'u', text: 'Username', y: 100 }),
      cand({ elementId: 'p', text: 'Password', y: 200, alreadyTried: true }),
    ];
    const got = explorer.pickSeededLoginBatch(fields, [], FP, { id: 'login-fill' },
      { username: 'u', password: 'p' });
    assert.deepEqual(got, []);
  });

  it('does not queue a field already filled in the current state', () => {
    const fields = [
      cand({ elementId: 'u', text: 'Username', y: 100 }),
      cand({ elementId: 'p', text: 'Password', y: 200 }),
    ];
    const transitions = [{ from_fingerprint: FP, action: { type: 'fill',
      elementType: 'text_input', elementText: 'Username', x: 100, y: 100, value: 'u' } }];
    const got = explorer.pickSeededLoginBatch(fields, transitions, FP, { id: 'login-fill' },
      { username: 'u', password: 'p' });
    assert.deepEqual(got, []);
  });
});

describe('navigationExpectation (R3-T9 honest expectations)', () => {
  it('single-URL chain: no navigation', () => {
    const r = explorer.navigationExpectation([
      { action: 'fill', stateUrl: 'https://x.test/' },
      { action: 'submit', stateUrl: 'https://x.test/' },
    ]);
    assert.equal(r.navigated, false);
    assert.equal(r.route, ' Route: https://x.test/.');
  });

  it('multi-URL chain: navigation with route', () => {
    const r = explorer.navigationExpectation([
      { action: 'fill', stateUrl: 'https://x.test/' },
      { action: 'click', stateUrl: 'https://x.test/inventory.html' },
    ]);
    assert.equal(r.navigated, true);
    assert.ok(r.route.includes('inventory.html'));
  });

  it('empty chain: no navigation, empty route', () => {
    assert.deepEqual(explorer.navigationExpectation([]), { navigated: false, route: '' });
  });
});

describe('distillGoalSteps glyph rule (R3-T9)', () => {
  const plan = { goal: 'test the login', phases: [{ id: 'login-fill', kind: 'fill', successSignals: [], done: false, failCount: 0 }] };
  it('drops single-glyph junk clicks but keeps fills and submits', () => {
    const chain = [
      { action: 'fill', elementText: '', x: 1, y: 1 },
      { action: 'submit', elementText: 'Login', x: 1, y: 2 },
      { action: 'click', elementText: '°', x: 2, y: 3 },
    ];
    const kept = explorer.distillGoalSteps(chain, plan);
    assert.deepEqual(kept.map((s) => s.action), ['fill', 'submit']);
  });
});

describe('dedupeTests (R3-T9 one-shot diversity)', () => {
  const tc = (id, action, type, text) => ({ id, objective: 'o', steps: [{ action, target: { type, text } }] });
  it('collapses same-target permutations, keeps distinct targets', () => {
    const out = dedupeTests([
      tc('TC01', 'click', 'link', 'Learn more'),
      tc('TC02', 'click', 'link', 'Learn more'),
      tc('TC03', 'click', 'link', 'About'),
    ]);
    assert.deepEqual(out.map((t) => t.id), ['TC01', 'TC03']);
  });

  it('ignores leading scroll steps when comparing', () => {
    const out = dedupeTests([
      { id: 'A', objective: 'o', steps: [{ action: 'scroll' }, { action: 'click', target: { type: 'link', text: 'X' } }] },
      { id: 'B', objective: 'o', steps: [{ action: 'click', target: { type: 'link', text: 'X' } }] },
    ]);
    assert.deepEqual(out.map((t) => t.id), ['A']);
  });
});
