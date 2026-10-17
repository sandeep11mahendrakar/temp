'use strict';

/**
 * demoReplay.js — R-6 offline demo mode: replay recorded runs, no network/no key.
 *
 * Pure: reads a JSON report from disk (or accepts an object) and produces a
 * compact summary. Never performs network calls or requires API keys.
 */

const fs = require('node:fs');

function loadRun(input) {
  if (typeof input === 'string') {
    const raw = fs.readFileSync(input, 'utf8');
    return JSON.parse(raw);
  }
  if (input && typeof input === 'object' && !Buffer.isBuffer(input)) {
    return input;
  }
  throw new Error('demoReplay.loadRun: expected object or file path');
}

function summarize(run) {
  const r = (run && typeof run === 'object') ? run : {};
  return {
    run_id: r.run_id || r.id || null,
    site: r.site || r.url || null,
    label: r.label || null,
    tc_source: r.tc_source || null,
    brain_role: (r.brain && r.brain.role) || r.brain_role || null,
    citable: r.citable === true,
    cost: r.cost || null,
    verdict_mix: r.verdict_mix || null,
    weak_rate: typeof r.weak_rate === 'number' ? r.weak_rate : null,
    screens: typeof r.screens === 'number' ? r.screens : null,
    calls: typeof r.llm_calls === 'number' ? r.llm_calls : (typeof r.calls === 'number' ? r.calls : null),
    tokens: typeof r.tokens === 'number' ? r.tokens : null,
  };
}

function replay(input) {
  const run = loadRun(input);
  return { ok: true, offline: true, summary: summarize(run) };
}

module.exports = { loadRun, summarize, replay };
