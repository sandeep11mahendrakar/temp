'use strict';

/**
 * loopController.js — B6-full v2 loop controller (full implementation, NEW).
 *
 * Complements the frozen B6 v1 mechanism (zeroLoop.js — DO NOT TOUCH):
 * v1 runs abstract collaborators; v2 wires the REAL pure modules into one
 * closed loop with injected IO only at the edges:
 *   perceive (IO) -> planner.plan (ONE mock-LLM select) -> execute (IO,
 *   0 LLM) -> memory.mergeLoop -> delta-stop.
 * Stop rule (exact): (loop >= 2 AND delta <= 1) OR covered OR loop >= 5.
 * - delta = newly covered TC ids this loop (null on first sight).
 * - covered = every planned TC id observed done (executor-reported).
 * - memory is the v2 memory.js store; planner memory ({runs}) is derived
 *   alongside (runs[] of {phases_done}) without touching v1 files.
 * - A throwing collaborator aborts honestly ({error}, no silent pass).
 * api_calls=0 by construction: the only LLM touchpoint is the injected
 * llmCall (tests inject mocks).
 */

const { plan } = require('./planner');
const { mergeLoop, emptyStore } = require('./memory');

const MAX_LOOPS = 5;
const MIN_LOOPS = 2;

function shouldStop({ loop, delta, covered }) {
  if (covered === true) return true;
  if (loop >= MAX_LOOPS) return true;
  if (loop >= MIN_LOOPS && delta !== null && delta !== undefined && delta <= 1) return true;
  return false;
}

async function runLoops(io, goal, opts) {
  const { perceive, execute, llmCall } = (io && typeof io === 'object' ? io : {});
  const maxLoops = (opts && Number.isFinite(opts.maxLoops) ? opts.maxLoops : MAX_LOOPS);
  const site = (opts && typeof opts.site === 'string' && opts.site) || 'loop-site';
  let store = (opts && opts.store) || emptyStore();
  const runs = [];
  const doneTCs = new Set();
  const history = [];
  let loops = 0;
  let lastDelta = null;
  let covered = false;
  let error = null;

  for (let loop = 1; loop <= maxLoops; loop += 1) {
    loops = loop;
    try {
      const state = await perceive({ goal, loop, site });
      const planned = await plan(llmCall, goal, { runs });
      const ids = planned.test_cases.map((c) => c.id);
      const result = await execute(planned.test_cases, state, { loop, site });
      const done = Array.isArray(result && result.doneTCs) ? result.doneTCs : [];
      for (const id of done) doneTCs.add(id);
      runs.push({ phases_done: done.slice() });
      const merged = mergeLoop(store, {
        site,
        phases_done: [...doneTCs],
        totalPhases: ids.length,
        verdict: result && result.verdict,
        urlAfter: result && result.urlAfter,
      });
      store = merged.store;
      lastDelta = merged.delta === null ? null : merged.delta.length;
      covered = ids.length > 0 && ids.every((id) => doneTCs.has(id));
      history.push({
        loop, planned: ids.length, done: done.slice(),
        delta: merged.delta, covered, via: planned.via,
      });
      if (shouldStop({ loop, delta: lastDelta, covered })) break;
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      history.push({ loop, error });
      break;
    }
  }

  return { goal: String(goal), site, loops, covered, lastDelta, error, store, history };
}

module.exports = {
  MAX_LOOPS,
  MIN_LOOPS,
  shouldStop,
  runLoops,
};
