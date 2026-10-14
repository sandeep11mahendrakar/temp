'use strict';

/**
 * goalPlanner.js — deterministic, offline goal-to-phase planner for Review-3.
 *
 * No LLM, no network, no browser. Pure functions only so the explorer can
 * build a plan at startup and advance it from OBSERVABLE signals alone
 * (url change, new visible text like Logout/Cart, input_value verified).
 *
 * Contract (consumed by vision/src/explorer.js Lane R3-T3):
 *   planGoal(goal) -> { goal, phases: [{ id, name, kind, done, failCount }], need_input: [] }
 *   advancePhase(phase, observation) -> boolean | { blocked: true, reason: string }
 *
 * Observation shape (all fields optional; missing data means "no evidence"):
 *   {
 *     urlBefore?: string, urlAfter?: string,
 *     pageText?: string,  newText?: string,
 *     inputVerified?: boolean,   // input_value oracle confirmed the fill landed
 *     actionFailed?: boolean      // the last browser action errored / no-progress
 *   }
 *
 * Stuck rule: 3 failed actions in one phase -> { blocked: true, reason }.
 * Callers check `res && res.blocked` before treating `true` as done.
 */

const MAX_FAILURES = 3;

// B3: templates/order/generic live in the archetype registry (single source);
// this module keeps its exported contract byte-identical (compat-green).
const {
  TEMPLATES,
  ORDER,
  genericPhases,
  normGoal,
} = require('./archetypes');

function stripUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '').toLowerCase();
}

function urlChanged(before, after) {
  const a = stripUrl(before);
  const b = stripUrl(after);
  return Boolean(a && b && a !== b);
}

function textOf(obs) {
  const t = [obs && obs.newText, obs && obs.pageText].filter((x) => typeof x === 'string' && x.length);
  return t.join(' \n ').toLowerCase();
}

function containsAny(haystack, keywords) {
  const h = String(haystack || '').toLowerCase();
  return (keywords || []).some((k) => k && h.includes(String(k).toLowerCase()));
}

/**
 * Build a deterministic phase plan from a free-text goal.
 * Never returns an empty phase list (generic fallback).
 */
function planGoal(goal) {
  const raw = typeof goal === 'string' ? goal : String(goal == null ? '' : goal);
  const g = normGoal(raw);
  const phases = [];
  const needSet = [];
  for (const key of ORDER) {
    const t = TEMPLATES[key];
    let hit = false;
    try {
      hit = t.test(g);
    } catch (_) {
      hit = false;
    }
    if (hit) {
      for (const p of t.phases()) phases.push(p);
      for (const n of t.needInput) if (!needSet.includes(n)) needSet.push(n);
    }
  }
  if (!phases.length) {
    for (const p of genericPhases()) phases.push(p);
  }
  return { goal: raw, phases, need_input: needSet };
}

/**
 * Judge one phase against observable signals only.
 * Mutates phase.failCount / phase.done. Returns:
 *   true  -> phase complete (phase.done set)
 *   false -> not yet complete
 *   { blocked: true, reason } -> stuck (3 failed actions in this phase)
 */
function advancePhase(phase, observation) {
  if (!phase || typeof phase !== 'object') return false;
  const obs = observation && typeof observation === 'object' ? observation : {};
  if (typeof phase.failCount !== 'number') phase.failCount = 0;

  if (obs.actionFailed === true) {
    phase.failCount += 1;
    if (phase.failCount >= MAX_FAILURES) {
      return { blocked: true, reason: `Phase "${phase.id || phase.name || 'unknown'}" stuck after ${phase.failCount} failed actions` };
    }
    return false;
  }

  const kind = String(phase.kind || '').toLowerCase();
  const changed = urlChanged(obs.urlBefore, obs.urlAfter);
  const text = textOf(obs);
  const signals = Array.isArray(phase.successSignals) ? phase.successSignals : [];

  let ok = false;
  if (kind === 'fill') {
    // Login requires two distinct, verified input fields.
    // Other fill phases retain the original single-field contract.
    if (phase.id === 'login-fill') {
      const keys = new Set(Array.isArray(phase.verifiedFieldKeys) ? phase.verifiedFieldKeys : []);
      if (obs.inputVerified === true && typeof obs.inputFieldKey === 'string' && obs.inputFieldKey.trim()) {
        keys.add(obs.inputFieldKey.trim());
      }
      phase.verifiedFieldKeys = [...keys];
      ok = keys.size >= 2;
    } else {
      ok = obs.inputVerified === true;
    }
  } else if (kind === 'submit' || kind === 'action' || kind === 'navigate') {
    ok = changed || (text.length > 0 && containsAny(text, signals));
    // A bare navigation with no signals still counts if the URL moved.
    if (!ok && changed) ok = true;
  } else if (kind === 'verify') {
    ok = (text.length > 0 && containsAny(text, signals)) || changed;
    // Generic fallback verify (no signals): any observable change counts.
    if (!ok && signals.length === 0 && (changed || text.length > 0)) ok = true;
  } else {
    // Unknown kind: conservative — require any observable change.
    ok = changed || obs.inputVerified === true || (text.length > 0 && containsAny(text, signals));
  }

  if (ok) {
    phase.done = true;
    return true;
  }
  return false;
}

module.exports = { planGoal, advancePhase, MAX_FAILURES };
