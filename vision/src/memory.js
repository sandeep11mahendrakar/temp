'use strict';

/**
 * memory.js — B4-full v2 site memory (full implementation, NEW file).
 *
 * Complements the frozen B4 v1 mechanism (runMemory.js — DO NOT TOUCH):
 * v1 persists per-run records; v2 keeps a per-SITE rolling profile:
 *   memory.json v2 = { version: 2, sites: { [site]: siteEntry } }
 *   siteEntry = { fingerprint, hints[], coverage{done[], total},
 *                 findings[], attempts, deltas[], updated_ts }
 * - fingerprint: stable host-normalized site key.
 * - hints: unique short guidance strings (HINTS_CAP).
 * - coverage: union of completed phase ids + last-seen total.
 * - findings: short timestamped notes (FINDINGS_CAP).
 * - attempts: mergeLoop call count for the site.
 * - deltas: per-merge newly-covered phase ids (DELTAS_CAP, latest kept).
 * - mergeLoop() is pure (no I/O); summary capped at 40 chars (SUMMARY_MAX,
 *   same shape as v1: "VERDICT done/total host").
 * - saveStoreAtomic() writes temp + rename; loadStore() never throws
 *   (missing/corrupt files yield an empty store). No v1 migration:
 *   v1 and v2 files live side by side by explicit path.
 */

const fs = require('node:fs');
const path = require('node:path');

const SUMMARY_MAX = 40;
const HINTS_CAP = 20;
const FINDINGS_CAP = 50;
const DELTAS_CAP = 20;

function emptyStore() {
  return { version: 2, sites: {} };
}

function loadStore(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 2 ||
        !parsed.sites || typeof parsed.sites !== 'object' || Array.isArray(parsed.sites)) {
      return emptyStore();
    }
    return { version: 2, sites: parsed.sites };
  } catch (_) {
    return emptyStore();
  }
}

// Stable site key: lowercase host + first path segment (trailing slash and
// case variants collapse; distinct hosts stay distinct).
function fingerprintFor(site) {
  const u = String(site || '').trim().toLowerCase().replace(/\/+$/, '');
  const m = u.match(/^(?:https?:\/\/)?([^/]+)(\/.*)?$/);
  if (!m) return u.slice(0, 80) || 'unknown';
  const host = m[1];
  const seg = (m[2] || '').split('/').filter(Boolean).slice(0, 1).join('/');
  return (seg ? `${host}/${seg}` : host).slice(0, 80) || 'unknown';
}

function hostOf(urlAfter) {
  try {
    const u = String(urlAfter || '');
    const m = u.match(/^https?:\/\/([^/]+)(\/.*)?$/);
    if (!m) return u.slice(0, 22);
    return (m[1] + (m[2] && m[2] !== '/' ? m[2].slice(0, 18) : '')).toLowerCase();
  } catch (_) {
    return '';
  }
}

function buildSummary40({ verdict, doneCount, totalPhases, urlAfter }) {
  const done = Number.isFinite(doneCount) ? doneCount : 0;
  const total = Number.isFinite(totalPhases) ? totalPhases : done;
  const host = hostOf(urlAfter);
  const text = `${String(verdict || 'UNKNOWN')} ${done}/${total}${host ? ` ${host}` : ''}`;
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX) : text;
}

// Pure merge: fold one loop result into the site profile.
// input: { site, phases_done[], totalPhases, verdict, urlAfter,
//          hint?, finding? } -> { store, delta, summary }
// delta = newly covered phase ids (null on first sight, mirrors v1).
function mergeLoop(store, input) {
  const inRec = (input && typeof input === 'object') ? input : {};
  const site = String(inRec.site || 'unknown');
  const base = (store && store.version === 2 && store.sites && typeof store.sites === 'object')
    ? { version: 2, sites: { ...store.sites } }
    : emptyStore();
  const prev = base.sites[site] && typeof base.sites[site] === 'object' ? base.sites[site] : null;
  const done = Array.isArray(inRec.phases_done) ? [...new Set(inRec.phases_done.filter((p) => typeof p === 'string'))] : [];
  const prevDone = prev && prev.coverage && Array.isArray(prev.coverage.done) ? prev.coverage.done : null;
  const delta = prevDone === null ? null : done.filter((p) => !prevDone.includes(p));
  const coverage = {
    done: [...new Set([...(prevDone || []), ...done])],
    total: Number.isFinite(inRec.totalPhases) ? inRec.totalPhases : (prev && prev.coverage ? prev.coverage.total : done.length),
  };
  const hints = prev && Array.isArray(prev.hints) ? prev.hints.slice() : [];
  if (typeof inRec.hint === 'string' && inRec.hint && !hints.includes(inRec.hint)) {
    hints.push(inRec.hint);
    while (hints.length > HINTS_CAP) hints.shift();
  }
  const findings = prev && Array.isArray(prev.findings) ? prev.findings.slice() : [];
  if (typeof inRec.finding === 'string' && inRec.finding) {
    findings.push({ ts: new Date().toISOString(), text: inRec.finding.slice(0, 200) });
    while (findings.length > FINDINGS_CAP) findings.shift();
  }
  const deltas = prev && Array.isArray(prev.deltas) ? prev.deltas.slice() : [];
  deltas.push(delta === null ? [] : delta.slice());
  while (deltas.length > DELTAS_CAP) deltas.shift();
  const summary = buildSummary40({
    verdict: inRec.verdict, doneCount: coverage.done.length,
    totalPhases: coverage.total, urlAfter: inRec.urlAfter,
  });
  base.sites[site] = {
    fingerprint: fingerprintFor(site),
    hints,
    coverage,
    findings,
    attempts: (prev && Number.isFinite(prev.attempts) ? prev.attempts : 0) + 1,
    deltas,
    updated_ts: new Date().toISOString(),
  };
  return { store: base, delta, summary };
}

function saveStoreAtomic(file, store) {
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

module.exports = {
  SUMMARY_MAX,
  HINTS_CAP,
  FINDINGS_CAP,
  DELTAS_CAP,
  emptyStore,
  loadStore,
  fingerprintFor,
  buildSummary40,
  mergeLoop,
  saveStoreAtomic,
};
