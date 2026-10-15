'use strict';

// runAuto.js — J2 autonomous loop runner (NEW, <=120 lines, NO live runs).
// CLI: node vision/runAuto.js <url> <goal> [--components=a,b] [--model=m] [--brain=api|cli|file|mock]
// Wires loopController + planner + executor(IO) + memory + report with a
// mock LLM + dry IO by default: LOOPS<=3, LLM_CALL_CAP=40 aborts over
// budget. K4 swaps the IO edges for live runs (zero handoff: same shape).
// --brain default is cli for live (N0: file-mode fallback without a local
// model); tests always run mock. api_calls=0 always here (mock llmCall only).

const { runLoops } = require('./src/loopController');
const { emptyStore } = require('./src/memory');
const { buildLoopReport } = require('./src/report');
const { BRAIN_MODES } = require('./src/brain');
// S1a consumes (never edits): siteLibrary gate + blockDetector hook.
const { classify } = require('./src/blockDetector');
const siteLibrary = require('./src/siteLibrary');
const path = require('node:path');
const MAX_LOOPS = 3;
const LLM_CALL_CAP = 40;
// S1a: stop classes halt pre-plan (zero retry/evasion); login_wall continues
// only when the goal carries auth intent; ok always continues.
const STOP_CLASSES = ['bot_challenge', 'forbidden', 'rate_limit', 'blank_render'];
const BLOCK_STATES = ['ok', 'login_wall', 'bot_challenge', 'forbidden', 'blank_render', 'rate_limit'];
const DEFAULT_SITES_DIR = path.resolve(__dirname, '..', 'sites');

function goalHasAuth(goal) {
  return /log[\s-]?in|sign[\s-]?in|auth|credential|password|locked_out/i.test(String(goal || ''));
}

// prePlanBlock(obs, goal) -> {blocked:{...}} | {blocked:null}.
// Pure; the four STOP_CLASSES stop, login_wall stops unless goal-has-auth.
function prePlanBlock(obs, goal) {
  const c = classify(obs || {});
  if (STOP_CLASSES.includes(c.class)) {
    return { blocked: { verdict: 'BLOCKED', class: c.class, confidence: c.confidence, signals: c.signals, citable: false } };
  }
  if (c.class === 'login_wall' && !goalHasAuth(goal)) {
    return { blocked: { verdict: 'BLOCKED', class: 'login_wall', confidence: c.confidence, signals: c.signals, citable: false } };
  }
  return { blocked: null, class: c.class };
}

class BlockStop extends Error {
  constructor(block) {
    super(`runAuto: BLOCKED(${block.class}) pre-plan, zero retry`);
    this.block = block;
  }
}

// S1a pre-run site gate: unknown/invalid site throws; third_party without
// --permitted is REFUSED (refusal logged via siteLibrary, zero loops run).
function siteGate(o) {
  if (!o.siteId) return null;
  const dir = o.sitesDir || DEFAULT_SITES_DIR;
  const r = siteLibrary.loadSite(dir, o.siteId);
  if (!r.ok) throw new Error(`runAuto: unknown site "${o.siteId}" (no loops run)`);
  const v = siteLibrary.validateSite(siteLibrary.repoRoot(), r.site);
  if (!v.ok) throw new Error(`runAuto: site invalid: ${v.errors.join('; ')}`);
  const gate = siteLibrary.canLaunch(r.site, o.permitted === true);
  if (!gate.ok) {
    siteLibrary.linkRun(siteLibrary.repoRoot(), dir, { site: o.siteId, runId: o.runId || null, evid: null, permitted: o.permitted === true });
    throw new Error(`runAuto: REFUSED ${gate.reason}`);
  }
  return r.site;
}
// N2: --brain selects the one-brain mode; live default is cli (N0 file-mode
// fallback applies when no local model exists). Tests always use mock.
const LIVE_DEFAULT_BRAIN = 'cli';
const STAGES = ['perceive', 'planner', 'executor', 'memory', 'report'];

function parseArgs(argv) {
  const out = { url: null, goal: null, components: STAGES.slice(), model: 'mock', maxLoops: MAX_LOOPS, cap: LLM_CALL_CAP, brain: LIVE_DEFAULT_BRAIN, siteId: null, permitted: false };
  const pos = [];
  for (const a of argv) {
    const m = String(a).match(/^--([^=]+)=(.*)$/);
    if (m && m[1] === 'components') out.components = m[2].split(',').map((s) => s.trim()).filter((s) => STAGES.includes(s));
    else if (m && m[1] === 'model') out.model = m[2] || 'mock';
    else if (m && m[1] === 'site') out.siteId = m[2] || null;
    else if (m && m[1] === 'brain') {
      const b = String(m[2] || '').toLowerCase();
      if (!BRAIN_MODES.includes(b)) throw new Error(`usage: --brain must be ${BRAIN_MODES.join('|')}`);
      out.brain = b;
    }
    else if (m && m[1] === 'max-loops') out.maxLoops = Math.min(parseInt(m[2], 10) || MAX_LOOPS, MAX_LOOPS);
    else if (m && m[1] === 'cap') out.cap = Math.max(parseInt(m[2], 10) || 0, 1);
    else if (String(a) === '--permitted') out.permitted = true;
    else if (!String(a).startsWith('--')) pos.push(a);
  }
  [out.url, out.goal] = pos;
  if (!out.url || !out.goal) throw new Error('usage: runAuto.js <url> <goal> [--components=a,b] [--model=m]');
  return out;
}

// Mock LLM: keep-all selection, counts calls toward cap (throws over cap).
function mockLlmCall(counters, cap) {
  return async (prompt) => {
    counters.llmCalls += 1;
    if (counters.llmCalls > cap) throw new Error(`LLM_CALL_CAP=${cap} exceeded`);
    const m = String(prompt).match(/CANDIDATES: ([^\n]*)/);
    const ids = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
    return JSON.stringify({ keep: ids, note: 'mock-keep-all' });
  };
}

// Dry IO edges (no browser): perceive stubs a session marker, execute
// records planned TCs as dry (never PASS/FAIL — verdict DRY).
function dryIO(counters) {
  return {
    perceive: async ({ loop }) => { counters.perceives += 1; return { id: `dry-loop${loop}` }; },
    execute: async (cases) => { counters.executes += 1; return { doneTCs: [], verdict: 'DRY', dry: true }; },
  };
}

async function buildRunner(opts) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  const counters = { llmCalls: 0, perceives: 0, executes: 0 };
  const cap = Number.isFinite(o.cap) ? o.cap : LLM_CALL_CAP;
  const maxLoops = Math.min(Number.isFinite(o.maxLoops) ? o.maxLoops : MAX_LOOPS, MAX_LOOPS);
  const expandFn = typeof o.expand === 'function' ? o.expand : null;
  // S1a pre-run site gate (absent siteId => byte-identical to before).
  const site = siteGate(o);
  // S1a pre-plan block hook: classify every perceive; a stop class throws
  // BlockStop so planner/executor never run — zero retry, never navigates
  // away. runLoops records the throw as an honest abort (its documented
  // behavior), so buildRunner also captures the block here and converts to
  // the BLOCKED result below. Dry/mock perceives classify ok => pass-through.
  const rawPerceive = o.perceive || dryIO(counters).perceive;
  let stopped = null;
  const perceive = async (ctx) => {
    const obs = await rawPerceive(ctx);
    const chk = prePlanBlock(obs, o.goal);
    if (chk.blocked) { stopped = chk.blocked; throw new BlockStop(chk.blocked); }
    return obs;
  };
  const io = {
    perceive,
    execute: o.execute || dryIO(counters).execute,
    llmCall: o.llmCall || mockLlmCall(counters, cap),
  };
  const baseConfig = { url: o.url, goal: o.goal, maxLoops, cap, brain: o.brain || LIVE_DEFAULT_BRAIN, counters };
  const blockedResult = (block) => {
    const report = buildLoopReport({
      runId: o.runId, source: 'vision-runAuto-blocked', histories: [],
      results: [{ tcId: 'pre-plan-block', exec: { id: 'pre-plan-block', verdict: 'BLOCKED' }, oracle: { app_outcome: 'n/a' } }],
      cost: { api_calls: 0 }, storagePaths: [],
    });
    return {
      config: { ...baseConfig, blocked: block.class, site: site ? site.id : (o.site || null) },
      blocked: block,
      loops: { loops: 0, covered: false, blocked: block.class, history: [] },
      report,
    };
  };
  try {
    const res = await runLoops(io, o.goal, { site: o.site, maxLoops, store: o.store || emptyStore(), expand: expandFn });
    if (stopped) return blockedResult(stopped);
    const report = buildLoopReport({
      runId: o.runId, source: 'vision-runAuto-dry', histories: res.history,
      results: [], cost: { api_calls: 0 }, storagePaths: [],
    });
    return { config: baseConfig, loops: res, report };
  } catch (e) {
    if (e instanceof BlockStop) return blockedResult(e.block);
    throw e;
  }
}

async function main(argv) {
  const cfg = parseArgs(argv);
  const out = await buildRunner({ url: cfg.url, goal: cfg.goal, maxLoops: cfg.maxLoops, cap: cfg.cap, brain: cfg.brain, site: cfg.url, siteId: cfg.siteId, permitted: cfg.permitted, runId: `dry_${Date.now()}` });
  console.log(JSON.stringify({ config: out.config, loops: { loops: out.loops.loops, covered: out.loops.covered }, report: out.report.citable }));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => { console.error(`runAuto: ${e.message}`); process.exit(1); });
}

module.exports = { parseArgs, mockLlmCall, dryIO, buildRunner, MAX_LOOPS, LLM_CALL_CAP, STAGES, STOP_CLASSES, BLOCK_STATES, goalHasAuth, prePlanBlock, siteGate };
