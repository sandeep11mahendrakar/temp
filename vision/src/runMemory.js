'use strict';

/**
 * runMemory.js — B4 per-site run memory (pure logic + atomic file writes).
 *
 * @deprecated v1 mechanism — superseded by vision/src/memory.js (B4-full).
 * This file is frozen: no behavior changes. New work targets memory.js.
 *
 * Lessons today live only in RAM (explorer lessonBuffer) and raw
 * llm_calls.jsonl telemetry. This module persists a compact per-site memory:
 *   memory.json = { version: 1, runs: [record, ...] }
 *   record = { site, run_id, ts, summary, phases_done, verdict, delta }
 * - summary is capped at 40 chars (SUMMARY_MAX).
 * - delta = phase ids completed this run that the site's previous run had
 *   not completed (null when the site has no previous run).
 * - mergeRun() is pure (no I/O); saveMemoryAtomic() writes temp + rename so
 *   a crash never leaves a half-written memory.json. loadMemory() never
 *   throws: missing/corrupt files yield an empty memory.
 * Default home (runtime, untracked): vision/storage/memory.json — always
 * pass the path explicitly; this module never assumes cwd.
 */

const fs = require('node:fs');
const path = require('node:path');

const SUMMARY_MAX = 40;
const RUN_CAP = 500;

function emptyMemory() {
  return { version: 1, runs: [] };
}

function loadMemory(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.runs)) {
      return emptyMemory();
    }
    return { version: 1, runs: parsed.runs.filter((r) => r && typeof r === 'object') };
  } catch (_) {
    return emptyMemory();
  }
}

function buildSummary({ verdict, phasesDone, totalPhases, urlAfter }) {
  const done = Array.isArray(phasesDone) ? phasesDone.length : 0;
  const total = Number.isFinite(totalPhases) ? totalPhases : done;
  let host = '';
  try {
    const u = String(urlAfter || '');
    const m = u.match(/^https?:\/\/([^/]+)(\/.*)?$/);
    host = m ? (m[1] + (m[2] && m[2] !== '/' ? m[2].slice(0, 18) : '')) : u.slice(0, 22);
  } catch (_) {
    host = '';
  }
  const text = `${String(verdict || 'UNKNOWN')} ${done}/${total}${host ? ` ${host}` : ''}`;
  return text.length > SUMMARY_MAX ? text.slice(0, SUMMARY_MAX) : text;
}

function lastRunForSite(mem, site) {
  const runs = (mem && Array.isArray(mem.runs) ? mem.runs : []).filter((r) => r && r.site === site);
  return runs.length ? runs[runs.length - 1] : null;
}

function mergeRun(mem, record) {
  const base = mem && Array.isArray(mem.runs)
    ? { version: 1, runs: mem.runs.slice() }
    : emptyMemory();
  const prev = lastRunForSite(base, record && record.site);
  const done = Array.isArray(record && record.phases_done) ? record.phases_done : [];
  const prevDone = prev && Array.isArray(prev.phases_done) ? prev.phases_done : null;
  const delta = prevDone === null ? null : done.filter((p) => !prevDone.includes(p));
  base.runs.push({
    site: record.site,
    run_id: record.run_id || null,
    ts: record.ts || new Date().toISOString(),
    summary: record.summary,
    phases_done: done.slice(),
    verdict: record.verdict || null,
    delta,
  });
  while (base.runs.length > RUN_CAP) base.runs.shift();
  return base;
}

function saveMemoryAtomic(file, mem) {
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(mem, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

module.exports = {
  SUMMARY_MAX,
  RUN_CAP,
  emptyMemory,
  loadMemory,
  buildSummary,
  lastRunForSite,
  mergeRun,
  saveMemoryAtomic,
};
