'use strict';

// N3 brain tests (mock-only): no spawns, no network, no LLM, no keys.
// Covers select/cap/fake-spawn/timeout/garbage/file-handshake/api-parity/
// log-shape/no-secret via injected runFn, temp dirs, and stubbed fetch.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBrain, BRAIN_MODES, DEFAULT_CAP } = require('../src/brain');

const ACT = '{"thought":"t","action":"click","elementId":"e1"}';

// 1. select: mock transport returns parsed action JSON.
test('N3 select: mock reply parses to action', async () => {
  const br = createBrain({ mode: 'mock', mockReply: ACT });
  const r = await br.decide('do it');
  assert.equal(r.meta.action, 'click');
  assert.equal(r.json.elementId, 'e1');
});

// 2. cap: calls past CAP throw, counter exposes spend.
test('N3 cap: over-budget decide throws with cap in message', async () => {
  const br = createBrain({ mode: 'mock', cap: 2, mockReply: ACT });
  await br.decide('a');
  await br.decide('b');
  assert.equal(br.stats.calls, 2);
  await assert.rejects(br.decide('c'), /LLM_CALL_CAP=2 exceeded/);
});

// 3. fake-spawn: cli uses injected runFn, never child_process.
test('N3 fake-spawn: cli parses injected JSON output, no spawn', async () => {
  let seen = null;
  const br = createBrain({
    mode: 'cli', model: 'test/model',
    runFn: async (cmd, args) => { seen = { cmd, args }; return '{"action":"done"}'; },
  });
  const r = await br.decide('finish?');
  assert.equal(seen.cmd, 'opencode');
  assert.ok(seen.args.includes('--format') && seen.args.includes('test/model'));
  assert.equal(r.meta.action, 'done');
});

// 4. timeout: runFn rejection surfaces (spawn contract), no hang.
test('N3 timeout: cli runFn failure rejects the decide', async () => {
  const br = createBrain({ mode: 'cli', runFn: async () => { throw new Error('brain/cli: timeout after 180000ms'); } });
  await assert.rejects(br.decide('x'), /timeout/);
});

// 5. garbage: unparseable output retries once then lands unknown (never done).
test('N3 garbage: prose-only output retries once then unknown', async () => {
  let n = 0;
  const br = createBrain({ mode: 'mock', mockReply: () => { n += 1; return 'just words, no json'; } });
  const r = await br.decide('go');
  assert.equal(n, 2, 'exactly one strict retry');
  assert.equal(r.meta.action, 'unknown');
  assert.equal(r.json, null);
});

// 6. file-handshake: req written, pre-made reply consumed, both cleaned.
test('N3 file-handshake: req/rep round-trip in temp dir', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-n3-'));
  const req = path.join(dir, 'req.json');
  const rep = path.join(dir, 'rep.json');
  fs.writeFileSync(rep, '{"action":"fill","elementId":"e2"}', 'utf8');
  const br = createBrain({ mode: 'file', reqPath: req, repPath: rep, pollMs: 10 });
  const r = await br.decide('fill it');
  assert.equal(r.meta.action, 'fill');
  assert.equal(fs.existsSync(req), false, 'req cleaned');
  assert.equal(fs.existsSync(rep), false, 'rep cleaned');
  fs.rmSync(dir, { recursive: true, force: true });
});

// 7. api-parity: stubbed fetch yields same decide shape as mock path.
test('N3 api-parity: stubbed provider returns action with usage meta', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({
      choices: [{ message: { content: ACT }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
  });
  try {
    const br = createBrain({
      mode: 'api',
      apiConfig: { provider: 'probe', baseUrl: 'https://127.0.0.1:9', apiKey: 'DUMMY', model: 'm', reasoning: null },
    });
    const r = await br.decide('go');
    assert.equal(r.meta.action, 'click');
    assert.deepEqual(r.meta.usage, { finish_reason: 'stop', completion_tokens: 5 });
  } finally { global.fetch = realFetch; }
});

// 8. log-shape: JSONL line carries counts/action, never prompt or key.
test('N3 log-shape: attempt log has action+usage, no prompt, no key', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-n3log-'));
  const log = path.join(dir, 'calls.jsonl');
  const br = createBrain({ mode: 'mock', mockReply: ACT, logFile: log, model: 'm' });
  await br.decide('secret prompt words');
  const line = JSON.parse(fs.readFileSync(log, 'utf8'));
  assert.equal(line.action, 'click');
  assert.equal(line.mode, 'mock');
  assert.ok(!JSON.stringify(line).includes('secret prompt words'), 'prompt never logged');
  fs.rmSync(dir, { recursive: true, force: true });
});

// 9. no-secret: nothing logged or returned carries credentials.
test('N3 no-secret: key material never surfaces in text/meta/logs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-n3key-'));
  const log = path.join(dir, 'calls.jsonl');
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: ACT } }], usage: {} }),
  });
  try {
    const br = createBrain({
      mode: 'api', logFile: log,
      apiConfig: { provider: 'probe', baseUrl: 'https://127.0.0.1:9', apiKey: 'K3Y-MUST-NOT-LEAK', model: 'm', reasoning: null },
    });
    const r = await br.decide('go');
    const blob = JSON.stringify(r) + fs.readFileSync(log, 'utf8');
    assert.ok(!blob.includes('K3Y-MUST-NOT-LEAK'), 'key never in text/meta/logs');
    assert.equal(DEFAULT_CAP, 40);
    assert.deepEqual(BRAIN_MODES, ['api', 'cli', 'file', 'mock']);
  } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
});
