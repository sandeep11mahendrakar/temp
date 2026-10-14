'use strict';

/**
 * zeroLoop.js — B6 zero-LLM closed loop (all collaborators injected).
 *
 * perceive -> planner -> executor(0 LLM) -> mergeLoop -> delta-stop.
 * Stop rule (exactly as specified): stop when
 *   (loop >= 2 AND delta <= 1) OR covered OR loop >= 5.
 * - delta = newly covered phase ids this loop (via injected mergeLoop,
 *   which mirrors runMemory.mergeRun semantics: null on first sight).
 * - covered = injected isCovered(mem) (default: every planned phase done).
 * - Every phase transition is recorded in history; the loop never calls
 *   any LLM itself — mocks in tests, real pure modules in production.
 * Zero dependencies; never throws on collaborator shape gaps (a throwing
 * collaborator aborts the loop honestly with error set, no silent pass).
 */

const MAX_LOOPS = 5;
const MIN_LOOPS = 2;

function defaultCovered(plan, mem) {
  const ids = (plan && Array.isArray(plan.phases) ? plan.phases : []).map((p) => p && p.id);
  const done = new Set(
    (mem && Array.isArray(mem.runs) ? mem.runs : []).flatMap((r) => (r && Array.isArray(r.phases_done) ? r.phases_done : []))
  );
  return ids.length > 0 && ids.every((id) => done.has(id));
}

async function runZeroLoop(collabs, goal, opts) {
  const {
    perceive, plan, execute, mergeLoop, isCovered,
  } = collabs || {};
  const maxLoops = (opts && Number.isFinite(opts.maxLoops) ? opts.maxLoops : MAX_LOOPS);
  const history = [];
  let mem = (opts && opts.memory) || { version: 1, runs: [] };
  let error = null;
  let loops = 0;
  let lastDelta = null;
  let covered = false;
  let activePlan = null;

  for (let loop = 1; loop <= maxLoops; loop += 1) {
    loops = loop;
    try {
      const state = await perceive({ goal, loop, mem });
      activePlan = await plan(goal, state, mem);
      const result = await execute(activePlan, state, mem);
      const merged = await mergeLoop(mem, result);
      mem = merged && merged.mem ? merged.mem : mem;
      const deltaIds = merged && Array.isArray(merged.delta) ? merged.delta : [];
      lastDelta = merged && merged.delta === null ? null : deltaIds.length;
      const coverFn = typeof isCovered === 'function' ? isCovered : defaultCovered;
      covered = Boolean(await coverFn(activePlan, mem));
      history.push({
        loop,
        state: state && state.id !== undefined ? state.id : null,
        phases: (activePlan && Array.isArray(activePlan.phases) ? activePlan.phases : []).map((p) => (p && p.id) || null),
        executed: result && typeof result.executed === 'number' ? result.executed : null,
        delta: merged && merged.delta !== undefined ? merged.delta : null,
        covered,
      });
      if (covered) break;
      if (loop >= MIN_LOOPS && lastDelta !== null && lastDelta <= 1) break;
    } catch (err) {
      error = err && err.message ? err.message : String(err);
      history.push({ loop, error });
      break;
    }
  }

  return {
    goal: typeof goal === 'string' ? goal : String(goal),
    loops,
    covered,
    lastDelta,
    error,
    mem,
    history,
  };
}

module.exports = {
  MAX_LOOPS,
  MIN_LOOPS,
  defaultCovered,
  runZeroLoop,
};
