'use strict';

/**
 * modelAblation.js — R-4 ablation table formatter (pure, no LLM/network).
 * Produces a normalized ablation table from a list of result rows.
 */

function buildTable(rows) {
  const r = Array.isArray(rows) ? rows : [];
  return r.map((x) => ({
    model: String((x && x.model) || ''),
    brain_mode: String((x && x.brain_mode) || ''),
    api_calls: (x && typeof x.api_calls === 'number') ? x.api_calls : null,
    vision: (x && typeof x.vision === 'number') ? x.vision : null,
    mcp: (x && typeof x.mcp === 'number') ? x.mcp : null,
    status: String((x && x.status) || 'not run'),
    notes: String((x && x.notes) || ''),
  }));
}

function hasLiveRun(rows) {
  return (Array.isArray(rows) ? rows : []).some((x) => x && x.status === 'run' && x.api_calls > 0);
}

module.exports = { buildTable, hasLiveRun };
