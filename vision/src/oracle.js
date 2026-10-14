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
 *   - urlChanged or expected text present => PASS / accepted.
 *   - no OCR at all (ocrWords null/0) with no change and no text
 *     => OBSERVED / n/a (WEAK: seen but unjudgeable — never PASS, never FAIL).
 *   - otherwise => FAIL / (rejected when rejection text present, else n/a).
 * obs shape (all optional, function is total):
 *   { urlChanged, pageText (<=2000 chars), counter, ocrWords,
 *     expectRejection, expectedText }
 * snip300 = first 300 chars of the evidence haystack; ocr_count = ocrWords.
 * This module never touches result.verdict (P3 executor verdict stays the
 * load-bearing PASS/PASS_WEAK/FAIL flag); callers store this under `oracle`.
 */

const REJECTION_RE = /locked out|do not match|is required|error|invalid|denied|failed/i;

function haystackOf(obs) {
  const parts = [];
  if (obs && typeof obs.pageText === 'string' && obs.pageText) parts.push(obs.pageText);
  if (obs && typeof obs.counter === 'string' && obs.counter) parts.push(obs.counter);
  return parts.join('\n');
}

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
    ? o.expectedText.trim().toLowerCase()
    : (tc && typeof tc.expected_text === 'string' && tc.expected_text.trim()
      ? tc.expected_text.trim().toLowerCase()
      : '');
  const textMet = Boolean(wantText && hay.toLowerCase().includes(wantText));

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
  // absence.
  const kind = tc && tc.oracle && tc.oracle.kind;
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
  haystackOf,
  verdictFor,
};
