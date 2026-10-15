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
  const transports = {
    api: (prompt, maxTokens) => apiTransport(o.apiConfig, prompt, maxTokens),
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
      usage = mode === 'api' ? (chatCompletion.lastMeta || null) : null;
      json = strictParse(raw);
    }
    // unknown-never-done: only a parsed "done" is done; anything else
    // unparseable becomes unknown (callers must never treat it as done).
    const action = json ? String(json.action || 'unknown').toLowerCase() : 'unknown';
    // Q8: cli reports the EFFECTIVE model (opts > BRAIN_MODEL env > default id),
    // never a silent null when a resolution exists.
    const meta = { mode, model: mode === 'cli' ? resolveCliModel(o) : (o.model || null), action, attempts, usage };
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
