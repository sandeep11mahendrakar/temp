'use strict';

/**
 * lessonStore.js — E-1 experience-memory lesson store (local JSON).
 *
 * Schema (one entry per lesson):
 *   { pattern, action, outcome, lesson, confidence, count, run_ids[] }
 *
 * Write gate: lessons are recorded ONLY from reliable oracles (STRONG or MED)
 * and only from citable runs (run_id required). WEAK/unknown oracles and
 * uncitable runs are rejected — never auto-promote a shaky observation.
 *
 * Storage: local JSON file, atomic write (temp + rename). loadStore never
 * throws on missing/corrupt files.
 */

const fs = require('node:fs');
const path = require('node:path');

const RELIABLE_ORACLES = new Set(['STRONG', 'MED']);
const VERSION = 1;

function emptyStore() {
  return { version: VERSION, lessons: [] };
}

function isReliableOracle(oracle) {
  return RELIABLE_ORACLES.has(String(oracle == null ? '' : oracle).toUpperCase());
}

function lessonKey(l) {
  return `${String(l.pattern)}::${String(l.action)}`;
}

function validateLesson(l) {
  if (!l || typeof l !== 'object') throw new Error('lesson must be an object');
  if (typeof l.pattern !== 'string' || !l.pattern) throw new Error('lesson.pattern must be non-empty string');
  if (typeof l.action !== 'string' || !l.action) throw new Error('lesson.action must be non-empty string');
  if (typeof l.outcome !== 'string') throw new Error('lesson.outcome must be a string');
  if (typeof l.lesson !== 'string' || !l.lesson) throw new Error('lesson.lesson must be non-empty string');
  if (typeof l.confidence !== 'string' || !l.confidence) throw new Error('lesson.confidence must be non-empty string');
  if (!Array.isArray(l.run_ids)) throw new Error('lesson.run_ids must be an array');
}

function loadStore(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.lessons)) {
      return emptyStore();
    }
    const out = { version: VERSION, lessons: [] };
    for (const l of parsed.lessons) {
      if (!l || typeof l !== 'object') continue;
      try { validateLesson(l); } catch (_) { continue; }
      out.lessons.push({
        pattern: String(l.pattern),
        action: String(l.action),
        outcome: String(l.outcome),
        lesson: String(l.lesson),
        confidence: String(l.confidence),
        count: Number.isFinite(l.count) && l.count > 0 ? Math.floor(l.count) : 1,
        run_ids: l.run_ids.map(String),
      });
    }
    return out;
  } catch (_) {
    return emptyStore();
  }
}

function saveStoreAtomic(file, store) {
  const s = store && Array.isArray(store.lessons) ? store : emptyStore();
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, lessons: s.lessons }, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

function recordLesson(store, input) {
  const base = store && Array.isArray(store.lessons) ? store : emptyStore();
  const i = input || {};
  if (!isReliableOracle(i.oracle)) {
    throw new Error(`lesson rejected: oracle "${i.oracle}" not reliable (need STRONG or MED)`);
  }
  if (!i.run_id) {
    throw new Error('lesson rejected: missing citable run_id');
  }
  const entry = {
    pattern: String(i.pattern || ''),
    action: String(i.action || ''),
    outcome: String(i.outcome || ''),
    lesson: String(i.lesson || ''),
    confidence: String(i.confidence || i.oracle),
    count: 1,
    run_ids: [String(i.run_id)],
  };
  validateLesson(entry);

  const idx = base.lessons.findIndex((l) => lessonKey(l) === lessonKey(entry));
  if (idx >= 0) {
    const existing = base.lessons[idx];
    existing.count = (Number.isFinite(existing.count) ? existing.count : 0) + 1;
    if (!existing.run_ids.includes(entry.run_ids[0])) existing.run_ids.push(entry.run_ids[0]);
    existing.outcome = entry.outcome;
    existing.lesson = entry.lesson;
    existing.confidence = entry.confidence;
    return { added: false, lesson: existing };
  }
  base.lessons.push(entry);
  return { added: true, lesson: entry };
}

module.exports = {
  RELIABLE_ORACLES,
  VERSION,
  emptyStore,
  isReliableOracle,
  validateLesson,
  loadStore,
  saveStoreAtomic,
  recordLesson,
  lessonKey,
};
