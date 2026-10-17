'use strict';

/**
 * lessonRetrieval.js — E-2 experience-memory retrieval (top-3 into planner prompt).
 *
 * Flag-gated: EXPERIENCE_MEMORY=on (default OFF). When off, the prompt is
 * byte-identical to the no-memory path (proven by tests).
 *
 * Pure: no I/O, no LLM. Callers pass a lessonStore-shaped object.
 */

function isMemoryEnabled(env) {
  const e = (env && typeof env === 'object') ? env : process.env;
  return String((e && e.EXPERIENCE_MEMORY) || '').toLowerCase() === 'on';
}

function retrieveTopLessons(store, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const k = Number.isFinite(o.k) ? Math.max(0, Math.floor(o.k)) : 3;
  const lessons = (store && Array.isArray(store.lessons)) ? store.lessons.slice() : [];
  // rank by count desc, then run_ids length desc, then pattern asc
  lessons.sort((a, b) => {
    const ca = Number.isFinite(a && a.count) ? a.count : 0;
    const cb = Number.isFinite(b && b.count) ? b.count : 0;
    if (cb !== ca) return cb - ca;
    const ra = Array.isArray(a && a.run_ids) ? a.run_ids.length : 0;
    const rb = Array.isArray(b && b.run_ids) ? b.run_ids.length : 0;
    if (rb !== ra) return rb - ra;
    return String((a && a.pattern) || '').localeCompare(String((b && b.pattern) || ''));
  });
  return lessons.slice(0, k);
}

function formatLessons(lessons) {
  if (!Array.isArray(lessons) || !lessons.length) return '';
  return lessons.map((l, i) => `${i + 1}. [${l.pattern}] ${l.lesson}`).join('\n');
}

function augmentPrompt(prompt, store, opts) {
  const base = String(prompt == null ? '' : prompt);
  const o = (opts && typeof opts === 'object') ? opts : {};
  const env = o.env || process.env;
  if (!isMemoryEnabled(env)) return base; // flag OFF => byte-identical
  const top = retrieveTopLessons(store, { k: 3 });
  if (!top.length) return base;
  const block = `\nLESSONS (top-${top.length}):\n${formatLessons(top)}\n`;
  return base + block;
}

module.exports = {
  isMemoryEnabled,
  retrieveTopLessons,
  formatLessons,
  augmentPrompt,
};
