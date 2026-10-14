'use strict';

/**
 * archetypes.js — B3 goal archetype registry (pure, zero dependencies).
 *
 * Four archetypes classify free-text goals; the phase TEMPLATES live here so
 * there is exactly one definition. vision/src/goalPlanner.js consumes this
 * registry — its exported contract (planGoal/advancePhase/MAX_FAILURES and
 * every phase id/kind/signal) is unchanged by the move (compat-green).
 *
 * Archetypes:
 *   login    credential/form fill -> submit -> verify (login, signup, search,
 *            form-submit templates)
 *   crudlist list-CRUD flows: add-to-list -> verify count (addToCart template;
 *            also classifies todo-list verbs, phases stay template-driven)
 *   index    browse-a-catalog goals (classification only; phases fall back to
 *            generic exactly as before — no new template, no behavior change)
 *   generic  match-all fallback marker (genericPhases, never empty)
 *
 * LOGIN_HINTS: saucedemo credential-hint matrix (page-public demo values
 * already used across repo tests). 6 accepted usernames + negatives with
 * honest expected outcomes (locked_out_user must FAIL, never false-DONE).
 */

function mkPhase(id, name, kind, successSignals) {
  return { id, name, kind, successSignals: successSignals || [], done: false, failCount: 0 };
}

// Templates: small ordered phase chains per intent. `kind` drives the judge:
//   fill   -> done only when observation.inputVerified === true
//   submit/action/navigate -> done on url change OR success-signal text
//   verify -> done on success-signal text OR url change
const TEMPLATES = {
  login: {
    test: (g) => /log\s?in|sign\s?in|signin/.test(g),
    needInput: ['username', 'password'],
    phases: () => [
      mkPhase('login-fill', 'Fill login credentials', 'fill', []),
      mkPhase('login-submit', 'Submit login form', 'submit', ['logout', 'inventory', 'products', 'welcome', 'dashboard', 'account']),
      mkPhase('login-verify', 'Verify logged-in state', 'verify', ['logout', 'inventory', 'products', 'welcome', 'dashboard']),
    ],
  },
  signup: {
    test: (g) => /sign\s?up|signup|sign-up|register|create account/.test(g),
    needInput: ['username', 'password', 'email'],
    phases: () => [
      mkPhase('signup-fill', 'Fill signup form', 'fill', []),
      mkPhase('signup-submit', 'Submit signup form', 'submit', ['welcome', 'account created', 'success', 'logout', 'dashboard']),
      mkPhase('signup-verify', 'Verify signup success', 'verify', ['welcome', 'account created', 'success', 'logout']),
    ],
  },
  search: {
    test: (g) => /search|find product|look\s?up|lookup|query/.test(g),
    needInput: [],
    phases: () => [
      mkPhase('search-enter', 'Enter search query', 'fill', []),
      mkPhase('search-submit', 'Submit search', 'submit', ['result', 'found', 'showing', 'search']),
      mkPhase('search-verify', 'Verify search results', 'verify', ['result', 'found', 'showing']),
    ],
  },
  addToCart: {
    test: (g) => /add.?to.?(cart|basket)|add item|add to bag/.test(g),
    needInput: [],
    phases: () => [
      mkPhase('cart-find', 'Find product to add', 'action', ['add to cart', 'add to basket', 'inventory', 'product']),
      mkPhase('cart-add', 'Add product to cart', 'submit', ['cart', 'added', 'badge', '1 item', 'remove']),
      mkPhase('cart-verify', 'Verify cart contents', 'verify', ['cart', 'your cart', '1 item', 'checkout', 'remove']),
    ],
  },
  checkout: {
    test: (g) => /checkout|check out|purchase|place order|complete order|buy now|payment/.test(g),
    needInput: ['firstName', 'lastName', 'postalCode'],
    phases: () => [
      mkPhase('checkout-open', 'Open cart', 'action', ['your cart', 'cart', 'checkout']),
      mkPhase('checkout-fill', 'Fill checkout information', 'fill', []),
      mkPhase('checkout-complete', 'Complete purchase', 'submit', ['thank', 'confirm', 'complete', 'order', 'success', 'checkout: complete']),
      mkPhase('checkout-verify', 'Verify order confirmation', 'verify', ['thank', 'thank you', 'order complete', 'confirmation', 'complete', 'success']),
    ],
  },
  formSubmit: {
    test: (g) => /\bform\b|submit|contact us|feedback|apply|subscribe/.test(g),
    needInput: [],
    phases: () => [
      mkPhase('form-fill', 'Fill form fields', 'fill', []),
      mkPhase('form-submit', 'Submit form', 'submit', ['thank', 'received', 'success', 'submitted', 'confirm']),
      mkPhase('form-verify', 'Verify submission', 'verify', ['thank', 'received', 'success', 'submitted', 'confirm']),
    ],
  },
};

// Canonical order when a goal names several intents
// (e.g. "login then add to cart and checkout" -> login + cart + checkout).
const ORDER = ['login', 'signup', 'search', 'addToCart', 'checkout', 'formSubmit'];

function genericPhases() {
  return [
    mkPhase('explore-observe', 'Observe site state', 'action', []),
    mkPhase('explore-interact', 'Interact with a key element and verify change', 'verify', []),
  ];
}

function normGoal(goal) {
  const raw = typeof goal === 'string' ? goal : String(goal == null ? '' : goal);
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

const ARCHETYPES = {
  login: {
    description: 'credential/form fill -> submit -> verify',
    templates: ['login', 'signup', 'search', 'formSubmit'],
    match: (g) => ['login', 'signup', 'search', 'formSubmit'].some((k) => {
      try {
        return TEMPLATES[k].test(g);
      } catch (_) {
        return false;
      }
    }),
  },
  crudlist: {
    description: 'cart/list domain flows: add-to-list -> verify; checkout chain',
    templates: ['addToCart', 'checkout'],
    match: (g) => {
      try {
        if (TEMPLATES.addToCart.test(g) || TEMPLATES.checkout.test(g)) return true;
      } catch (_) { /* fall through */ }
      return /todo|to-do|task list|shopping list|add .+? to (the )?(list|todos)|complete .*todo|clear completed|filter todos/.test(g);
    },
  },
  index: {
    description: 'browse-a-catalog (classification only; phases use generic fallback)',
    templates: [],
    match: (g) => /browse| catalog|products listing|homepage|landing page|explore (the )?site|window shop/.test(g),
  },
  generic: {
    description: 'match-all fallback marker (genericPhases, never empty)',
    templates: [],
    match: () => true,
  },
};

function classifyGoal(goal) {
  const g = normGoal(goal);
  for (const id of ['login', 'crudlist', 'index', 'generic']) {
    try {
      if (ARCHETYPES[id].match(g)) return id;
    } catch (_) { /* try next */ }
  }
  return 'generic';
}

// Saucedemo credential-hint matrix (page-public demo values, zero secrets).
// `locked` users must yield honest FAIL; all others share secret_sauce.
const LOGIN_HINTS = {
  password: 'secret_sauce',
  users: [
    { username: 'standard_user', locked: false, expects: 'PASS' },
    { username: 'locked_out_user', locked: true, expects: 'FAIL' },
    { username: 'problem_user', locked: false, expects: 'PASS' },
    { username: 'performance_glitch_user', locked: false, expects: 'PASS' },
    { username: 'error_user', locked: false, expects: 'PASS' },
    { username: 'visual_user', locked: false, expects: 'PASS' },
  ],
  negatives: [
    { username: 'locked_out_user', password: 'secret_sauce', expects: 'FAIL', reason: 'account locked' },
    { username: 'standard_user', password: 'wrong_password', expects: 'FAIL', reason: 'bad credentials' },
    { username: 'no_such_user', password: 'secret_sauce', expects: 'FAIL', reason: 'unknown user' },
  ],
};

// ---- Contract layer (P3 audit): archetype={name,detect,hints,expand,oracles}
// Additive: existing TEMPLATES/classifyGoal/LOGIN_HINTS untouched (compat).
// detect(vdom,mem)->0..1; hints(vdom,ocrText)->{}; expand(hints,goal)->tc[].
// tc={id,archetype,params,steps[{action,target{type,text},value,submitKey}],
//      oracle{kind,expect,strength},tags[]}; expect_rejection marks negative
// cases whose satisfied oracle means app-rejected, test-PASS (verdictFor).
const ORACLES = {
  loginSuccess: { kind: 'url_change', expect: 'inventory|products|dashboard|welcome', strength: 'STRONG' },
  loginRejected: { kind: 'text_present', expect: 'locked out|Epic sadface|do not match', strength: 'MED' },
  counterText: { kind: 'text_present', expect: '', strength: 'MED' },
  stateDiff: { kind: 'state_diff', expect: 'visible-state-changed', strength: 'MED' },
  observed: { kind: 'observed', expect: 'recorded-only', strength: 'WEAK' },
};

const CONTRACT = 'archetype={name,detect(vdom,mem)->score0..1,hints(vdom,ocrText)->{},expand(hints,goal)->tc[],oracles}';

function elsOf(vdom) {
  const v = vdom && typeof vdom === 'object' ? vdom : {};
  const els = Array.isArray(v.elements) ? v.elements : (Array.isArray(v) ? v : []);
  return els.filter((e) => e && typeof e === 'object');
}

function hasInput(els, re) {
  return els.some((e) => re.test(String(e.type || '')));
}

function detectLogin(vdom) {
  const els = elsOf(vdom);
  const pass = els.some((e) => /password/i.test(String(e.type || '')));
  const fill = hasInput(els, /text_input|search_field|password|input/i);
  const btn = els.some((e) => /button|submit/i.test(String(e.type || '')) || /log\s?in|sign\s?in/i.test(String(e.text || '')));
  if ((pass || fill) && btn) return 0.9;
  if (fill) return 0.5;
  return 0.1;
}

function detectCrudlist(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  if (/add to (cart|basket|bag)|checkout|clear completed|items left/.test(txt)) return 0.8;
  if (/todo|to-do|cart|basket/.test(txt) && els.length >= 3) return 0.6;
  return 0.1;
}

function detectIndex(vdom) {
  const els = elsOf(vdom);
  const links = els.filter((e) => /link/i.test(String(e.type || ''))).length;
  if (links >= 5 && !hasInput(els, /text_input|password|input/i)) return 0.6;
  return 0.2;
}

function detectGeneric() { return 0.3; }

// Login hints derive from page text: quoted/section usernames + password line.
// Falls back to the demo LOGIN_HINTS matrix only when parsing finds nothing.
function hintsLogin(vdom, ocrText) {
  const els = elsOf(vdom);
  const text = [String(ocrText || ''), ...els.map((e) => String(e.text || ''))].join('\n');
  const users = [];
  for (const m of text.matchAll(/([a-z0-9]+(?:_[a-z0-9]+)*_user)\b/gi)) {
    const u = m[1].toLowerCase();
    if (!users.includes(u)) users.push(u);
  }
  const pw = (text.match(/password for all users:\s*(\S+)/i) || [])[1] || null;
  if (!users.length) {
    return { users: LOGIN_HINTS.users.map((u) => u.username), password: LOGIN_HINTS.password, fallback: true };
  }
  return { users, password: pw, fallback: false };
}

function hintsCrudlist(vdom) {
  const els = elsOf(vdom);
  const items = els.filter((e) => /checkbox|radio|list/i.test(String(e.type || ''))).map((e) => String(e.text || ''));
  const counter = (els.map((e) => String(e.text || '')).find((t) => /items? left/i.test(t)) || '');
  return { items, counter };
}

function hintsGeneric(vdom) {
  const seen = new Set();
  const controls = [];
  for (const e of elsOf(vdom)) {
    const key = `${String(e.type || '')}|${String(e.text || '').slice(0, 40)}`;
    if (/button|link|checkbox|radio|input|text_input/i.test(String(e.type || '')) && !seen.has(key)) {
      seen.add(key);
      controls.push({ type: String(e.type || ''), text: String(e.text || '').slice(0, 40) });
    }
  }
  return { controls: controls.slice(0, 8) };
}

function fillTc(id, archetype, params, username, password, submitText) {
  return {
    id, archetype, params,
    steps: [
      { action: 'fill', target: { type: 'text_input', text: '' }, value: username },
      { action: 'fill', target: { type: 'password', text: '' }, value: password },
      { action: 'click', target: { type: 'button', text: submitText } },
    ],
    oracle: { ...ORACLES.loginSuccess },
    tags: ['login'],
  };
}

function expandLogin(hints, goal) {
  const tcs = [];
  const pw = (hints && hints.password) || LOGIN_HINTS.password;
  const users = (hints && Array.isArray(hints.users) ? hints.users : []).filter(Boolean);
  const lockedSet = new Set(LOGIN_HINTS.users.filter((u) => u.locked).map((u) => u.username));
  for (const username of users) {
    const rejected = lockedSet.has(username);
    const tc = fillTc(`login-${username}`, 'login', { username, password: pw }, username, pw, 'Login');
    if (rejected) {
      tc.oracle = { ...ORACLES.loginRejected };
      tc.expect_rejection = true;
      tc.tags = ['login', 'negative'];
    }
    tcs.push(tc);
  }
  const negs = [
    { id: 'login-negative-empty-user', params: { username: '', password: pw }, user: '', pass: pw },
    { id: 'login-negative-empty-pass', params: { username: users[0] || 'standard_user', password: '' }, user: users[0] || 'standard_user', pass: '' },
    { id: 'login-negative-wrong-pass', params: { username: users[0] || 'standard_user', password: 'wrong_password' }, user: users[0] || 'standard_user', pass: 'wrong_password' },
  ];
  for (const n of negs) {
    const tc = fillTc(n.id, 'login', n.params, n.user, n.pass, 'Login');
    tc.oracle = { ...ORACLES.loginRejected };
    tc.expect_rejection = true;
    tc.tags = ['login', 'negative'];
    tcs.push(tc);
  }
  return tcs;
}

function expandCrudlist(hints, goal) {
  const counter = (hints && hints.counter) || '';
  const counterOracle = { ...ORACLES.counterText, expect: counter || 'items left' };
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'crudlist', params: { goal: String(goal || '') }, steps, oracle, tags });
  return [
    mk('crud-add', [
      { action: 'fill', target: { type: 'text_input', text: '' }, value: 'Buy milk', submitKey: 'Enter' },
    ], counterOracle, ['crud', 'add']),
    mk('crud-toggle', [
      { action: 'click', target: { type: 'checkbox', text: '' } },
    ], { ...ORACLES.stateDiff }, ['crud', 'toggle']),
    mk('crud-filter', [
      { action: 'click', target: { type: 'link', text: 'Active' } },
    ], counterOracle, ['crud', 'filter']),
    mk('crud-clear', [
      { action: 'click', target: { type: 'button', text: 'Clear completed' } },
    ], counterOracle, ['crud', 'clear']),
  ];
}

function expandGeneric(hints, goal) {
  const ctrls = (hints && Array.isArray(hints.controls) ? hints.controls : []).slice(0, 8);
  if (!ctrls.length) {
    return [{ id: 'generic-observe', archetype: 'generic', params: {}, steps: [], oracle: { ...ORACLES.observed }, tags: ['generic'] }];
  }
  return ctrls.map((c, i) => ({
    id: `generic-${i + 1}`,
    archetype: 'generic',
    params: { type: c.type, text: c.text },
    steps: [{ action: 'click', target: { type: c.type, text: c.text } }],
    oracle: /button|link/i.test(c.type) ? { ...ORACLES.stateDiff } : { ...ORACLES.observed },
    tags: ['generic'],
  }));
}

// Expected-rejection semantics: a satisfied negative oracle is app-rejected,
// test-PASS — never a test FAIL. obs={urlChanged,pageText}.
function verdictFor(tc, obs) {
  const o = (obs && typeof obs === 'object') ? obs : {};
  const text = String(o.pageText || '');
  const oracle = (tc && tc.oracle) || {};
  if (tc && tc.expect_rejection) {
    const found = oracle.kind === 'text_present' && oracle.expect &&
      new RegExp(String(oracle.expect).slice(0, 120), 'i').test(text);
    if (found && !o.urlChanged) return { verdict: 'PASS', app_outcome: 'rejected' };
    return { verdict: 'FAIL', app_outcome: 'unexpected' };
  }
  if (oracle.kind === 'observed') return { verdict: 'OBSERVED', app_outcome: 'recorded' };
  if (oracle.kind === 'url_change' && o.urlChanged) return { verdict: 'PASS', app_outcome: 'accepted' };
  if (oracle.kind === 'text_present' && oracle.expect && new RegExp(String(oracle.expect).slice(0, 120), 'i').test(text)) {
    return { verdict: 'PASS', app_outcome: 'accepted' };
  }
  if (oracle.kind === 'state_diff' && o.stateChanged) return { verdict: 'PASS', app_outcome: 'accepted' };
  return { verdict: 'FAIL', app_outcome: 'unexpected' };
}

const CONTRACT_ARCHETYPES = {
  login: { name: 'login', detect: detectLogin, hints: hintsLogin, expand: expandLogin, oracles: ORACLES },
  crudlist: { name: 'crudlist', detect: detectCrudlist, hints: hintsCrudlist, expand: expandCrudlist, oracles: ORACLES },
  index: { name: 'index', detect: detectIndex, hints: hintsGeneric, expand: expandGeneric, oracles: ORACLES },
  generic: { name: 'generic', detect: detectGeneric, hints: hintsGeneric, expand: expandGeneric, oracles: ORACLES },
};

function detectAll(vdom, mem) {
  return Object.values(CONTRACT_ARCHETYPES)
    .map((a) => ({ name: a.name, score: Number(a.detect(vdom, mem).toFixed(3)) }))
    .sort((x, y) => y.score - x.score);
}

function expandAll(goal, vdom, ocrText, mem) {
  // Goal text selects login/crudlist when it names them (matrix intent);
  // otherwise the top page-detection score wins (generic fallback always runs).
  const g = normGoal(goal);
  const goalHit = ['login', 'crudlist'].find((id) => {
    try { return ARCHETYPES[id].match(g); } catch (_) { return false; }
  });
  const ranked = detectAll(vdom, mem);
  const name = goalHit || (ranked[0] || {}).name || 'generic';
  const arch = CONTRACT_ARCHETYPES[name] || CONTRACT_ARCHETYPES.generic;
  return arch.expand(arch.hints(vdom, ocrText), goal);
}

module.exports = {
  mkPhase,
  TEMPLATES,
  ORDER,
  genericPhases,
  normGoal,
  ARCHETYPES,
  classifyGoal,
  LOGIN_HINTS,
  ORACLES,
  CONTRACT,
  detectAll,
  expandAll,
  verdictFor,
};
