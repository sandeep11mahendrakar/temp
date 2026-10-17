'use strict';

/**
 * archetypeProposals.js — E-3 promotion proposals (never auto-edit archetypes).
 *
 * A lesson pattern seen on >= minSites distinct runs becomes a PROPOSAL for an
 * archetype hint. Output is a proposal FILE only; archetypes.js is never
 * modified automatically. Human review required before adoption.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MIN = 3;

function buildProposals(store, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const minSites = Number.isFinite(o.minSites) ? o.minSites : DEFAULT_MIN;
  const lessons = (store && Array.isArray(store.lessons)) ? store.lessons : [];
  const out = [];
  for (const l of lessons) {
    const runs = Array.isArray(l && l.run_ids) ? l.run_ids : [];
    const distinct = new Set(runs).size;
    const count = Number.isFinite(l && l.count) ? l.count : runs.length;
    if (distinct >= minSites || count >= minSites) {
      out.push({
        pattern: String((l && l.pattern) || ''),
        action: String((l && l.action) || ''),
        outcome: String((l && l.outcome) || ''),
        lesson: String((l && l.lesson) || ''),
        confidence: String((l && l.confidence) || ''),
        count,
        distinct_runs: distinct,
        run_ids: runs.slice(),
        proposed_hint: `// PROPOSAL (review required): ${String((l && l.pattern) || '')} -> ${String((l && l.action) || '')}`,
        auto_edit: false,
      });
    }
  }
  return out;
}

function writeProposalFile(file, proposals) {
  const dir = path.dirname(path.resolve(file));
  fs.mkdirSync(dir, { recursive: true });
  const payload = { version: 1, generated_at: new Date().toISOString(), auto_edit: false, proposals: Array.isArray(proposals) ? proposals : [] };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}

module.exports = { DEFAULT_MIN, buildProposals, writeProposalFile };
