'use strict';

/**
 * phaseTests.js — pure per-phase test builder for Review-3 (R3-T11).
 *
 * buildPhaseTests(transitions, states, phases) groups EXECUTED transitions by
 * completed goal phase and emits one replayable test object per phase:
 *   { phase_id, steps, expect_navigation, evidence }
 *
 * Design (mirrors the live judge semantics in src/goalPlanner.js, offline):
 * - Only transitions with result === 'executed' are grouped; repeated /
 *   skipped / error outcomes are never replayed.
 * - Phases are walked in order with a pointer: each executed transition is
 *   assigned to the current open phase; when the phase's completion rule
 *   fires on that step, the pointer advances (cascade allowed — one step can
 *   close submit and verify together, e.g. a navigation that also carries a
 *   success signal in its URL).
 * - Completion rules per phase kind (observable signals only):
 *     fill            -> first fill step claims it (recorded transitions do
 *                        not store the input_value oracle, so the oracle
 *                        itself cannot be re-checked here; documented).
 *     submit/action/
 *     navigate        -> url change OR success-signal match on element text
 *                        or URL span.
 *     verify          -> success-signal match OR url change.
 *     unknown kind    -> url change OR success-signal match.
 * - Each completed phase yields the DISTILLED PREFIX through its completion
 *   (replayable standalone from the run start): fills/submits always kept,
 *   scrolls dropped, empty-text and single-glyph clicks dropped, other clicks
 *   kept only on success-signal match (same rules as distillGoalSteps in
 *   src/explorer.js, re-stated here so this module stays dependency-free).
 *   A prefix that would distill below 2 steps falls back to the undis tilled
 *   prefix — a phase test is never emptied.
 * - expect_navigation comes from the URL span (distinct URLs > 1), measured
 *   over the FULL prefix: the completing step's navigation is phase evidence
 *   even when that step itself distills out of the replayable steps.
 * - URL comparison is trailing-slash tolerant (RUN_ANALYSIS R3-T7 R5 fix).
 * - Recorded histories carry no intervention attribution: a URL change caused
 *   off-browser (e.g. run_1791724255517 step 6) still completes phases here.
 *   Hands-off demos (RUN_ANALYSIS section 5) are the guard, not this module.
 *
 * Pure + deterministic. Zero dependencies. No LLM, browser, or network.
 */

function norm(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase();
}

function stripUrl(u) {
  return String(u == null ? '' : u).trim().toLowerCase().replace(/\/+$/, '');
}

function urlChanged(before, after) {
  const a = stripUrl(before);
  const b = stripUrl(after);
  return Boolean(a && b && a !== b);
}

function stepAction(t) {
  return norm(t && t.action && t.action.type);
}

function stepText(t) {
  return norm(t && t.action && t.action.elementText);
}

function signalsOf(phase) {
  if (!phase || !Array.isArray(phase.successSignals)) return [];
  return phase.successSignals.map(norm).filter(Boolean);
}

function allSignals(phases) {
  const out = [];
  for (const p of phases || []) {
    for (const s of signalsOf(p)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Mirror of distillGoalSteps signal matching: either direction contains. */
function hitsSignals(text, signals) {
  if (!text || !signals.length) return false;
  return signals.some((sig) => text.includes(sig) || sig.includes(text));
}

function matchedSignals(texts, signals) {
  const found = [];
  for (const sig of signals) {
    if (texts.some((t) => t && (t.includes(sig) || sig.includes(t))) && !found.includes(sig)) {
      found.push(sig);
    }
  }
  return found;
}

function completes(phase, entry) {
  const kind = norm(phase && phase.kind);
  const action = stepAction(entry.t);
  const text = stepText(entry.t);
  const changed = urlChanged(entry.urlBefore, entry.urlAfter);
  const sigs = signalsOf(phase);
  const sigHit = sigs.length > 0 && (
    hitsSignals(text, sigs) ||
    hitsSignals(norm(entry.urlBefore), sigs) ||
    hitsSignals(norm(entry.urlAfter), sigs)
  );
  if (kind === 'fill') return action === 'fill';
  if (kind === 'submit' || kind === 'action' || kind === 'navigate') return changed || sigHit;
  if (kind === 'verify') return sigHit || changed;
  return changed || sigHit;
}

function completionSignals(phase, entry) {
  const sigs = signalsOf(phase);
  return matchedSignals(
    [stepText(entry.t), norm(entry.urlBefore), norm(entry.urlAfter)],
    sigs
  );
}

/** Mirror of distillGoalSteps (explorer.js): keep phase-relevant steps only. */
function distillPrefix(entries, signals) {
  const kept = entries.filter((e) => {
    const action = stepAction(e.t);
    if (action === 'fill' || action === 'submit') return true;
    if (action === 'scroll') return false;
    const text = stepText(e.t);
    if (!text) return false;
    if (!/[a-z0-9]/i.test(text)) return false;
    return hitsSignals(text, signals);
  });
  return kept.length >= 2 ? kept : entries;
}

function toStepRef(entry) {
  const a = entry.t.action || {};
  return {
    transition_index: entry.index,
    action: String(a.type || ''),
    x: a.x ?? null,
    y: a.y ?? null,
    value: a.value ?? '',
    target: { type: String(a.elementType || ''), text: String(a.elementText || '') },
    url_after: entry.urlAfter || null,
  };
}

/**
 * Build one replayable test per completed goal phase.
 * @param {Array} transitions recorded explorer transitions
 * @param {Array} states recorded explorer states ({state_id, url})
 * @param {Array} phases goal plan phases ({id, kind, successSignals})
 * @returns {Array} test objects {phase_id, steps, expect_navigation, evidence}
 */
function buildPhaseTests(transitions, states, phases) {
  if (!Array.isArray(transitions) || !Array.isArray(phases) || !phases.length) return [];
  const stateUrl = new Map();
  for (const s of Array.isArray(states) ? states : []) {
    if (s && typeof s.state_id === 'string') stateUrl.set(s.state_id, s.url || null);
  }
  const signals = allSignals(phases);

  // Executed transitions only, carrying their input index + resolved urls.
  const executed = [];
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    if (!t || typeof t !== 'object') continue;
    if (t.result !== 'executed') continue;
    executed.push({
      index: i,
      t,
      urlBefore: stateUrl.has(t.from_state) ? stateUrl.get(t.from_state) : null,
      urlAfter: typeof t.url_after === 'string' ? t.url_after : null,
    });
  }
  if (!executed.length) return [];

  // Sequential pointer: each executed step belongs to the open phase.
  const completedAt = new Array(phases.length).fill(-1);
  const completedSignals = phases.map(() => []);
  let ptr = 0;
  for (const entry of executed) {
    if (ptr >= phases.length) break;
    while (ptr < phases.length && completes(phases[ptr], entry)) {
      completedAt[ptr] = entry.index;
      completedSignals[ptr] = completionSignals(phases[ptr], entry);
      ptr += 1;
    }
  }

  // One distilled-prefix test per completed phase.
  const tests = [];
  let prefixEnd = -1; // position in `executed` through the latest completion
  for (let p = 0; p < phases.length; p++) {
    if (completedAt[p] < 0) continue;
    const endPos = executed.findIndex((e) => e.index === completedAt[p]);
    if (endPos > prefixEnd) prefixEnd = endPos;
    const prefix = executed.slice(0, prefixEnd + 1);
    const kept = distillPrefix(prefix, signals);
    // Span (urls/states) comes from the FULL prefix: the completing step's
    // navigation is phase evidence even when the step itself distills out.
    // Steps come from the distilled subset: replayable, junk-free.
    const urls = [];
    const seenUrl = new Set();
    const pushUrl = (u) => {
      const s = stripUrl(u);
      if (s && !seenUrl.has(s)) { seenUrl.add(s); urls.push(typeof u === 'string' ? u : s); }
    };
    if (prefix.length) pushUrl(prefix[0].urlBefore);
    for (const e of prefix) pushUrl(e.urlAfter);
    const stateIds = [];
    const seenState = new Set();
    const pushState = (id) => {
      if (typeof id === 'string' && id && !seenState.has(id)) { seenState.add(id); stateIds.push(id); }
    };
    for (const e of prefix) pushState(e.t.from_state);
    if (prefix.length) pushState(prefix[prefix.length - 1].t.to_state);
    tests.push({
      phase_id: phases[p].id,
      steps: kept.map(toStepRef),
      expect_navigation: urls.length > 1,
      evidence: {
        phase_id: phases[p].id,
        completed_at_transition: completedAt[p],
        matched_signals: completedSignals[p],
        urls,
        states: stateIds,
      },
    });
  }
  return tests;
}

module.exports = { buildPhaseTests };
