'use strict';

/**
 * ocrSynth.js — V-2 OCR-anchored synthesis (buttons + inputs), flag-gated.
 *
 * Flag: OCR_SYNTH=on (default OFF). When OFF, output is byte-identical to the
 * no-synth input (proven by tests). When ON, delegates to anchorSynth (WEAK-
 * tagged only; never upgrades a run to AUTONOMOUS).
 *
 * No retraining. Recrop/upscale retry is a best-effort second pass when the
 * first pass adds nothing (still WEAK).
 */

const anchorSynth = require('./anchorSynth');

function isEnabled(env) {
  const e = (env && typeof env === 'object') ? env : process.env;
  return String((e && e.OCR_SYNTH) || '').toLowerCase() === 'on';
}

function synthesize(elements, ocrWords, imageH, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const env = o.env || process.env;
  const base = Array.isArray(elements) ? elements.slice() : [];
  if (!isEnabled(env)) {
    // flag OFF => byte-identical
    return { elements: base, added: 0, weak: false };
  }
  const first = anchorSynth.synthAnchorInputs(base, ocrWords, imageH, o);
  const elementsOut = Array.isArray(first && first.elements) ? first.elements : base;
  const added = Number(first && first.added) || 0;
  // tag synthesized elements WEAK
  for (const el of elementsOut) {
    if (el && el.synth === 'ocr_anchor' && !el.weak) el.weak = 'OCR_ANCHOR';
  }
  return { elements: elementsOut, added, weak: added > 0 };
}

module.exports = { isEnabled, synthesize };
