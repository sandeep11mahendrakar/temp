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
const MAX_LOOPS = 3;
const LLM_CALL_CAP = 40;
// N2: --brain selects the one-brain mode; live default is cli (N0 file-mode
// fallback applies when no local model exists). Tests always use mock.
const LIVE_DEFAULT_BRAIN = 'cli';
const STAGES = ['perceive', 'planner', 'executor', 'memory', 'report'];

function parseArgs(argv) {
  const out = { url: null, goal: null, components: STAGES.slice(), model: 'mock', maxLoops: MAX_LOOPS, cap: LLM_CALL_CAP, brain: LIVE_DEFAULT_BRAIN };
  const pos = [];
  for (const a of argv) {
    const m = String(a).match(/^--([^=]+)=(.*)$/);
    if (m && m[1] === 'components') out.components = m[2].split(',').map((s) => s.trim()).filter((s) => STAGES.includes(s));
    else if (m && m[1] === 'model') out.model = m[2] || 'mock';
    else if (m && m[1] === 'brain') {
      const b = String(m[2] || '').toLowerCase();
      if (!BRAIN_MODES.includes(b)) throw new Error(`usage: --brain must be ${BRAIN_MODES.join('|')}`);
      out.brain = b;
    }
    else if (m && m[1] === 'max-loops') out.maxLoops = Math.min(parseInt(m[2], 10) || MAX_LOOPS, MAX_LOOPS);
    else if (m && m[1] === 'cap') out.cap = Math.max(parseInt(m[2], 10) || 0, 1);
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
  const io = {
    perceive: o.perceive || dryIO(counters).perceive,
    execute: o.execute || dryIO(counters).execute,
    llmCall: o.llmCall || mockLlmCall(counters, cap),
  };
  const res = await runLoops(io, o.goal, { site: o.site, maxLoops, store: o.store || emptyStore(), expand: expandFn });
  const report = buildLoopReport({
    runId: o.runId, source: 'vision-runAuto-dry', histories: res.history,
    results: [], cost: { api_calls: 0 }, storagePaths: [],
  });
  return { config: { url: o.url, goal: o.goal, maxLoops, cap, brain: o.brain || LIVE_DEFAULT_BRAIN, counters }, loops: res, report };
}

async function main(argv) {
  const cfg = parseArgs(argv);
  const out = await buildRunner({ url: cfg.url, goal: cfg.goal, maxLoops: cfg.maxLoops, cap: cfg.cap, brain: cfg.brain, site: cfg.url, runId: `dry_${Date.now()}` });
  console.log(JSON.stringify({ config: out.config, loops: { loops: out.loops.loops, covered: out.loops.covered }, report: out.report.citable }));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => { console.error(`runAuto: ${e.message}`); process.exit(1); });
}

module.exports = { parseArgs, mockLlmCall, dryIO, buildRunner, MAX_LOOPS, LLM_CALL_CAP, STAGES };
