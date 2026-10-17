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
  const loginBtn = els.some((e) => /log\s?in|sign\s?in/i.test(String(e.text || '')));
  const fill = hasInput(els, /text_input|search_field|password|input/i);
  const btn = els.some((e) => /button|submit/i.test(String(e.type || '')));
  if ((pass || loginBtn) && btn) return 0.9;
  if (fill && btn) return 0.3;
  if (fill) return 0.2;
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

// ---- J3 plugins: form + table (demoqa practice-form + webtables).
// Additive: core entries/helpers untouched; search/list PARKED (not built).
// form = multi-field fill -> option-pick -> submit -> verify modal;
// table = search/add/row-observe over a data grid.
function detectForm(vdom) {
  const els = elsOf(vdom);
  const inputs = els.filter((e) => /text_input|password|input/i.test(String(e.type || '')));
  const opts = els.filter((e) => /radio|checkbox/i.test(String(e.type || '')));
  const submit = els.some((e) => /button|submit/i.test(String(e.type || '')) || /submit/i.test(String(e.text || '')));
  if (inputs.length >= 3 && opts.length >= 1 && submit) return 0.95;
  if (inputs.length >= 2 && submit) return 0.6;
  return 0.1;
}

function hintsForm(vdom) {
  const els = elsOf(vdom);
  const fields = els.filter((e) => /text_input|password|input/i.test(String(e.type || '')))
    .map((e) => String(e.text || '').slice(0, 40));
  const options = els.filter((e) => /radio|checkbox/i.test(String(e.type || '')))
    .map((e) => ({ type: String(e.type || ''), text: String(e.text || '').slice(0, 40) })).slice(0, 8);
  const submit = (els.map((e) => String(e.text || '')).find((t) => /submit/i.test(t)) || 'Submit');
  return { fields, options, submit };
}

function expandForm(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const fields = (Array.isArray(h.fields) ? h.fields : []).slice(0, 4);
  const steps = fields.map((f) => ({
    action: 'fill', target: { type: 'text_input', text: f }, value: `Test ${f || 'value'}`,
  }));
  steps.push({ action: 'click', target: { type: 'button', text: String(h.submit || 'Submit') } });
  return [{
    id: 'form-fill-submit', archetype: 'form',
    params: { goal: String(goal || ''), fields },
    steps,
    oracle: { kind: 'text_present', expect: 'submitted|Thank', strength: 'MED' },
    tags: ['form', 'submit'],
  }];
}

function detectTable(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  const addSearch = /add/.test(txt) && hasInput(els, /text_input|search|input/i);
  const rows = els.filter((e) => /edit|delete/i.test(String(e.text || ''))).length;
  if (addSearch && rows >= 2) return 0.8;
  if (addSearch || rows >= 2) return 0.55;
  return 0.1;
}

function hintsTable(vdom) {
  const els = elsOf(vdom);
  const rows = els.filter((e) => /edit|delete/i.test(String(e.text || '')))
    .map((e) => String(e.text || '').slice(0, 40)).slice(0, 6);
  const search = els.some((e) => /search/i.test(String(e.text || '')));
  const add = (els.map((e) => String(e.text || '')).find((t) => /^add$/i.test(t.trim())) || 'Add');
  return { rows, search, add };
}

function expandTable(hints, goal) {
  const mk = (id, steps, oracle, tags) => ({
    id, archetype: 'table', params: { goal: String(goal || '') }, steps, oracle, tags,
  });
  return [
    mk('table-search', [
      { action: 'fill', target: { type: 'search_field', text: '' }, value: 'Alden' },
    ], { ...ORACLES.stateDiff }, ['table', 'search']),
    mk('table-add-open', [
      { action: 'click', target: { type: 'button', text: 'Add' } },
    ], { ...ORACLES.observed }, ['table', 'add']),
    mk('table-rows', [], { ...ORACLES.observed }, ['table', 'observe']),
  ];
}

// ---- A0 dev-set archetypes (search, list/filter/sort/paginate, cart/checkout,
// nav/menu, modal/tabs, wizard). Additive; registered in CONTRACT_ARCHETYPES.
function detectSearch(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  const hasSearchInput = els.some((e) => /search_field/i.test(String(e.type || '')) || (/text_input/i.test(String(e.type || '')) && /search/i.test(String(e.text || ''))));
  const hasSearchBtn = els.some((e) => /button/i.test(String(e.type || '')) && /search|find|go/i.test(String(e.text || '')));
  if (hasSearchInput && hasSearchBtn) return 0.9;
  if (hasSearchInput) return 0.6;
  if (/search/i.test(txt)) return 0.4;
  return 0.1;
}
function hintsSearch(vdom) {
  const els = elsOf(vdom);
  const input = els.find((e) => /search_field/i.test(String(e.type || '')) || (/text_input/i.test(String(e.type || '')) && /search/i.test(String(e.text || ''))));
  const btn = els.find((e) => /button/i.test(String(e.type || '')) && /search|find|go/i.test(String(e.text || '')));
  return { query: 'a', input: input ? String(input.text || '') : '', button: btn ? String(btn.text || '') : 'Search' };
}
function expandSearch(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const q = (h.query || 'a');
  const btn = h.button || 'Search';
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'search', params: { goal: String(goal || '') }, steps, oracle, tags });
  return [
    mk('search-enter', [{ action: 'fill', target: { type: 'search_field', text: h.input || '' }, value: q }], { ...ORACLES.stateDiff }, ['search', 'enter']),
    mk('search-submit', [{ action: 'click', target: { type: 'button', text: btn } }], { ...ORACLES.stateDiff }, ['search', 'submit']),
    mk('search-verify', [], { ...ORACLES.observed }, ['search', 'verify']),
  ];
}

function detectListpage(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  const hasSearch = els.some((e) => /search_field|text_input/i.test(String(e.type || '')));
  const hasSort = /sort/i.test(txt);
  const hasPaginate = /prev|next/i.test(txt);
  const hasFilter = /filter/i.test(txt);
  let score = 0.1;
  if (hasSearch) score = 0.5;
  if (hasSort || hasPaginate || hasFilter) score = Math.max(score, 0.7);
  if (hasSearch && (hasSort || hasPaginate)) score = 0.9;
  return score;
}
function hintsListpage(vdom) {
  const els = elsOf(vdom);
  const search = els.find((e) => /search_field|text_input/i.test(String(e.type || '')));
  const sortBtn = els.find((e) => /button/i.test(String(e.type || '')) && /sort/i.test(String(e.text || '')));
  const nextBtn = els.find((e) => /button/i.test(String(e.type || '')) && /next/i.test(String(e.text || '')));
  const prevBtn = els.find((e) => /button/i.test(String(e.type || '')) && /prev/i.test(String(e.text || '')));
  return { search: search ? String(search.text || '') : '', sort: sortBtn ? String(sortBtn.text || '') : 'Sort', next: nextBtn ? String(nextBtn.text || '') : 'Next', prev: prevBtn ? String(prevBtn.text || '') : 'Prev' };
}
function expandListpage(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'listpage', params: { goal: String(goal || '') }, steps, oracle, tags });
  return [
    mk('list-search', [{ action: 'fill', target: { type: 'search_field', text: h.search || '' }, value: 'a' }], { ...ORACLES.stateDiff }, ['list', 'search']),
    mk('list-sort', [{ action: 'click', target: { type: 'button', text: h.sort || 'Sort' } }], { ...ORACLES.stateDiff }, ['list', 'sort']),
    mk('list-next', [{ action: 'click', target: { type: 'button', text: h.next || 'Next' } }], { ...ORACLES.text_present, expect: 'page 2' }, ['list', 'paginate']),
  ];
}

function detectCart(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  if (/add .*cart|checkout|place order|review order/i.test(txt)) return 0.9;
  if (/cart|checkout/i.test(txt)) return 0.6;
  return 0.1;
}
function hintsCart(vdom) {
  const els = elsOf(vdom);
  const addBtn = els.find((e) => /button/i.test(String(e.type || '')) && /add/i.test(String(e.text || '')));
  const continueBtn = els.find((e) => /button/i.test(String(e.type || '')) && /continue/i.test(String(e.text || '')));
  const reviewBtn = els.find((e) => /button/i.test(String(e.type || '')) && /review/i.test(String(e.text || '')));
  const placeBtn = els.find((e) => /button/i.test(String(e.type || '')) && /place order/i.test(String(e.text || '')));
  const shipInput = els.find((e) => /text_input/i.test(String(e.type || '')));
  return { add: addBtn ? String(addBtn.text || '') : 'Add', continue: continueBtn ? String(continueBtn.text || '') : 'Continue', review: reviewBtn ? String(reviewBtn.text || '') : 'Review order', place: placeBtn ? String(placeBtn.text || '') : 'Place order', ship: shipInput ? String(shipInput.text || '') : 'Ship to' };
}
function expandCart(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'cart', params: { goal: String(goal || '') }, steps, oracle, tags });
  const out = [
    mk('cart-add', [{ action: 'click', target: { type: 'button', text: h.add || 'Add' } }], { ...ORACLES.stateDiff }, ['cart', 'add']),
    mk('cart-continue', [{ action: 'click', target: { type: 'button', text: h.continue || 'Continue' } }], { ...ORACLES.stateDiff }, ['cart', 'continue']),
    mk('cart-ship', [{ action: 'fill', target: { type: 'text_input', text: h.ship || 'Ship to' }, value: 'Ada' }], { ...ORACLES.stateDiff }, ['cart', 'ship']),
    mk('cart-review', [{ action: 'click', target: { type: 'button', text: h.review || 'Review order' } }], { ...ORACLES.stateDiff }, ['cart', 'review']),
    mk('cart-place', [{ action: 'click', target: { type: 'button', text: h.place || 'Place order' } }], { ...ORACLES.text_present, expect: 'Thank you' }, ['cart', 'place']),
  ];
  // Optional Remove-TC (amended fix): cart page truth tests Remove -> Total: $0.
  out.push(mk('cart-remove', [{ action: 'click', target: { type: 'button', text: 'Remove' } }], { ...ORACLES.text_present, expect: 'Total: $0' }, ['cart', 'remove']));
  return out;
}

function detectNavmenu(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  const hasMenuBtn = els.some((e) => /button/i.test(String(e.type || '')) && /menu|products|nav/i.test(String(e.text || '')));
  const hasSubLinks = els.filter((e) => /link/i.test(String(e.type || ''))).length >= 1;
  if (hasMenuBtn && hasSubLinks) return 0.9;
  if (hasSubLinks) return 0.6;
  if (/menu/i.test(txt)) return 0.4;
  return 0.1;
}
function hintsNavmenu(vdom) {
  const els = elsOf(vdom);
  const menuBtn = els.find((e) => /button/i.test(String(e.type || '')) && /menu|products|nav/i.test(String(e.text || '')));
  const subs = els.filter((e) => /link/i.test(String(e.type || ''))).map((e) => String(e.text || '')).slice(0, 6);
  return { menu: menuBtn ? String(menuBtn.text || '') : 'Products', subs };
}
function expandNavmenu(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'navmenu', params: { goal: String(goal || '') }, steps, oracle, tags });
  const subs = (Array.isArray(h.subs) && h.subs.length) ? h.subs : ['Widgets'];
  return [
    mk('nav-open', [{ action: 'click', target: { type: 'button', text: h.menu || 'Products' } }], { ...ORACLES.stateDiff }, ['nav', 'open']),
    ...subs.slice(0, 2).map((s, i) => mk(`nav-pick-${i + 1}`, [{ action: 'click', target: { type: 'link', text: s } }], { ...ORACLES.stateDiff }, ['nav', 'pick'])),
  ];
}

function detectModal(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  if (/show alert|show confirm|show prompt|modal|dialog|tab/i.test(txt)) return 0.9;
  if (/alert|confirm|prompt/i.test(txt)) return 0.6;
  return 0.1;
}
function hintsModal(vdom) {
  const els = elsOf(vdom);
  const btns = els.filter((e) => /button/i.test(String(e.type || '')) && /show|modal|tab/i.test(String(e.text || '')))
    .map((e) => String(e.text || '')).slice(0, 6);
  return { buttons: btns.length ? btns : ['Show alert', 'Show confirm', 'Show prompt'] };
}
function expandModal(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const btns = (Array.isArray(h.buttons) && h.buttons.length) ? h.buttons : ['Show alert'];
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'modal', params: { goal: String(goal || '') }, steps, oracle, tags });
  return btns.slice(0, 3).map((b, i) => mk(`modal-${i + 1}`, [{ action: 'click', target: { type: 'button', text: b } }], { ...ORACLES.observed }, ['modal', 'trigger']));
}

function detectWizard(vdom) {
  const els = elsOf(vdom);
  const txt = els.map((e) => String(e.text || '').toLowerCase()).join(' ');
  if (/continue|step|wizard|next step/i.test(txt) && /review|finish|done/i.test(txt)) return 0.9;
  if (/continue|wizard/i.test(txt)) return 0.6;
  return 0.1;
}
function hintsWizard(vdom) { return hintsCart(vdom); }
function expandWizard(hints, goal) {
  const h = hints && typeof hints === 'object' ? hints : {};
  const mk = (id, steps, oracle, tags) => ({ id, archetype: 'wizard', params: { goal: String(goal || '') }, steps, oracle, tags });
  return [
    mk('wizard-step1', [{ action: 'click', target: { type: 'button', text: h.continue || 'Continue' } }], { ...ORACLES.stateDiff }, ['wizard', 'step1']),
    mk('wizard-finish', [{ action: 'click', target: { type: 'button', text: h.place || 'Finish' } }], { ...ORACLES.text_present, expect: 'done|complete' }, ['wizard', 'finish']),
  ];
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
  form: { name: 'form', detect: detectForm, hints: hintsForm, expand: expandForm, oracles: ORACLES },
  table: { name: 'table', detect: detectTable, hints: hintsTable, expand: expandTable, oracles: ORACLES },
  search: { name: 'search', detect: detectSearch, hints: hintsSearch, expand: expandSearch, oracles: ORACLES },
  listpage: { name: 'listpage', detect: detectListpage, hints: hintsListpage, expand: expandListpage, oracles: ORACLES },
  cart: { name: 'cart', detect: detectCart, hints: hintsCart, expand: expandCart, oracles: ORACLES },
  navmenu: { name: 'navmenu', detect: detectNavmenu, hints: hintsNavmenu, expand: expandNavmenu, oracles: ORACLES },
  modal: { name: 'modal', detect: detectModal, hints: hintsModal, expand: expandModal, oracles: ORACLES },
  wizard: { name: 'wizard', detect: detectWizard, hints: hintsWizard, expand: expandWizard, oracles: ORACLES },
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
  const ranked = detectAll(vdom, mem);
  const top = (ranked[0] || {}).name || 'generic';
  const topScore = (ranked[0] || {}).score || 0;
  // New dev-set archetypes win on page evidence even when the goal names a
  // bundled intent (e.g. "search" is bundled under the login archetype).
  const NEW_ARCHS = new Set(['search', 'listpage', 'cart', 'navmenu', 'modal', 'wizard']);
  let name;
  if (NEW_ARCHS.has(top) && topScore >= 0.4) {
    name = top;
  } else {
    const goalHit = ['login', 'crudlist'].find((id) => {
      try { return ARCHETYPES[id].match(g); } catch (_) { return false; }
    });
    name = goalHit || top || 'generic';
  }
  const arch = CONTRACT_ARCHETYPES[name] || CONTRACT_ARCHETYPES.generic;
  const tcs = arch.expand(arch.hints(vdom, ocrText), goal);
  for (const tc of (Array.isArray(tcs) ? tcs : [])) {
    if (tc && typeof tc === 'object' && (tc.objective == null || tc.objective === '')) {
      tc.objective = String(tc.id || arch.name || 'archetype task');
    }
  }
  return tcs;
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
