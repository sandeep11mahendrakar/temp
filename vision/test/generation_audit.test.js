'use strict';

// Lane R3-T12 (worker-4): generation-audit checks for explore-mode test cases.
// Pure + offline (no LLM, no browser, no network, no ports). Encodes the 6
// generation bugs from the D16 first-principles review as assertions over a
// test-case JSON array plus optional run context { urlSpans, phases }.
//
// TDD shape: the old artifact's TC01 (inlined verbatim below — never read
// from disk, so this file cannot depend on the artifact existing) FAILS >=4
// checks; a hand-fixed 3-test suite passes all 6.

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Check helpers (pure)
// ---------------------------------------------------------------------------

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// (1) Click steps must name a real target: empty or glyph-only text (the
// stray degree-sign button class) is recorded junk, not intent.
function checkClickTargets(testCases) {
  const violations = [];
  for (const tc of testCases || []) {
    const steps = Array.isArray(tc.steps) ? tc.steps : [];
    steps.forEach((s, i) => {
      if (String((s && s.action) || '').toLowerCase() !== 'click') return;
      const text = String((s && s.target && s.target.text) || '');
      if (!text.trim() || !/[a-z0-9]/i.test(text)) {
        violations.push({ test: tc.id, step: i + 1, target: (s && s.target) || null });
      }
    });
  }
  return { pass: violations.length === 0, violations };
}

const TAUTOLOGY_MARKER = 'renders non-trivially';
const ROUTE_RE = /(\.html|https?:\/\/|route:|->)/i;
const SIGNAL_RE = /(holds|visible|badge|logged in|error text|cart|inventory|checkout|complete|appears|displayed)/i;

// (2) expected_result must name a route or an observable signal — never the
// vacuous "executes without errors and renders non-trivially" tautology.
function checkExpectedResult(testCases) {
  const violations = [];
  for (const tc of testCases || []) {
    const er = String(tc.expected_result || '');
    let reason = null;
    if (!er.trim()) reason = 'missing expected_result';
    else if (norm(er).includes(TAUTOLOGY_MARKER)) reason = 'vacuous tautology oracle';
    else if (!ROUTE_RE.test(er) && !SIGNAL_RE.test(er)) reason = 'names no route or signal';
    if (reason) violations.push({ test: tc.id, reason });
  }
  return { pass: violations.length === 0, violations };
}

function normUrl(u) {
  return String(u || '').trim().toLowerCase().replace(/\/+$/, '');
}

// (3) expect_navigation must match the recorded URL span (multi-URL run =>
// true). Span comes from run context; falls back to per-step stateUrl fields
// (same source as navigationExpectation); unjudgeable when neither exists.
function checkExpectNavigation(testCases, urlSpans) {
  const violations = [];
  for (const tc of testCases || []) {
    let urls = (urlSpans && urlSpans[tc.id]) || null;
    if (!urls) {
      urls = (Array.isArray(tc.steps) ? tc.steps : [])
        .map((s) => s && s.stateUrl)
        .filter(Boolean);
    }
    const distinct = [...new Set((urls || []).map(normUrl).filter(Boolean))];
    if (!distinct.length) continue;
    const navigated = distinct.length > 1;
    if (Boolean(tc.expect_navigation) !== navigated) {
      violations.push({ test: tc.id, expect_navigation: tc.expect_navigation, urls: distinct });
    }
  }
  return { pass: violations.length === 0, violations };
}

// (4) When completed phases are supplied, every completed phase needs >=1
// test. Tests carrying phase_id are matched exactly; otherwise the count rule
// applies (1-test poverty means N completed phases cannot share one test).
function checkPhaseCoverage(testCases, phases) {
  if (!Array.isArray(phases) || !phases.length) return { pass: true, violations: [] };
  const completed = phases.filter((p) => p && p.done === true).map((p) => p.id);
  if (!completed.length) return { pass: true, violations: [] };
  const tcs = Array.isArray(testCases) ? testCases : [];
  const withPhase = tcs.filter((tc) => typeof tc.phase_id === 'string' && tc.phase_id);
  let violations = [];
  if (withPhase.length) {
    const covered = new Set(withPhase.map((tc) => tc.phase_id));
    violations = completed.filter((id) => !covered.has(id)).map((id) => ({ phase: id, reason: 'no test covers phase' }));
  } else if (tcs.length < completed.length) {
    violations = [{ reason: `1 test for ${completed.length} completed phases`, phases: completed }];
  }
  return { pass: violations.length === 0, violations };
}

function firstTargetKey(tc) {
  const steps = (Array.isArray(tc.steps) ? tc.steps : [])
    .filter((s) => s && String(s.action || '').toLowerCase() !== 'scroll');
  const s = steps[0] || null;
  const t = (s && s.target) || {};
  return [
    String(s ? s.action : '').toLowerCase(),
    String(t.type || '').toLowerCase(),
    norm(t.text),
  ].join('|');
}

// (5) No duplicate first-targets across tests (padded duplicates inflating the
// suite). Mirrors dedupeTests keying, scrolls ignored.
function checkFirstTargets(testCases) {
  const seen = new Map();
  const violations = [];
  for (const tc of testCases || []) {
    const key = firstTargetKey(tc);
    if (seen.has(key)) {
      violations.push({ test: tc.id, duplicates: seen.get(key), key });
    } else {
      seen.set(key, tc.id);
    }
  }
  return { pass: violations.length === 0, violations };
}

// (6) Every fill step carries a non-empty value (empty fills replay nothing).
function checkFillValues(testCases) {
  const violations = [];
  for (const tc of testCases || []) {
    const steps = Array.isArray(tc.steps) ? tc.steps : [];
    steps.forEach((s, i) => {
      if (String((s && s.action) || '').toLowerCase() !== 'fill') return;
      if (!String((s && s.value) || '').trim()) {
        violations.push({ test: tc.id, step: i + 1, reason: 'fill with empty value' });
      }
    });
  }
  return { pass: violations.length === 0, violations };
}

function auditAll(testCases, ctx) {
  ctx = ctx || {};
  return {
    clickTargets: checkClickTargets(testCases),
    expectedResult: checkExpectedResult(testCases),
    expectNavigation: checkExpectNavigation(testCases, ctx.urlSpans),
    phaseCoverage: checkPhaseCoverage(testCases, ctx.phases),
    firstTargets: checkFirstTargets(testCases),
    fillValues: checkFillValues(testCases),
  };
}

function failingChecks(report) {
  return Object.entries(report).filter(([, r]) => !r.pass).map(([k]) => k);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Verbatim paste of vision/storage/outputs/
// test_cases_run_1791724255517_exploration.json (inlined so this file never
// depends on the artifact existing on disk).
const OLD_TC01 = [
  {
    id: 'TC01',
    objective: 'Replays an autonomously discovered visual workflow: fill -> submit(Login) -> click(°) -> click(performance_glitch_user) -> click(Sauce Labs Bike Light)',
    evidence: ['discovered during exploration run run_1791724255517'],
    inferred_behavior: 'Recorded sequence of real executed actions',
    steps: [
      { action: 'fill', x: 640, y: 174, value: 'standard_user', target: { type: 'text_input', text: '' } },
      { action: 'submit', x: null, y: null, value: '', target: { type: 'button', text: 'Login' } },
      { action: 'click', x: 777, y: 228, value: '', target: { type: 'button', text: '°' } },
      { action: 'click', x: 350, y: 558, value: '', target: { type: 'link', text: 'performance_glitch_user' } },
      { action: 'click', x: 969, y: 184, value: '', target: { type: 'link', text: 'Sauce Labs Bike Light' } },
    ],
    expected_result: 'All recorded actions execute without errors and the final page renders non-trivially.',
    expect_navigation: false,
    expected_text: null,
  },
];

// Recorded URL span of run_1791724255517 (visited_urls in the exploration
// result JSON): the run reached inventory + an item page, so a hardcoded
// expect_navigation:false contradicts the recording.
const OLD_URL_SPANS = {
  TC01: [
    'https://www.saucedemo.com/',
    'https://www.saucedemo.com/inventory.html',
    'https://www.saucedemo.com/inventory-item.html?id=0',
  ],
};

// Completed phases per docs/RUN_ANALYSIS_login_20261011.md R3: the phase judge
// marked login-submit/login-verify done on the URL change the human caused.
const OLD_PHASES = [
  { id: 'login-fill', done: true },
  { id: 'login-submit', done: true },
  { id: 'login-verify', done: true },
];

// Hand-fixed suite: one distilled test per completed phase, real targets,
// valued fills, honest navigation flags. Contains no junk clicks.
const FIXED_TCS = [
  {
    id: 'TC-login-fill',
    phase_id: 'login-fill',
    objective: 'Fill both login fields with distinct credentials',
    steps: [
      { action: 'fill', x: 200, y: 200, value: 'standard_user', target: { type: 'text_input', text: 'Username' }, stateUrl: 'https://www.saucedemo.com/' },
      { action: 'fill', x: 200, y: 250, value: 'secret_sauce', target: { type: 'text_input', text: 'Password' }, stateUrl: 'https://www.saucedemo.com/' },
    ],
    expected_result: 'Both login fields hold their entered values on https://www.saucedemo.com/.',
    expect_navigation: false,
    expected_text: null,
  },
  {
    id: 'TC-login-submit',
    phase_id: 'login-submit',
    objective: 'Submit the login form and reach inventory',
    steps: [
      { action: 'click', x: 200, y: 300, value: '', target: { type: 'button', text: 'Login' }, stateUrl: 'https://www.saucedemo.com/inventory.html' },
    ],
    expected_result: 'Login submits and the browser reaches inventory. Route: https://www.saucedemo.com/ -> https://www.saucedemo.com/inventory.html.',
    expect_navigation: true,
    expected_text: null,
  },
  {
    id: 'TC-login-verify',
    phase_id: 'login-verify',
    objective: 'Open a product from the logged-in inventory',
    steps: [
      { action: 'click', x: 300, y: 250, value: '', target: { type: 'link', text: 'Sauce Labs Backpack' }, stateUrl: 'https://www.saucedemo.com/inventory-item.html?id=4' },
    ],
    expected_result: 'Product page opens for the backpack. Route: https://www.saucedemo.com/inventory.html -> https://www.saucedemo.com/inventory-item.html?id=4.',
    expect_navigation: true,
    expected_text: null,
  },
];
const FIXED_URL_SPANS = {
  'TC-login-fill': ['https://www.saucedemo.com/'],
  'TC-login-submit': ['https://www.saucedemo.com/', 'https://www.saucedemo.com/inventory.html'],
  'TC-login-verify': ['https://www.saucedemo.com/inventory.html', 'https://www.saucedemo.com/inventory-item.html?id=4'],
};

// ---------------------------------------------------------------------------
// TDD: old artifact fails, fixed suite passes
// ---------------------------------------------------------------------------

test('R3-T12: old TC01 fails >=3 of the 6 generation checks', () => {
  const report = auditAll(OLD_TC01, { urlSpans: OLD_URL_SPANS, phases: OLD_PHASES });
  const failed = failingChecks(report);
  assert.ok(failed.length >= 3, `old TC01 must fail >=3 checks, failed: ${failed.join(',')}`);
  assert.deepEqual(failed.sort(), ['clickTargets', 'expectNavigation', 'expectedResult', 'phaseCoverage']);
  assert.equal(report.firstTargets.pass, true, 'single-test suite has no duplicates');
  assert.equal(report.fillValues.pass, true, 'old fill carried a value');
});

test('R3-T12: hand-fixed 3-test suite passes all 6 checks', () => {
  const report = auditAll(FIXED_TCS, { urlSpans: FIXED_URL_SPANS, phases: OLD_PHASES });
  const failed = failingChecks(report);
  assert.deepEqual(failed, [], `fixed suite must pass all checks, failed: ${JSON.stringify(report)}`);
});

// ---------------------------------------------------------------------------
// Per-check unit branches
// ---------------------------------------------------------------------------

test('R3-T12 check1: empty-text clicks fail, real-text clicks pass', () => {
  const bad = [{ id: 'T', steps: [{ action: 'click', target: { type: 'button', text: '   ' } }] }];
  assert.equal(checkClickTargets(bad).pass, false);
  const good = [{ id: 'T', steps: [{ action: 'click', target: { type: 'button', text: 'Login' } }] }];
  assert.equal(checkClickTargets(good).pass, true);
});

test('R3-T12 check2: exact tautology fails, route-less prose fails, route passes', () => {
  const taut = [{ id: 'T', steps: [], expected_result: OLD_TC01[0].expected_result }];
  assert.equal(checkExpectedResult(taut).pass, false);
  const vague = [{ id: 'T', steps: [], expected_result: 'The thing works fine.' }];
  assert.equal(checkExpectedResult(vague).pass, false);
  const routed = [{ id: 'T', steps: [], expected_result: FIXED_TCS[1].expected_result }];
  assert.equal(checkExpectedResult(routed).pass, true);
});

test('R3-T12 check3: single-URL true fails; span fallback aside, stateUrl works', () => {
  const bad = [{ id: 'T', steps: [], expect_navigation: true }];
  assert.equal(checkExpectNavigation(bad, { T: ['https://a.example/'] }).pass, false);
  const viaState = [{
    id: 'T',
    steps: [
      { action: 'click', stateUrl: 'https://a.example/' },
      { action: 'click', stateUrl: 'https://a.example/b.html' },
    ],
    expect_navigation: true,
  }];
  assert.equal(checkExpectNavigation(viaState, null).pass, true);
});

test('R3-T12 check3: trailing-slash URL pair counts as one page (R5 guard)', () => {
  const tc = [{ id: 'T', steps: [], expect_navigation: false }];
  const spans = { T: ['https://www.saucedemo.com', 'https://www.saucedemo.com/'] };
  assert.equal(checkExpectNavigation(tc, spans).pass, true);
});

test('R3-T12 check4: skipped with no phases; uncovered phase_id fails', () => {
  assert.equal(checkPhaseCoverage(FIXED_TCS, null).pass, true);
  assert.equal(checkPhaseCoverage(FIXED_TCS, []).pass, true);
  const partial = FIXED_TCS.slice(0, 2);
  const report = checkPhaseCoverage(partial, OLD_PHASES);
  assert.equal(report.pass, false);
  assert.deepEqual(report.violations, [{ phase: 'login-verify', reason: 'no test covers phase' }]);
});

test('R3-T12 check5: duplicate first-targets fail (dedupeTests mirror)', () => {
  const dup = [
    { id: 'A', steps: [{ action: 'fill', target: { type: 'text_input', text: 'Username' } }] },
    { id: 'B', steps: [{ action: 'fill', target: { type: 'text_input', text: 'username' } }] },
  ];
  const report = checkFirstTargets(dup);
  assert.equal(report.pass, false);
  assert.equal(report.violations[0].duplicates, 'A');
});

test('R3-T12 check6: empty and whitespace fill values fail', () => {
  const bad = [{ id: 'T', steps: [{ action: 'fill', value: '   ', target: { type: 'text_input', text: 'Password' } }] }];
  assert.equal(checkFillValues(bad).pass, false);
  const good = [{ id: 'T', steps: [{ action: 'fill', value: 'secret_sauce', target: { type: 'text_input', text: 'Password' } }] }];
  assert.equal(checkFillValues(good).pass, true);
});
