'use strict';

/**
 * oracle.js — G2 value-oracle verdicts (pure, zero dependencies).
 *
 * verdictFor(tc, obs) judges one test case against observables and stores
 *   { verdict, app_outcome, snip300, ocr_count }.
 * Contract (D21 frozen — do not rename values):
 *   verdict     PASS | FAIL | OBSERVED | BLOCKED
 *   app_outcome accepted | rejected | n/a
 * Rules:
 *   - expect_rejection + oracle-met (rejection text, or no navigation when
 *     navigation was expected) => PASS / rejected. A locked-out login that
 *     stays put with "locked out" text is a PASSING negative, never FAIL.
 *   - text_absent kind (L2, frozen): absence assertions (never vacuous-PASS).
 *   - O1 evaluator-kinds (text_present/dialog_message/new_page_url/count_delta)
 *     decide on their own dedicated evidence; unsupported or absent evidence is
 *     NOT satisfied (never PASS).
 *   - urlChanged or expected text present => PASS / accepted.
 *   - no OCR at all (ocrWords null/0) with no change and no text
 *     => OBSERVED / n/a (WEAK: seen but unjudgeable — never PASS, never FAIL).
 *   - otherwise => FAIL / (rejected when rejection text present, else n/a).
 * obs shape (all optional, function is total):
 *   { urlChanged, pageText (<=2000 chars), counter, ocrWords,
 *     expectRejection, expectedText, dialogs[], popups[],
 *     countBefore, countAfter }
 * snip300 = first 300 chars of the evidence haystack; ocr_count = ocrWords.
 * This module never touches result.verdict (P3 executor verdict stays the
 * load-bearing PASS/PASS_WEAK/FAIL flag); callers store this under `oracle`.
 * Kinds + app_outcome follow docs/ORACLE_CONTRACT.md (K2 + L2).
 */

const REJECTION_RE = /locked out|do not match|is required|error|invalid|denied|failed/i;

// O1: bounded regex-vs-text test. Literal substring first so every pre-O1
// expectation keeps its exact match; when the expect carries regex syntax,
// one bounded (120-char) RegExp attempt follows the existing oracle.js
// precedent. Invalid patterns fall back to literal-only. Never throws.
function regexBounded(expect, text) {
  const e = typeof expect === 'string' ? expect.trim() : '';
  if (!e) return false;
  const t = String(text == null ? '' : text);
  if (t.toLowerCase().includes(e.toLowerCase())) return true;
  if (/[.*+?^${}()|[\]\\]/.test(e)) {
    try { return new RegExp(e.slice(0, 120), 'i').test(t); } catch (_) { return false; }
  }
  return false;
}

function haystackOf(obs) {
  const parts = [];
  if (obs && typeof obs.pageText === 'string' && obs.pageText) parts.push(obs.pageText);
  if (obs && typeof obs.counter === 'string' && obs.counter) parts.push(obs.counter);
  // O1: F-C dialog + popup evidence joins the haystack (appended last so
  // pre-O1 snip300 and rejection behaviour are unchanged).
  if (obs && Array.isArray(obs.dialogs)) {
    for (const d of obs.dialogs) {
      if (!d) continue;
      if (typeof d.type === 'string' && d.type) parts.push(d.type);
      if (typeof d.message === 'string' && d.message) parts.push(d.message);
    }
  }
  if (obs && Array.isArray(obs.popups)) {
    for (const u of obs.popups) if (typeof u === 'string' && u.trim()) parts.push(u.trim());
  }
  return parts.join('\n');
}

function numericOrNull(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

// count_delta expect grammar: a number, or the first signed integer inside a
// string ("2", "+2", "+1 row after add" => 1). No integer => null (unsat).
function countWant(expect) {
  if (typeof expect === 'number' && Number.isFinite(expect)) return expect;
  const m = /([+-]?\d+)/.exec(typeof expect === 'string' ? expect : '');
  return m ? Number(m[1]) : null;
}

// O1 evaluator-kinds (pure): explicit assertion kinds that judge dedicated
// evidence rather than page text. Returns {supported, satisfied, detail}.
// Contract: an unsupported kind is NEVER satisfied, and a supported kind with
// absent/wrong evidence is NOT satisfied — evaluateKind can only report
// satisfied on real, matching evidence (absent evidence => unsatisfied).
function evaluateKind(tc, obs) {
  const o = (obs && typeof obs === 'object') ? obs : {};
  const oracle = tc && tc.oracle && typeof tc.oracle === 'object' ? tc.oracle : null;
  const kind = oracle && typeof oracle.kind === 'string' ? oracle.kind.toLowerCase() : '';
  const expect = oracle ? oracle.expect : undefined;
  if (kind === 'text_present') {
    return { supported: true, satisfied: regexBounded(expect, haystackOf(o)), detail: 'text_present' };
  }
  if (kind === 'dialog_message') {
    const dialogs = Array.isArray(o.dialogs) ? o.dialogs.filter(Boolean) : [];
    const hay = dialogs
      .map((d) => [d.type, d.message].filter((x) => typeof x === 'string' && x).join(': '))
      .join('\n');
    return {
      supported: true,
      satisfied: dialogs.length > 0 && regexBounded(expect, hay),
      detail: `dialogs:${dialogs.length}`,
    };
  }
  if (kind === 'new_page_url') {
    const popups = Array.isArray(o.popups)
      ? o.popups.filter((u) => typeof u === 'string' && u.trim())
      : [];
    return {
      supported: true,
      satisfied: popups.length > 0 && popups.some((u) => regexBounded(expect, u)),
      detail: `popups:${popups.length}`,
    };
  }
  if (kind === 'count_delta') {
    const before = numericOrNull(o.countBefore);
    const after = numericOrNull(o.countAfter);
    const want = countWant(expect);
    return {
      supported: true,
      satisfied: before !== null && after !== null && want !== null && (after - before) === want,
      detail: `count_delta:${want}`,
    };
  }
  return { supported: false, satisfied: false, detail: `unsupported:${kind || 'none'}` };
}

// Kinds recognized by docs/ORACLE_CONTRACT.md (K2 + L2). A `tc.oracle.kind`
// outside this set is unsupported => never-PASS (O1).
const KNOWN_KINDS = new Set([
  'text_present', 'text_absent', 'dialog_message', 'new_page_url',
  'count_delta', 'state_diff', 'url_change', 'observed', 'value', 'bbox_delta',
]);
// Kinds owned by the O1 evaluator (text_absent keeps its own frozen branch).
const KIND_EVAL = new Set(['text_present', 'dialog_message', 'new_page_url', 'count_delta']);

function rejectionMet(haystack, obs) {
  if (REJECTION_RE.test(haystack)) return true;
  // Navigation was expected (submit/login) but nothing moved and no page
  // text at all: the app rejected silently (stayed put).
  if (obs && obs.expectedNav === true && obs.urlChanged !== true && !haystack.trim()) return true;
  return false;
}

function verdictFor(tc, obs) {
  const o = (obs && typeof obs === 'object' ? obs : {});
  const hay = haystackOf(o);
  const snip300 = hay.slice(0, 300);
  const ocrCount = Number.isFinite(o.ocrWords) ? o.ocrWords : (o.ocrWords === 0 ? 0 : null);
  const ocrCountOut = ocrCount === null ? 0 : ocrCount;
  const changed = o.urlChanged === true;
  const rejected = rejectionMet(hay, o);
  const wantReject = Boolean((tc && tc.expect_rejection) || o.expectRejection);
  const wantText = typeof o.expectedText === 'string' && o.expectedText.trim()
    ? o.expectedText.trim()
    : (tc && typeof tc.expected_text === 'string' && tc.expected_text.trim()
      ? tc.expected_text.trim()
      : '');
  // O1: bounded regex on top of the literal includes() (back-compat + mapping).
  const textMet = Boolean(wantText && regexBounded(wantText, hay));

  // D21 frozen priority: expect_rejection + oracle-met wins first.
  if (wantReject && rejected) {
    return { verdict: 'PASS', app_outcome: 'rejected', snip300, ocr_count: ocrCountOut };
  }
  // L2 text_absent: the assertion is ABSENCE (uncheck/modal-close/collapse).
  // Present => FAIL. Absent + navigation (transition confirmed) => PASS
  // STRONG; absent on a non-empty page => PASS MED (bare absence is weaker
  // evidence); empty haystack without navigation => OBSERVED (vacuous, never
  // PASS). Placed before the generic rules: generic `changed` would wrongly
  // PASS a present-text case, and generic FAIL would wrongly fail bare
  // absence. (D21 frozen semantics — unchanged by O1.)
  const kind = tc && tc.oracle && typeof tc.oracle.kind === 'string' ? tc.oracle.kind : '';
  const kindExpect = tc && tc.oracle && typeof tc.oracle.expect === 'string' ? tc.oracle.expect : '';
  if (kind === 'text_absent' && kindExpect) {
    let present = false;
    try {
      present = new RegExp(kindExpect.slice(0, 120), 'i').test(hay);
    } catch (_) {
      present = hay.toLowerCase().includes(kindExpect.slice(0, 120).toLowerCase());
    }
    if (!present) {
      if (changed || hay.trim()) return { verdict: 'PASS', app_outcome: 'accepted', snip300, ocr_count: ocrCountOut };
      return { verdict: 'OBSERVED', app_outcome: 'n/a', snip300, ocr_count: ocrCountOut };
    }
    return { verdict: 'FAIL', app_outcome: rejected ? 'rejected' : 'n/a', snip300, ocr_count: ocrCountOut };
  }
  // O1 evaluator-kinds: explicit assertion kinds decide on their own evidence.
  // Satisfied => PASS; absent/wrong evidence => FAIL (unsatisfied, never PASS).
  if (kind && KIND_EVAL.has(kind.toLowerCase())) {
    const ev = evaluateKind(tc, o);
    if (ev.satisfied) {
      return { verdict: 'PASS', app_outcome: 'accepted', snip300, ocr_count: ocrCountOut };
    }
    return { verdict: 'FAIL', app_outcome: rejected ? 'rejected' : 'n/a', snip300, ocr_count: ocrCountOut };
  }
  // O1: a kind outside the frozen contract is unsupported => unsatisfied,
  // never-PASS (honest FAIL/OBSERVED, never a false PASS).
  if (kind && !KNOWN_KINDS.has(kind.toLowerCase())) {
    return {
      verdict: hay.trim() ? 'FAIL' : 'OBSERVED',
      app_outcome: rejected ? 'rejected' : 'n/a',
      snip300,
      ocr_count: ocrCountOut,
    };
  }
  if (changed || textMet) {
    return { verdict: 'PASS', app_outcome: 'accepted', snip300, ocr_count: ocrCountOut };
  }
  if ((o.ocrWords === null || o.ocrWords === undefined || o.ocrWords === 0) && !changed && !hay.trim()) {
    return { verdict: 'OBSERVED', app_outcome: 'n/a', snip300, ocr_count: ocrCountOut };
  }
  return { verdict: 'FAIL', app_outcome: rejected ? 'rejected' : 'n/a', snip300, ocr_count: ocrCountOut };
}

module.exports = {
  REJECTION_RE,
  KNOWN_KINDS,
  KIND_EVAL,
  regexBounded,
  haystackOf,
  evaluateKind,
  verdictFor,
};
