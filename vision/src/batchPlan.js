'use strict';

/**
 * batchPlan.js — B5 ONE-LLM batch test-case contract (mock-LLM only).
 *
 * CODE expands deterministic candidate test cases; ONE LLM call selects and
 * orders them; strict JSON rules apply throughout:
 *   - parse extractLastJSON-first (T1 rule: thought prefix + trailing prose),
 *   - unparseable -> exactly ONE strict retry ("JSON ONLY ..."),
 *   - still bad -> `unknown` (never invent, never done) -> code-order
 *     fallback with an honest via note.
 * Pure except the injected llmCall (tests inject mocks; zero API calls).
 * Reuses dedupeTests (testGenerator, pure) and LOGIN_HINTS (archetypes).
 */

const { extractLastJSON, extractJSON } = require('./llm');
const { LOGIN_HINTS } = require('./archetypes');

function fillStep(value, x, y) {
  return { action: 'fill', target: { type: 'text_input', text: '' }, value, x, y };
}

function clickStep(text, type, x, y) {
  return { action: 'click', target: { type, text }, value: '', x, y };
}

// CODE-expand: deterministic candidates from seeds (no LLM involved).
// Seeds: { users: [{username, locked}], checkout: bool, negative: bool }.
// 6 hint users + checkout + locked-negative expand to 8 candidates.
function expandBatch(seeds) {
  const out = [];
  const users = (seeds && Array.isArray(seeds.users) ? seeds.users : []).filter(
    (u) => u && typeof u.username === 'string' && u.username
  );
  for (const u of users) {
    out.push({
      id: `login-${u.username}`,
      objective: `Login as ${u.username}`,
      expect_navigation: true,
      expected_text: u.locked ? 'Sorry, this user has been locked out' : 'Products',
      steps: [
        fillStep(u.username, 640, 174),
        fillStep(LOGIN_HINTS.password, 640, 228),
        clickStep('Login', 'button', 640, 325),
      ],
    });
  }
  if (seeds && seeds.negative) {
    out.push({
      id: 'login-negative-empty',
      objective: 'Login submit with empty password stays on login page',
      expect_navigation: false,
      expected_text: 'Epic sadface',
      steps: [
        fillStep('standard_user', 640, 174),
        clickStep('Login', 'button', 640, 325),
      ],
    });
  }
  if (seeds && seeds.checkout) {
    out.push({
      id: 'checkout-full',
      objective: 'Login, add backpack, checkout as John/Doe/12345',
      expect_navigation: true,
      expected_text: 'Thank you for your order',
      steps: [
        fillStep('standard_user', 640, 174),
        fillStep(LOGIN_HINTS.password, 640, 228),
        clickStep('Login', 'button', 640, 325),
        clickStep('Add to cart', 'button', 493, 356),
        clickStep('Checkout', 'button', 1155, 428),
      ],
    });
  }
  return out;
}

function parseSelection(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  return extractLastJSON(raw) || extractJSON(raw);
}

function validSelection(sel, candidates) {
  if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return null;
  if (!Array.isArray(sel.keep)) return null;
  const ids = new Set(candidates.map((c) => c.id));
  const seen = new Set();
  const keep = [];
  for (const id of sel.keep) {
    if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) continue;
    seen.add(id);
    keep.push(id);
  }
  if (!keep.length) return null;
  return keep;
}

// ONE-LLM select: strict JSON, exactly one retry, then unknown-fallback.
async function selectBatch(llmCall, candidates, prompt) {
  const ids = candidates.map((c) => c.id).join(',');
  const base = `${prompt}\nCANDIDATES: ${ids}\nReply strict JSON ONLY: {"keep":[...ids in run order],"note":"..."}`;
  let attempts = 0;
  for (const strict of [false, true]) {
    attempts += 1;
    const raw = await llmCall(strict ? `JSON ONLY. NO ANALYSIS. FIRST CHAR {\n${base}` : base);
    const keep = validSelection(parseSelection(raw), candidates);
    if (keep) return { keep, attempts, via: strict ? 'llm-retry' : 'llm-first' };
  }
  return { keep: null, attempts, via: 'unknown' };
}

function validTestCase(tc) {
  return Boolean(tc && typeof tc.id === 'string' && tc.id &&
    typeof tc.objective === 'string' && tc.objective && Array.isArray(tc.steps));
}

async function planBatch(llmCall, seeds, prompt) {
  const expanded = expandBatch(seeds);
  if (!expanded.length) return { test_cases: [], via: 'empty-expand', attempts: 0 };
  const sel = await selectBatch(llmCall, expanded, String(prompt || 'Select regression coverage'));
  const ordered = sel.keep
    ? sel.keep.map((id) => expanded.find((c) => c.id === id)).filter(Boolean)
    : expanded.slice();
  // NOTE: no dedupeTests() here by design. That guard keys on
  // (action,target-type,target-text) and would collapse value-distinct fills
  // (6 usernames, same first step) to one — its contract pins that behavior
  // for free-form LLM output (R3-T9, auditor PASS, do not touch). Selection
  // batches are curated by construction (unique ids); id-level dedupe in
  // validSelection is the complete guard for this layer.
  const testCases = ordered.filter(validTestCase);
  return {
    test_cases: testCases,
    via: sel.keep ? sel.via : 'code-order-fallback',
    attempts: sel.attempts,
  };
}

module.exports = {
  expandBatch,
  parseSelection,
  validSelection,
  selectBatch,
  validTestCase,
  planBatch,
};
