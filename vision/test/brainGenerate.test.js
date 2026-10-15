'use strict';

// Q13 brainGenerate tests (mock-only): GENERATE=on/off gate, archetype
// trigger threshold, static-contract prompt with coord-free vdom, tc<=6
// validation with invalid-drop counts, parse-fail-never-done, cap.

const test = require('node:test');
const assert = require('node:assert/strict');

const { brainGenerate, compactVdom, validGeneratedTc, GENERATE_CONTRACT, GENERATE_MAX_TCS } = require('../src/brain');

async function withGenerate(on, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'GENERATE');
  const prev = process.env.GENERATE;
  if (on) process.env.GENERATE = 'on';
  else delete process.env.GENERATE;
  try {
    return await fn();
  } finally {
    if (had) process.env.GENERATE = prev;
    else delete process.env.GENERATE;
  }
}

const TC = (id) => ({ id, objective: `do ${id}`, steps: [{ action: 'click', target: { type: 'button', text: 'Go' }, value: '' }] });

// 1. default-OFF: gate closed, llmCall never invoked, byte-identical.
test('Q13 off: GENERATE unset disables without calling llm', async () => {
  await withGenerate(false, async () => {
    let calls = 0;
    const r = await brainGenerate({ elements: [{ type: 'button', text: 'Go', x: 1, y: 2 }], llmCall: async () => { calls += 1; return '{}'; } });
    assert.equal(r.disabled, true);
    assert.equal(r.triggered, false);
    assert.deepEqual(r.tcs, []);
    assert.equal(calls, 0);
  });
});

// 2. trigger: archetype score >= thr owns the page, no llm call.
test('Q13 trigger: archetypeScore>=thr skips generation', async () => {
  await withGenerate(true, async () => {
    let calls = 0;
    const r = await brainGenerate({ archetypeScore: 0.95, threshold: 0.9, llmCall: async () => { calls += 1; return '{}'; } });
    assert.equal(r.triggered, false);
    assert.equal(r.reason, 'archetype-detected');
    assert.equal(calls, 0);
  });
});

// 3. prompt: static contract + compact vdom (no coords/values) + goal + mem.
test('Q13 prompt: contract + coord-free vdom + goal + mem-delta', async () => {
  await withGenerate(true, async () => {
    let seen = '';
    const r = await brainGenerate({
      archetypeScore: 0.2,
      elements: [{ type: 'text_input', text: 'Username', x: 640, y: 174, value: 'leak?' }],
      goal: 'login sweep',
      mem: { runs: [{ phases_done: ['login-fill'] }] },
      llmCall: async (p) => { seen = p; return JSON.stringify({ tcs: [TC('a')] }); },
    });
    assert.equal(r.triggered, true);
    assert.ok(seen.includes('strict JSON ONLY'));
    assert.ok(seen.includes('"id":"e0"') && seen.includes('"type":"text_input"'));
    assert.ok(!seen.includes('"x"') && !seen.includes('"y"') && !seen.includes('leak?'));
    assert.ok(seen.includes('login sweep') && seen.includes('login-fill'));
    assert.equal(r.tcs.length, 1);
  });
});

// 4. cap: output sliced to <=6/loop with exact attempts.
test('Q13 cap: 8 valid tcs slice to 6, attempts===1', async () => {
  await withGenerate(true, async () => {
    const many = Array.from({ length: 8 }, (_, i) => TC(`t${i}`));
    const r = await brainGenerate({ archetypeScore: 0.1, elements: [], llmCall: async () => JSON.stringify({ tcs: many }) });
    assert.equal(r.tcs.length, GENERATE_MAX_TCS);
    assert.equal(GENERATE_MAX_TCS, 6);
    assert.equal(r.attempts, 1);
    assert.equal(r.callsSpent, 1);
    assert.equal(r.dropped, 0);
  });
});

// 5. invalid-drop: bad shapes dropped and counted, good kept.
test('Q13 invalid-drop: 2 bad dropped+counted, 1 good kept', async () => {
  await withGenerate(true, async () => {
    const r = await brainGenerate({
      archetypeScore: 0.1, elements: [],
      llmCall: async () => JSON.stringify({ tcs: [{ id: '', objective: 'x', steps: [] }, { nope: 1 }, TC('good')] }),
    });
    assert.equal(r.tcs.length, 1);
    assert.equal(r.tcs[0].id, 'good');
    assert.equal(r.dropped, 2);
  });
});

// 6. parse-fail-never-done: prose twice => empty, attempts 2, no done.
test('Q13 parse-fail: prose x2 retries-once then empty-never-done', async () => {
  await withGenerate(true, async () => {
    let n = 0;
    const r = await brainGenerate({ archetypeScore: 0.1, elements: [], llmCall: async () => { n += 1; return 'just words no json'; } });
    assert.equal(n, 2);
    assert.equal(r.parseFail, true);
    assert.deepEqual(r.tcs, []);
    assert.equal(r.attempts, 2);
  });
});

// 7. cap-respected: exhausted budget throws, fresh budget spends exactly 1.
test('Q13 cap: exhausted budget throws LLM_CALL_CAP', async () => {
  await withGenerate(true, async () => {
    await assert.rejects(
      brainGenerate({ archetypeScore: 0.1, elements: [], cap: 2, usedCalls: 2, llmCall: async () => '{}' }),
      /LLM_CALL_CAP=2 exceeded/
    );
    const r = await brainGenerate({ archetypeScore: 0.1, elements: [], cap: 2, usedCalls: 1, llmCall: async () => JSON.stringify({ tcs: [TC('a')] }) });
    assert.equal(r.tcs.length, 1);
    assert.equal(r.callsSpent, 1);
  });
});

// 8. compactVdom/validGeneratedTc units numeric.
test('Q13 units: compact strips coords, validator rejects empties', () => {
  assert.deepEqual(compactVdom([{ type: 'button', text: 'Go', x: 5, y: 6 }]), [{ id: 'e0', type: 'button', text: 'Go' }]);
  assert.equal(validGeneratedTc(TC('a')), true);
  assert.equal(validGeneratedTc({ id: 'a', objective: '', steps: [] }), false);
  assert.ok(typeof GENERATE_CONTRACT === 'string' && GENERATE_CONTRACT.length > 50);
});
