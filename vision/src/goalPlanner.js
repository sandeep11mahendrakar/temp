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

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

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

/**
 * Build a deterministic phase plan from a free-text goal.
 * Never returns an empty phase list (generic fallback).
 */
function planGoal(goal) {
  const raw = typeof goal === 'string' ? goal : String(goal == null ? '' : goal);
  const g = norm(raw);
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
