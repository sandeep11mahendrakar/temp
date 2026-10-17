'use strict';

/**
 * overlayLadder.js — V-3 overlay/consent/modal interference ladder (detection + dismiss PLAN only).
 *
 * Scope (honest): this module NAMES an overlay and proposes a STANDARD dismiss
 * affordance ladder. It never evades, never hides CSS, never removes nodes, and
 * never clicks anything itself. A driver that consumes `dismissTargets()` must
 * click only the returned standard affordances in priority order and record
 * what happened; if none succeed it records BLOCKED-honest, not a pass.
 *
 *   detectOverlay({ title, bodyText, elements })
 *     -> { class, confidence, signals[], candidates[] }
 *
 * Classes (lowercase-contains signatures, campaign-grounded):
 *   none | cookie_banner | consent_modal | modal_overlay | blocking_overlay
 *
 * Priority on multi-match: blocking_overlay > consent_modal > modal_overlay >
 * cookie_banner > none. Confidence deterministic:
 *   overlay classes min(0.55 + 0.10 * (signals-1), 0.95); none is 0.6.
 *
 * Standard dismiss affordances (the ONLY things the ladder may propose):
 *   close (X), reject, accept, got_it, dismiss, ok, agree. Any label not in
 *   this set is never proposed (no evasion by inventing a click target).
 */

const STANDARD_LABELS = [
  { key: 'close',   re: /\b(close|x|dismiss|no thanks)\b/i, priority: 1 },
  { key: 'reject',  re: /\b(reject|decline|deny|no,?\s*thanks|reject all)\b/i, priority: 2 },
  { key: 'accept',  re: /\b(accept|accept all|i agree|agree|allow all|allow)\b/i, priority: 3 },
  { key: 'got_it',  re: /\b(got it|ok|okay|understood|continue)\b/i, priority: 4 },
  { key: 'dismiss', re: /\b(dismiss)\b/i, priority: 5 },
];

const SIGNATURES = {
  cookie_banner: ['cookie', 'cookies', 'we use cookies', 'cookie preferences', 'cookie settings'],
  consent_modal: ['consent', 'privacy', 'gdpr', 'tracking', 'personalised', 'personalized', 'data processing'],
  modal_overlay: ['modal', 'dialog', 'overlay', 'popup', 'lightbox'],
  blocking_overlay: ['blocking', 'interstitial', 'age gate', 'age verification', 'please verify', 'newsletter signup'],
};

const PRIORITY = ['blocking_overlay', 'consent_modal', 'modal_overlay', 'cookie_banner'];

function lower(v) { return typeof v === 'string' ? v.toLowerCase() : ''; }

function overlayConfidence(n) {
  return Math.round(Math.min(0.55 + 0.10 * Math.max(n - 1, 0), 0.95) * 100) / 100;
}

function collectText(input) {
  const parts = [lower(input && input.title), lower(input && input.bodyText)];
  const els = Array.isArray(input && input.elements) ? input.elements : [];
  for (const e of els) {
    if (e && typeof e.text === 'string') parts.push(lower(e.text));
    if (e && typeof e.label === 'string') parts.push(lower(e.label));
  }
  return parts.join('\n');
}

function detectOverlay(input) {
  const src = collectText(input);
  const hits = {};
  for (const cls of PRIORITY) {
    hits[cls] = SIGNATURES[cls].filter((sig) => src.includes(sig));
  }
  for (const cls of PRIORITY) {
    if (hits[cls].length) {
      return { class: cls, confidence: overlayConfidence(hits[cls].length),
        signals: hits[cls], candidates: dismissCandidates(input) };
    }
  }
  return { class: 'none', confidence: 0.6, signals: [], candidates: [] };
}

function dismissCandidates(input) {
  const els = Array.isArray(input && input.elements) ? input.elements : [];
  const out = [];
  const seen = new Set();
  for (const e of els) {
    const text = (e && (typeof e.text === 'string' ? e.text : (typeof e.label === 'string' ? e.label : ''))) || '';
    const t = text.trim();
    if (!t) continue;
    for (const lab of STANDARD_LABELS) {
      if (lab.re.test(t) && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        out.push({ label: t.slice(0, 80), kind: lab.key, priority: lab.priority });
        break;
      }
    }
  }
  out.sort((a, b) => a.priority - b.priority);
  return out;
}

const HOOK_INTO = [
  'vision/src/explorer.js :: post-perceive detectOverlay; non-none records overlay class + runs dismiss ladder; never auto-retries',
  'vision/runAuto.js :: pre-plan detectOverlay; overlay present => try dismiss ladder once, re-perceive, then proceed; evasion forbidden',
  'vision/src/executeTests.js :: dialog collector already auto-dismisses native dialogs; overlay ladder covers DOM overlays only',
];

module.exports = { detectOverlay, dismissCandidates, STANDARD_LABELS, SIGNATURES, PRIORITY, HOOK_INTO, overlayConfidence };
