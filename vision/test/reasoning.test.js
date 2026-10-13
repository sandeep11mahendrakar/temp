'use strict';

// T1 reasoning-model JSON starvation (offline, mocked callLLM, zero API calls).
// resolveLLMConfig is pure (no network); selectActionLLM is driven through
// the __setCallLLM test seam with canned model outputs.

const test = require('node:test');
const assert = require('node:assert/strict');

const explorer = require('../src/explorer');
const { extractLastJSON } = require('../src/llm');
const { resolveLLMConfig } = require('../../lib/llmProvider');

const CANDS = [
  { elementId: 'e1', type: 'button', text: 'Login', x: 1, y: 2, alreadyTried: false, _key: 'k1' },
  { elementId: 'e2', type: 'text_input', text: '', x: 1, y: 3, alreadyTried: false, _key: 'k2' },
];

function mock(outputs, seen) {
  let i = 0;
  return async (prompt, opts) => {
    (seen || []).push({ prompt: String(prompt).slice(0, 60), maxTokens: opts && opts.maxTokens });
    const out = outputs[Math.min(i++, outputs.length - 1)];
    if (out instanceof Error) throw out;
    return out;
  };
}

test('setup: reset strikes + clear override after each', async (t) => {
  t.afterEach(() => { explorer.__setCallLLM(null); explorer.__resetParseStrikes(); });
  assert.ok(true);
});

test('reasoning prefix + trailing prose still parses (last JSON wins)', async () => {
  explorer.__resetParseStrikes();
  const seen = [];
  explorer.__setCallLLM(mock([
    'After careful analysis of the screen state, I conclude:\n{"thought":"login form","action":"click","elementId":"e1","reason":"submit"}\nHope this helps.',
  ], seen));
  try {
    const d = await explorer.selectActionLLM(CANDS, 'ctx', null);
    assert.equal(d.action, 'click');
    assert.equal(d.candidate && d.candidate.elementId, 'e1');
    assert.equal(seen[0].maxTokens, 1800);
  } finally { explorer.__setCallLLM(null); }
});

test('prose-only output retries once then goes unknown (never done)', async () => {
  explorer.__resetParseStrikes();
  let calls = 0;
  explorer.__setCallLLM(async () => { calls += 1; return 'just some analytical words, no json here'; });
  try {
    const d = await explorer.selectActionLLM(CANDS, 'ctx', null);
    assert.equal(d.action, 'unknown');
    assert.equal(d.candidate, null);
    assert.equal(calls, 2, 'one strict retry after parse-fail');
  } finally { explorer.__setCallLLM(null); }
});

test('truncated JSON recovered via strict retry', async () => {
  explorer.__resetParseStrikes();
  explorer.__setCallLLM(mock([
    '{"thought":"half a decis',
    '{"thought":"full","action":"fill","elementId":"e2","value":"x","reason":"r"}',
  ]));
  try {
    const d = await explorer.selectActionLLM(CANDS, 'ctx', null);
    assert.equal(d.action, 'fill');
    assert.equal(d.candidate && d.candidate.elementId, 'e2');
  } finally { explorer.__setCallLLM(null); }
});

test('unsupported action value becomes unknown, not done', async () => {
  explorer.__resetParseStrikes();
  explorer.__setCallLLM(mock(['{"thought":"t","action":"dance","elementId":"e1","reason":"r"}']));
  try {
    const d = await explorer.selectActionLLM(CANDS, 'ctx', null);
    assert.equal(d.action, 'unknown');
  } finally { explorer.__setCallLLM(null); }
});

test('extractLastJSON: last action-block wins; null when absent', () => {
  const o = extractLastJSON('noise {"action":"click","x":1} middle {"thought":"t","action":"fill","elementId":"e"} tail');
  assert.equal(o.action, 'fill');
  assert.equal(extractLastJSON('no json at all'), null);
  assert.equal(extractLastJSON('{"nope":1} {"alsono":2}'), null);
});

test('provider reasoning defaults to low, env overrides', () => {
  assert.equal(resolveLLMConfig({ env: {}, prefix: 'X_' }).reasoning, 'low');
  assert.equal(resolveLLMConfig({ env: { LLM_REASONING: 'high' }, prefix: 'X_' }).reasoning, 'high');
  assert.equal(resolveLLMConfig({ env: { X_LLM_REASONING: 'medium' }, prefix: 'X_' }).reasoning, 'medium');
});

test('T7 gemini provider resolves (env-only key+model, no default)', () => {
  const { chatCompletion } = require('../../lib/llmProvider');
  assert.ok(chatCompletion);
  const cfg = resolveLLMConfig({
    env: { X_LLM_PROVIDER: 'gemini', X_LLM_API_KEY: 'k', X_LLM_MODEL: 'gemini-2.0-flash' },
    prefix: 'X_',
  });
  assert.equal(cfg.provider, 'gemini');
  assert.equal(cfg.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(cfg.model, 'gemini-2.0-flash');
  const noModel = resolveLLMConfig({ env: { X_LLM_PROVIDER: 'gemini' }, prefix: 'X_' });
  assert.equal(noModel.model, undefined);
});

test('T7 gemini chatCompletion shape over mocked fetch (no key printed)', async () => {
  const { chatCompletion } = require('../../lib/llmProvider');
  const realFetch = global.fetch;
  let seenUrl = '';
  let seenBody = null;
  global.fetch = async (url, opts) => {
    seenUrl = String(url);
    seenBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"action":"done"}' }, finish_reason: 'stop' }], usage: { completion_tokens: 7 } }) };
  };
  try {
    const text = await chatCompletion(
      { provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'SECRETKEY', model: 'm', reasoning: 'low' },
      { messages: [{ role: 'user', content: 'hi' }] }
    );
    assert.equal(text, '{"action":"done"}');
    assert.ok(seenUrl.startsWith('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'));
    assert.equal(seenBody.reasoning.effort, 'low');
    assert.equal(chatCompletion.lastMeta.finish_reason, 'stop');
    assert.equal(chatCompletion.lastMeta.completion_tokens, 7);
  } finally { global.fetch = realFetch; }
  const realFetch2 = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
  try {
    await assert.rejects(
      chatCompletion({ provider: 'gemini', baseUrl: 'https://x', apiKey: 'SECRETKEY', model: 'm' }, { messages: [] }),
      (e) => { assert.ok(!String(e.message).includes('SECRETKEY'), 'key must never appear in errors'); return true; }
    );
  } finally { global.fetch = realFetch2; }
});
