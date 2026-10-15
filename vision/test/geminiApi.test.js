'use strict';

// Q12 gemini native-REST tests (mock-only): stubbed fetchImpl, temp envFile,
// fake key 'UNIT-TEST-KEY' (deliberately NOT AIza-shaped so the repo secret
// scan stays at 0). No network, no real keys, no spawns.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createBrain,
  GEMINI_REST_BASE,
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_STATIC_CONTRACT,
  resolveGeminiKey,
  resolveGeminiModel,
  parseRetryDelay,
  buildGeminiBody,
  geminiDecide,
} = require('../src/brain');

const FAKEKEY = 'UNIT-TEST-KEY';
const ACT = '{"action":"click","elementId":"e9"}';

function okFetch(seen, text, usage, finish) {
  return async (url, init) => {
    seen.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    return {
      status: 200, ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text }] }, finishReason: finish || 'STOP' }],
        usageMetadata: usage || { promptTokenCount: 7, candidatesTokenCount: 3 },
      }),
    };
  };
}

// 1. req-shape: exact URL/method/header/body contract.
test('Q12 req-shape: native generateContent contract exact', async () => {
  const seen = [];
  const out = await geminiDecide({ apiKey: FAKEKEY, model: 'm-flash', fetchImpl: okFetch(seen, ACT) }, 'PROMPT-TEXT-SENTINEL');
  assert.equal(seen.length, 1);
  assert.ok(seen[0].url.startsWith(GEMINI_REST_BASE + '/models/'), 'rest base');
  assert.ok(seen[0].url.endsWith('models/m-flash:generateContent'), 'model-bound endpoint');
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].headers['x-goog-api-key'], FAKEKEY);
  const b = seen[0].body;
  assert.equal(b.system_instruction.parts[0].text, GEMINI_STATIC_CONTRACT);
  assert.equal(b.contents[0].role, 'user');
  assert.equal(b.contents[0].parts[0].text, 'PROMPT-TEXT-SENTINEL', 'user prompt text is transmitted verbatim');
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.equal(b.generationConfig.maxOutputTokens, 2048);
  assert.equal(b.generationConfig.maxOutputTokens, GEMINI_MAX_OUTPUT_TOKENS);
  assert.equal(b.generationConfig.temperature, 0);
  assert.ok(!('thinkingConfig' in b.generationConfig), 'thinking omitted by default');
  assert.equal(out.finishReason, 'STOP');
  assert.equal(out.usage.promptTokenCount, 7);
  assert.equal(out.usage.candidatesTokenCount, 3);
  assert.equal(out.usage.thoughtsTokenCount, null);
});

// 2. 429-retry: one RetryInfo wait then success; exactly 2 fetches.
test('Q12 429-retry: honors retryDelay once then succeeds (2 fetches)', async () => {
  const seen = [];
  const sleeps = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    n += 1;
    if (n === 1) {
      return { status: 429, ok: false, json: async () => ({ error: { details: [{ retryDelay: '1s' }] } }) };
    }
    return okFetch(seen, ACT)(url, init);
  };
  const out = await geminiDecide({ apiKey: FAKEKEY, model: 'm', fetchImpl, sleepMs: async (ms) => { sleeps.push(ms); } });
  assert.equal(n, 2);
  assert.deepEqual(sleeps, [1000]);
  assert.equal(JSON.parse(out.text).action, 'click');
});

// 3. quota-throw: 429 x3 => THROW(quota); exactly 3 fetches.
test('Q12 quota-throw: triple 429 throws quota after 3 attempts', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return { status: 429, ok: false, json: async () => ({}) };
  };
  await assert.rejects(geminiDecide({ apiKey: FAKEKEY, model: 'm', fetchImpl, sleepMs: async () => {} }), /THROW\(quota\)/);
  assert.equal(n, 3);
});

// 4. parse-fail-unknown: prose-only 200 => unknown after exactly 2 fetches.
test('Q12 parse-fail-unknown: garbage retries once then unknown (2 fetches)', async () => {
  const seen = [];
  let n = 0;
  const fetchImpl = async (url, init) => { n += 1; return okFetch(seen, 'just prose here')(url, init); };
  const br = createBrain({ mode: 'api', provider: 'gemini', apiKey: FAKEKEY, model: 'm', fetchImpl });
  const r = await br.decide('go');
  assert.equal(n, 2);
  assert.equal(r.json, null);
  assert.equal(r.meta.action, 'unknown');
  assert.equal(r.meta.attempts, 2);
  assert.equal(r.meta.model, 'm');
});

// 5. missing-key-throws: no key anywhere => loud throw, never silent.
test('Q12 missing-key-throws: absent key in missing file and keyless file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-q12key-'));
  try {
    await assert.rejects(geminiDecide({ model: 'm', envFile: path.join(dir, 'nope.env') }), /missing key/);
    const kf = path.join(dir, 'empty.env');
    fs.writeFileSync(kf, 'OTHER_VAR=1\n', 'utf8');
    await assert.rejects(geminiDecide({ model: 'm', envFile: kf }), /absent\/empty/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 6. no-key-in-logs: key never surfaces in text/meta/logs; counts do.
test('Q12 no-key-in-logs: fake key absent from every artifact, counts present', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-q12log-'));
  const log = path.join(dir, 'calls.jsonl');
  const seen = [];
  try {
    const br = createBrain({ mode: 'api', provider: 'gemini', apiKey: FAKEKEY, model: 'm', logFile: log, fetchImpl: okFetch(seen, ACT) });
    const r = await br.decide('go');
    const blob = JSON.stringify(r) + fs.readFileSync(log, 'utf8');
    assert.ok(!blob.includes(FAKEKEY), 'key never in text/meta/logs');
    assert.equal(r.meta.usage.promptTokenCount, 7);
    assert.equal(r.meta.finishReason, 'STOP');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// 7. retry-delay numerics incl 60s cap and garbage default.
test('Q12 retry-delay: 7s/1.5s/700ms parse, 999s capped, garbage 5000', () => {
  assert.equal(parseRetryDelay('retryDelay: "7s"'), 7000);
  assert.equal(parseRetryDelay('1.5s'), 1500);
  assert.equal(parseRetryDelay('700ms'), 700);
  assert.equal(parseRetryDelay('retryDelay: "999s"'), 60000);
  assert.equal(parseRetryDelay('nope'), 5000);
  assert.equal(parseRetryDelay(''), 5000);
});

// 8. model resolve: opts > BRAIN_MODEL env > compiled default id.
test('Q12 model-resolve: opts beats env beats gemini-3.5-flash-lite default', () => {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'BRAIN_MODEL');
  const prev = process.env.BRAIN_MODEL;
  try {
    delete process.env.BRAIN_MODEL;
    assert.equal(GEMINI_DEFAULT_MODEL, 'gemini-3.5-flash-lite');
    assert.equal(resolveGeminiModel({}), GEMINI_DEFAULT_MODEL);
    process.env.BRAIN_MODEL = 'env/gem';
    assert.equal(resolveGeminiModel({}), 'env/gem');
    assert.equal(resolveGeminiModel({ model: 'opts/gem' }), 'opts/gem');
    assert.equal(buildGeminiBody('x', 'lowest').generationConfig.thinkingConfig.thinkingBudget, 0);
  } finally {
    if (had) process.env.BRAIN_MODEL = prev;
    else delete process.env.BRAIN_MODEL;
  }
});
