'use strict';

/**
 * brain.js — N1 one-brain: api|cli|file|mock behind decide().
 *
 * New code requires THIS module, never lib/llmProvider or src/llm directly
 * (grep-proof; existing callers are frozen-grandfathered, untouched here).
 * Invariants (all modes): extractLastJSON-first parsing, ONE strict retry,
 * unknown-never-done, LLM_CALL_CAP, JSONL attempt log with counts only.
 * SECRETS ARE NEVER LOGGED (keys stay in the resolved config object).
 */

const { resolveLLMConfig, chatCompletion } = require('../../lib/llmProvider');
const llm = require('./llm');

const BRAIN_MODES = ['api', 'cli', 'file', 'mock'];
const DEFAULT_CAP = 40;
const CLI_TIMEOUT_MS = 180000;

function pickMode(m) {
  const v = String(m || 'mock').toLowerCase();
  if (!BRAIN_MODES.includes(v)) throw new Error(`brain: unknown mode "${m}" (want ${BRAIN_MODES.join('|')})`);
  return v;
}

// Strict parse: last action-JSON wins; retry exactly once before unknown.
function strictParse(raw) {
  try {
    const o = llm.extractLastJSON(raw) || llm.extractJSON(raw);
    if (o && typeof o === 'object' && typeof o.action === 'string' && o.action) return o;
  } catch (_) { /* fall through to null */ }
  return null;
}

async function apiTransport(apiConfig, prompt, maxTokens) {
  if (!apiConfig) throw new Error('brain/api: missing apiConfig (resolve via resolveLLMConfig)');
  return chatCompletion(apiConfig, {
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
  });
}

// Q12: native Gemini REST (generateContent) for provider=gemini.
// Key ONLY from opts.apiKey (tests/stubs) or vision/.env GEMINI_API_KEY
// (live); absent => throw, never silent. The key travels ONLY in the
// x-goog-api-key header and is scrubbed from any error text before it can
// reach logs, console, or the board.
const GEMINI_REST_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MAX_OUTPUT_TOKENS = 2048;
const GEMINI_STATIC_CONTRACT = 'You are a test-case planner. Reply with strict JSON ONLY. First character must be {. When selecting test cases reply {"action":"select","keep":[...],"note":"..."} including the action field. No analysis, no prose, no markdown fences.';

function resolveGeminiKey(opts = {}) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  if (typeof o.apiKey === 'string' && o.apiKey.trim()) return o.apiKey.trim();
  const path = require('path');
  const ef = o.envFile || path.join(__dirname, '..', '.env');
  let txt = null;
  try { txt = require('fs').readFileSync(ef, 'utf8'); } catch (_) { /* throw below */ }
  if (txt === null) throw new Error('brain/api-gemini: missing key (no opts.apiKey; vision env unreadable); refusing silent no-auth');
  const line = String(txt).split('\n').map((s) => s.trim()).find((s) => /^GEMINI_API_KEY\s*=/.test(s));
  const v = line ? line.split('=').slice(1).join('=').trim() : '';
  if (!v) throw new Error('brain/api-gemini: GEMINI_API_KEY absent/empty in vision env; refusing silent no-auth');
  return v;
}

function resolveGeminiModel(opts = {}) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  const fromOpts = typeof o.model === 'string' ? o.model.trim() : '';
  if (fromOpts) return fromOpts;
  const fromEnv = typeof process.env.BRAIN_MODEL === 'string' ? process.env.BRAIN_MODEL.trim() : '';
  if (fromEnv) return fromEnv;
  return GEMINI_DEFAULT_MODEL;
}

// RetryInfo retryDelay looks like "7s" / "7.5s" / "700ms". Unknown => 5000.
function parseRetryDelay(text) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(ms|s)\b/);
  if (!m) return 5000;
  const ms = m[2] === 'ms' ? parseFloat(m[1]) : parseFloat(m[1]) * 1000;
  if (!Number.isFinite(ms) || ms < 0) return 5000;
  return Math.min(Math.round(ms), 60000);
}

function buildGeminiBody(prompt, thinking) {
  const body = {
    system_instruction: { parts: [{ text: GEMINI_STATIC_CONTRACT }] },
    contents: [{ role: 'user', parts: [{ text: String(prompt) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
      temperature: 0,
    },
  };
  // thinking-lowest-if-supported-else-omit: only an explicit 'lowest' adds
  // thinkingConfig; live runs use 'omit' (support undetectable offline).
  if (thinking === 'lowest') body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  return body;
}

function scrubKey(text, key) {
  if (!key) return String(text);
  return String(text).split(key).join('[REDACTED]');
}

async function geminiGenerate(g, prompt) {
  const key = g.key;
  const model = g.model;
  const fetchImpl = g.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('brain/api-gemini: no fetch implementation available');
  const sleepFn = g.sleepMs || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const body = buildGeminiBody(prompt, g.thinking || 'omit');
  const url = GEMINI_REST_BASE + '/models/' + encodeURIComponent(model) + ':generateContent';
  let lastStatus = 0;
  for (let t = 0; t <= 2; t += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('brain/api-gemini: transport error ' + scrubKey((e && e.message) || String(e), key).slice(0, 160));
    }
    lastStatus = res.status;
    if (res.status === 429) {
      let payload = '';
      try { payload = JSON.stringify(await res.json()); } catch (_) { payload = ''; }
      if (t >= 2) throw new Error('brain/api-gemini: quota exhausted after 3 attempts (429); THROW(quota)');
      await sleepFn(parseRetryDelay(payload));
      continue;
    }
    if (!res.ok) {
      let eb = '';
      try { eb = await res.text(); } catch (_) { eb = ''; }
      throw new Error('brain/api-gemini: http ' + res.status + ' ' + scrubKey(eb, key).slice(0, 160));
    }
    const data = await res.json();
    const cands = (data && Array.isArray(data.candidates)) ? data.candidates : [];
    const parts = (cands[0] && cands[0].content && Array.isArray(cands[0].content.parts)) ? cands[0].content.parts : [];
    const text = parts.map((pt) => (pt && typeof pt.text === 'string' ? pt.text : '')).join('');
    const um = (data && data.usageMetadata) || {};
    const num = (v) => (Number.isFinite(v) ? v : null);
    return {
      text,
      finishReason: (cands[0] && cands[0].finishReason) || null,
      usage: {
        promptTokenCount: num(um.promptTokenCount),
        candidatesTokenCount: num(um.candidatesTokenCount),
        thoughtsTokenCount: num(um.thoughtsTokenCount),
      },
    };
  }
  throw new Error('brain/api-gemini: unreachable (status ' + lastStatus + ')');
}

async function geminiDecide(opts, prompt) {
  const key = resolveGeminiKey(opts);
  const model = resolveGeminiModel(opts);
  const out = await geminiGenerate({
    key, model,
    fetchImpl: opts.fetchImpl, sleepMs: opts.sleepMs,
    thinking: opts.geminiThinking || 'omit',
  }, prompt);
  return { text: out.text, usage: out.usage, finishReason: out.finishReason, model };
}

async function listGeminiModels(opts = {}) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  const key = resolveGeminiKey(o);
  const fetchImpl = o.fetchImpl || global.fetch;
  const res = await fetchImpl(GEMINI_REST_BASE + '/models?pageSize=100', {
    method: 'GET', headers: { 'x-goog-api-key': key },
  });
  if (!res.ok) {
    let eb = '';
    try { eb = await res.text(); } catch (_) { eb = ''; }
    throw new Error('brain/api-gemini: models http ' + res.status + ' ' + scrubKey(eb, key).slice(0, 160));
  }
  const data = await res.json();
  return ((data && Array.isArray(data.models)) ? data.models : []).map((m) => ({
    name: m.name, supportedGenerationMethods: m.supportedGenerationMethods || [],
  }));
}

// CLI transport: spawn `opencode run --format json -m <model> <prompt>`,
// prompt ALSO staged to a temp file (audit trail); 180s timeout kills.
// runFn is injectable (tests); default uses child_process.spawn lazily so
// merely requiring this module never spawns.
function defaultCliRun(cmd, args, timeoutMs) {
  const { spawn } = require('child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { shell: process.platform === 'win32' });
    let out = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { child.kill(); } catch (_) {}
      reject(new Error(`brain/cli: timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => { out += String(d); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      if (code !== 0) return reject(new Error(`brain/cli: exit ${code}`));
      resolve(out);
    });
  });
}

function lastJsonBlock(text) {
  const t = String(text || '');
  try { return JSON.parse(t); } catch (_) {}
  let best = null;
  let depth = 0; let start = -1; let inStr = false; let esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) start = i; depth += 1; }
    else if (ch === '}') {
      if (depth > 0 && --depth === 0 && start >= 0) {
        try { best = JSON.parse(t.slice(start, i + 1)); } catch (_) {}
        start = -1;
      }
    }
  }
  return best;
}

// Q8: cli model resolution is explicit-never-silent. Order: opts.model,
// then BRAIN_MODEL env, then the Q2b-verified default id. An explicitly
// emptied source (opts.model === '' or BRAIN_MODEL set-but-empty) throws
// instead of silently falling back; unset-everything takes the default.
const DEFAULT_CLI_MODEL = 'opencode/muse-spark-1.3-contributor-free';

function resolveCliModel(opts = {}) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  const envSet = Object.prototype.hasOwnProperty.call(process.env, 'BRAIN_MODEL');
  const fromEnv = typeof process.env.BRAIN_MODEL === 'string' ? process.env.BRAIN_MODEL.trim() : '';
  if (typeof o.model === 'string') {
    const m = o.model.trim();
    if (m) return m;
    throw new Error('brain/cli: opts.model is empty; refusing silent default (pass -m or set BRAIN_MODEL)');
  }
  if (fromEnv) return fromEnv;
  if (envSet) throw new Error('brain/cli: BRAIN_MODEL is set but empty; refusing silent default (unset it or give a value)');
  return DEFAULT_CLI_MODEL;
}

async function cliTransport(opts, prompt) {
  const model = resolveCliModel(opts);
  const runFn = opts.runFn || defaultCliRun;
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const stage = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'brain-cli-')), 'prompt.txt');
  fs.writeFileSync(stage, String(prompt), 'utf8');
  try {
    const out = await runFn('opencode', ['run', '--format', 'json', '-m', model, String(prompt)], CLI_TIMEOUT_MS);
    const parsed = lastJsonBlock(out);
    if (parsed && typeof parsed === 'object') {
      const msg = parsed.message || parsed;
      if (typeof msg === 'string') return msg;
      if (msg && typeof msg.content === 'string') return msg.content;
      return JSON.stringify(parsed).slice(0, 4000);
    }
    return String(out).slice(0, 4000);
  } finally {
    try { fs.rmSync(path.dirname(stage), { recursive: true, force: true }); } catch (_) {}
  }
}

// File transport (N0 file-mode): write {prompt} to reqPath, poll repPath
// until timeout; read+parse, then clean both files up.
async function fileTransport(opts, prompt) {
  const fs = require('fs');
  const { reqPath, repPath, timeoutMs = 180000, pollMs = 1000 } = opts;
  if (!reqPath || !repPath) throw new Error('brain/file: need reqPath + repPath');
  fs.writeFileSync(reqPath, JSON.stringify({ prompt: String(prompt), ts: new Date().toISOString() }), 'utf8');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      if (fs.existsSync(repPath)) {
        const raw = fs.readFileSync(repPath, 'utf8');
        try { fs.unlinkSync(repPath); } catch (_) {}
        try { fs.unlinkSync(reqPath); } catch (_) {}
        return raw;
      }
    } catch (_) { /* poll again */ }
    if (Date.now() > deadline) throw new Error('brain/file: reply timeout');
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

function mockTransport(opts, prompt) {
  if (typeof opts.mockReply === 'function') return opts.mockReply(prompt);
  if (typeof opts.mockReply === 'string') return opts.mockReply;
  return '{"action":"unknown","reason":"mock-default"}';
}

function logAttempt(logFile, entry) {
  if (!logFile) return;
  try {
    require('fs').appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_) { /* logging never breaks a call */ }
}

function createBrain(opts = {}) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  const mode = pickMode(o.mode);
  const cap = Number.isFinite(o.cap) ? o.cap : DEFAULT_CAP;
  const logFile = o.logFile || null;
  const stats = { calls: 0 };
  // Q12: api branches on provider; gemini extras ride apiExtra (no shape
  // change for other modes; usage stays counts-only, key never logged).
  const apiExtra = {};
  const transports = {
    api: async (prompt, maxTokens) => {
      if (o.provider === 'gemini') {
        const g = await geminiDecide(o, prompt);
        apiExtra.usage = g.usage; apiExtra.finishReason = g.finishReason; apiExtra.model = g.model;
        return g.text;
      }
      const t = await apiTransport(o.apiConfig, prompt, maxTokens);
      apiExtra.usage = chatCompletion.lastMeta || null; apiExtra.finishReason = null; apiExtra.model = o.model || null;
      return t;
    },
    cli: (prompt) => cliTransport(o, prompt),
    file: (prompt) => fileTransport(o, prompt),
    mock: (prompt) => mockTransport(o, prompt),
  };

  async function decide(prompt, decideOpts = {}) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('brain.decide: prompt must be a non-empty string');
    stats.calls += 1;
    if (stats.calls > cap) throw new Error(`brain: LLM_CALL_CAP=${cap} exceeded`);
    const maxTokens = Number.isFinite(decideOpts.maxTokens) ? decideOpts.maxTokens : 700;
    let attempts = 0;
    let raw = '';
    let json = null;
    let usage = null;
    for (let round = 0; round < 2 && !json; round++) {
      attempts += 1;
      raw = String(await transports[mode](prompt, maxTokens));
      // usage rides the api transport only, captured fresh per call —
      // mock/cli/file modes honestly report null (no provider metering).
      // Q12: gemini usage (token counts) flows via apiExtra; legacy path
      // keeps chatCompletion.lastMeta behavior through the same holder.
      usage = mode === 'api' ? (apiExtra.usage !== undefined ? apiExtra.usage : null) : null;
      json = strictParse(raw);
    }
    // unknown-never-done: only a parsed "done" is done; anything else
    // unparseable becomes unknown (callers must never treat it as done).
    const action = json ? String(json.action || 'unknown').toLowerCase() : 'unknown';
    // Q8: cli reports the EFFECTIVE model (opts > BRAIN_MODEL env > default id),
    // never a silent null when a resolution exists.
    // Q12: api reports the effective gemini model; finishReason rides meta
    // (gemini only, null otherwise) for per-call records.
    const metaModel = mode === 'cli' ? resolveCliModel(o)
      : (mode === 'api' ? (apiExtra.model !== undefined ? apiExtra.model : (o.model || null)) : (o.model || null));
    const metaFinish = mode === 'api' ? (apiExtra.finishReason !== undefined ? apiExtra.finishReason : null) : null;
    const meta = { mode, model: metaModel, action, attempts, usage, finishReason: metaFinish };
    logAttempt(logFile, {
      ts: new Date().toISOString(), mode, model: meta.model,
      action, attempts, usage: meta.usage,
    });
    return { text: raw, json, meta };
  }

  return { mode, cap, stats, decide, MODES: BRAIN_MODES.slice() };
}

module.exports = {
  createBrain,
  BRAIN_MODES,
  DEFAULT_CAP,
  CLI_TIMEOUT_MS,
  DEFAULT_CLI_MODEL,
  resolveCliModel,
  GEMINI_REST_BASE,
  GEMINI_DEFAULT_MODEL,
  GEMINI_MAX_OUTPUT_TOKENS,
  GEMINI_STATIC_CONTRACT,
  resolveGeminiKey,
  resolveGeminiModel,
  parseRetryDelay,
  buildGeminiBody,
  geminiGenerate,
  geminiDecide,
  listGeminiModels,
  // thin re-exports: future callers take these from brain, never the
  // underlying modules directly.
  resolveLLMConfig,
  chatCompletion,
  extractLastJSON: llm.extractLastJSON,
  extractJSON: llm.extractJSON,
  parseAction: llm.parseAction,
  executeAction: llm.executeAction,
  callLLM: llm.callLLM,
};
