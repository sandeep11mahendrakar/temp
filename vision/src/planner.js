'use strict';

/**
 * planner.js — B5-full v2 loop planner (full implementation, NEW file).
 *
 * Complements the frozen B5 v1 mechanism (batchPlan.js — DO NOT TOUCH):
 * v1 plans one batch in one shot; v2 plans PER LOOP ITERATION against live
 * memory, so covered users drop out of the next expansion:
 *   plan(llmCall, goal, mem): CODE-expand (uncovered only) -> ONE callLLM
 *     select (strictJSON, exactly one retry, then unknown-fallback) ->
 *     ordered test cases for this loop.
 * Pure except the injected llmCall (tests inject mocks; zero API calls).
 * Reads LOGIN_HINTS (archetypes, read-only) for the user matrix. Never
 * imports batchPlan.js. Mock shape: 6 users + negative + checkout = 8tc.
 */

const { extractLastJSON, extractJSON } = require('./llm');
const { LOGIN_HINTS } = require('./archetypes');

function coveredUsers(mem) {
  const runs = (mem && Array.isArray(mem.runs) ? mem.runs : []);
  const done = new Set();
  for (const r of runs) {
    for (const p of (r && Array.isArray(r.phases_done) ? r.phases_done : [])) {
      const m = String(p).match(/^login-(.+)$/);
      if (m) done.add(m[1]);
    }
  }
  return done;
}

function fillStep(value, x, y, text) {
  return { action: 'fill', target: { type: 'text_input', text: text || '' }, value, x, y };
}

function clickStep(text, type, x, y) {
  return { action: 'click', target: { type, text }, value: '', x, y };
}

// CODE-expand for ONE loop: skip users covered in mem; negative + checkout
// always offered (cheap, high-signal). Deterministic, no LLM involved.
function expandForLoop(goal, mem) {
  const covered = coveredUsers(mem);
  const out = [];
  for (const u of LOGIN_HINTS.users) {
    if (covered.has(u.username)) continue;
    // NOTE (G5 lesson): fill target text stays EMPTY. A username-valued
    // target text fuzzy-matches the credential-HINT links and types into
    // the void (proven live: empty submit + sadface). Coords + proximity
    // resolve empty-text inputs; expect_navigation stays true for every
    // login so failures stay honest FAILs (the oracle layer, not the
    // executor, upgrades expected rejections to PASS/rejected).
    out.push({
      id: `login-${u.username}`,
      objective: `Loop login as ${u.username} (${String(goal || 'regression')})`,
      expect_navigation: true,
      expect_rejection: u.locked === true,
      expected_text: u.locked ? 'locked out' : 'Products',
      steps: [
        fillStep(u.username, 640, 174, ''),
        fillStep(LOGIN_HINTS.password, 640, 228, ''),
        clickStep('Login', 'button', 640, 325),
      ],
    });
  }
  out.push({
    id: 'login-negative-empty',
    objective: 'Loop negative: empty-password submit stays put',
    expect_navigation: false,
    // G5 lesson: empty submit yields Epic-sadface rejection text, so the
    // negative expects rejection (oracle PASS/rejected), never a vacuous
    // body-text PASS standing alone.
    expect_rejection: true,
    expected_text: 'Epic sadface',
    steps: [
      fillStep('standard_user', 640, 174, ''),
      clickStep('Login', 'button', 640, 325),
    ],
  });
  out.push({
    id: 'checkout-full',
    objective: 'Loop checkout: login, backpack, badge-cart, John/Doe/12345 to complete',
    expect_navigation: true,
    expected_text: 'Thank you for your order',
    // Full T16-proven 11-step chain (LoopB run exec_1791906843898 PASS):
    // badge-cart is required (no Checkout button on inventory); borderless
    // form fields resolve via placeholder-fragment targets, never coords.
    steps: [
      fillStep('standard_user', 640, 173, ''),
      fillStep(LOGIN_HINTS.password, 640, 226, ''),
      clickStep('Login', 'button', 640, 325),
      clickStep('Add to cart', 'button', 493, 356),
      { action: 'click', target: { type: 'badge', text: '' }, value: '', x: 1235, y: 19 },
      clickStep('Checkout', 'button', 1155, 428),
      { action: 'fill', target: { type: 'link', text: 'Firs' }, value: 'John', x: 471, y: 273 },
      { action: 'fill', target: { type: 'link', text: 'Las ane' }, value: 'Doe', x: 484, y: 326 },
      { action: 'fill', target: { type: 'link', text: 'al' }, value: '12345', x: 502, y: 379 },
      clickStep('Continue', 'button', 1155, 617),
      clickStep('Finish', 'button', 1140, 698),
    ],
  });
  return out;
}

function parseSelection(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  return extractLastJSON(raw) || extractJSON(raw);
}

// ONE callLLM select: strict JSON, exactly one retry, then unknown.
async function selectForLoop(llmCall, candidates, goal) {
  const ids = candidates.map((c) => c.id).join(',');
  const base = `Goal: ${String(goal || 'regression')}\nCANDIDATES: ${ids}\nReply strict JSON ONLY: {"keep":[...ids in loop order],"note":"..."}`;
  let attempts = 0;
  for (const strict of [false, true]) {
    attempts += 1;
    const raw = await llmCall(strict ? `JSON ONLY. NO ANALYSIS. FIRST CHAR {\n${base}` : base);
    const sel = parseSelection(raw);
    if (sel && typeof sel === 'object' && !Array.isArray(sel) && Array.isArray(sel.keep)) {
      const want = new Set(candidates.map((c) => c.id));
      const seen = new Set();
      const keep = [];
      for (const id of sel.keep) {
        if (typeof id !== 'string' || !want.has(id) || seen.has(id)) continue;
        seen.add(id);
        keep.push(id);
      }
      if (keep.length) return { keep, attempts, via: strict ? 'llm-retry' : 'llm-first' };
    }
  }
  return { keep: null, attempts, via: 'unknown' };
}

function validTestCase(tc) {
  return Boolean(tc && typeof tc.id === 'string' && tc.id &&
    typeof tc.objective === 'string' && tc.objective && Array.isArray(tc.steps));
}

// Full loop plan: expand (memory-aware) -> ONE select -> ordered TCs.
async function plan(llmCall, goal, mem) {
  const expanded = expandForLoop(goal, mem);
  if (!expanded.length) return { test_cases: [], via: 'empty-expand', attempts: 0 };
  const sel = await selectForLoop(llmCall, expanded, goal);
  const ordered = sel.keep
    ? sel.keep.map((id) => expanded.find((c) => c.id === id)).filter(Boolean)
    : expanded.slice();
  return {
    test_cases: ordered.filter(validTestCase),
    via: sel.keep ? sel.via : 'code-order-fallback',
    attempts: sel.attempts,
  };
}

module.exports = {
  coveredUsers,
  expandForLoop,
  parseSelection,
  selectForLoop,
  validTestCase,
  plan,
};
