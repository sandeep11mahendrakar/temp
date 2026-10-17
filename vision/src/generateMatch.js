'use strict';

// GL0 (D37): OFFLINE match-rule + metrics for generated-TC vs zoo-truth.
// Pure — no browser, no network, no LLM. The rule is frozen BEFORE the GL1
// live run so the live results are scored against a pre-registered yardstick
// (no post-hoc tuning). Column values follow the conformance action class.

const { validGeneratedTc } = require('./brain');

const ACTION_CLASS = {
  click: 'pointer', dblclick: 'pointer', right_click: 'pointer', hover: 'pointer', drag: 'pointer',
  fill: 'value', select: 'value', check: 'value', uncheck: 'value', upload: 'value', submit: 'value',
  scroll: 'system', wait: 'system', navigate: 'system', goto: 'system',
};
const MATCH_OVERLAP = 0.5;

function actionClass(action) {
  const k = String(action == null ? '' : action).toLowerCase();
  return Object.prototype.hasOwnProperty.call(ACTION_CLASS, k) ? ACTION_CLASS[k] : null;
}

function tokens(s) {
  return String(s == null ? '' : s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
function norm(s) { return tokens(s).join(''); }

function targetTextOf(step) {
  const t = step && step.target;
  if (typeof t === 'string') return t;
  if (t && typeof t === 'object' && typeof t.text === 'string') return t.text;
  return '';
}

// target-text-overlap: 1 when either normalized side contains the other, else
// the share of the TRUTH target's tokens present in the generated target.
function textOverlap(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na.includes(nb) || nb.includes(na)) return 1;
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!B.size) return 0;
  let hit = 0;
  for (const t of B) if (A.has(t)) hit += 1;
  return hit / B.size;
}

// match-rule: (page-scoped by caller) AND a compatible action-class for the
// matching step pair AND the best step-pair target-text-overlap >= 0.5.
// Class compatibility is checked PER STEP PAIR (not globally) so a generated
// click can never be credited against a truth scroll that merely shares text.
function matchRule(generatedTc, truth) {
  const gSteps = (generatedTc && generatedTc.steps) || [];
  const tSteps = (truth && truth.steps) || [];
  let best = 0;
  for (const gs of gSteps) {
    const gc = actionClass(gs && gs.action);
    if (!gc) continue; // unknown action never matches
    for (const ts of tSteps) {
      const tc = actionClass(ts && ts.action);
      if (!tc || tc !== gc) continue; // per-pair class compatibility
      best = Math.max(best, textOverlap(targetTextOf(gs), targetTextOf(ts)));
    }
  }
  return best >= MATCH_OVERLAP;
}

// metrics (definitions frozen at GL0):
//   truth_coverage       = matched truths / truths (>=1 generated TC matches)
//   schema_validity      = validGeneratedTc pass-rate over generated TCs
//   exec_valid           = ran-without-ERROR rate over generated TCs (null if no results)
//   oracle_pass_vs_truth = oracle PASS rate among matched generated TCs
//   false_pass           = generated TCs that PASS under the ZERO-ACTION
//                          observe-only control (must be 0; control-only)
function scoreGenerated({ page, generated, truths, results, control } = {}) {
  const gens = Array.isArray(generated) ? generated : [];
  const trs = Array.isArray(truths) ? truths : [];
  const res = (results && typeof results === 'object') ? results : {};
  const ctl = (control && typeof control === 'object') ? control : {};
  const n = gens.length;
  const valid = gens.filter((g) => validGeneratedTc(g)).length;
  const matchedTruth = new Set();
  let matchedGens = 0;
  let matchedPass = 0;
  let execOk = 0;
  let execSeen = 0;
  for (const g of gens) {
    const hit = trs.find((t) => matchRule(g, t)) || null;
    const r = res[g && g.id] || null;
    if (r) {
      execSeen += 1;
      if (r.status && r.status !== 'ERROR') execOk += 1;
    }
    if (hit) {
      matchedGens += 1;
      matchedTruth.add(hit.tc_id);
      if (r && r.oracle && r.oracle.verdict === 'PASS') matchedPass += 1;
    }
  }
  const falsePass = gens.filter((g) => {
    const c = ctl[g && g.id];
    return !!(c && c.oracle && c.oracle.verdict === 'PASS');
  }).length;
  return {
    page,
    generated: n,
    schema_validity: n ? valid / n : 0,
    truth_coverage: trs.length ? matchedTruth.size / trs.length : 0,
    exec_valid: execSeen ? execOk / n : null,
    oracle_pass_vs_truth: matchedGens ? matchedPass / matchedGens : 0,
    false_pass: falsePass,
    matched_generated: matchedGens,
  };
}

module.exports = {
  ACTION_CLASS,
  MATCH_OVERLAP,
  actionClass,
  tokens,
  norm,
  targetTextOf,
  textOverlap,
  matchRule,
  scoreGenerated,
};
