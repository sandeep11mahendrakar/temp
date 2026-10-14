'use strict';

/**
 * reportSchema.js — B7 run-report JSON schema v1 + markdown INDEX row.
 *
 * One citable artifact per run: run/loops/cases + result + cost +
 * backup-storage paths. Pure, zero dependencies beyond node:crypto for the
 * citation hash (stdlib only, no network, no LLM).
 *   report = { schema:1, run:{id,ts,source}, loops:[{n,delta,covered}],
 *              cases:[{id,verdict,weak_steps,evidence}], result:{verdict,pass_rate},
 *              cost:{api_calls,tokens_in,tokens_out,usd_estimated},
 *              storage:{paths[]}, citable:{ref,sha1} }
 * - cost is carried verbatim (0 stays 0 — honesty over estimation); usd is
 *   caller-supplied, never invented here (null when unknown).
 * - sha1 covers the canonical (key-sorted) JSON sans citable itself.
 * - indexRow(report) renders one markdown table row for an INDEX doc.
 * - checkReport(report) returns violation strings (empty = valid).
 */

const crypto = require('node:crypto');

const SCHEMA_VERSION = 1;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function sha1Of(obj) {
  return crypto.createHash('sha1').update(stableStringify(obj)).digest('hex');
}

function num(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

// N5 schema-gaps: canonical 20-action enum (K5-gap3 — test-item steps had
// NO action enum anywhere). checkAction() returns null when known, else a
// violation string. Consumer: tc lanes (K1/K3); report cases carry no
// steps so checkReport stays shape-only by design.
const ACTION_ENUM = [
  'click', 'fill', 'scroll', 'navigate',
  'key', 'submit', 'select', 'check', 'uncheck',
  'hover', 'dblclick', 'right_click', 'press', 'wait',
  'focus', 'clear', 'upload', 'drag', 'snapshot',
  'selectOption',
];

function checkAction(action) {
  const a = String(action || '').trim();
  if (!a) return 'action:missing';
  const hit = ACTION_ENUM.find((k) => k.toLowerCase() === a.toLowerCase());
  if (!hit) return `action:unknown:${a.slice(0, 40)}`;
  return null;
}

// N4 blind rule: blind=Y ONLY when the run used an empty cwd AND tools-off
// AND JSON-only I/O. Anything else is AUTONOMY_NONBLIND. AUTONOMOUS is
// never granted unless blind (downgraded, never upgraded).
function blindStatus(flags) {
  const f = (flags && typeof flags === 'object' ? flags : {});
  const blind = f.cwdEmpty === true && f.toolsOff === true && f.jsonOnly === true;
  return blind ? 'Y' : 'AUTONOMY_NONBLIND';
}

function resolveAutonomy(input) {
  const blind = blindStatus(input);
  const req = input && typeof input.requested === 'string' ? input.requested : '';
  if (req === 'AUTONOMOUS') return blind === 'Y' ? 'AUTONOMOUS' : 'AUTONOMY_NONBLIND';
  if (req) return req;
  return blind === 'Y' ? 'BLIND' : 'AUTONOMY_NONBLIND';
}

function buildReport(input) {
  const src = (input && typeof input === 'object' ? input : {});
  const runId = String(src.runId || `run_${Date.now()}`);
  const loops = Array.isArray(src.loops) ? src.loops.map((l) => ({
    n: num(l && l.n),
    delta: Array.isArray(l && l.delta) ? l.delta : (l && l.delta === null ? null : []),
    covered: Boolean(l && l.covered),
  })) : [];
  const cases = Array.isArray(src.cases) ? src.cases.map((c) => ({
    id: String((c && c.id) || ''),
    verdict: String((c && c.verdict) || 'UNKNOWN'),
    weak_steps: num(c && c.weak_steps),
    // G3: report cases carry verdict + app_outcome (default n/a for
    // pre-oracle results; additive, existing rows unaffected).
    app_outcome: c && typeof c.app_outcome === 'string' ? c.app_outcome : 'n/a',
    evidence: String((c && c.evidence) || ''),
  })) : [];
  const costIn = (src.cost && typeof src.cost === 'object') ? src.cost : {};
  const passed = cases.filter((c) => c.verdict === 'PASS' || c.verdict.startsWith('PASS_WEAK')).length;
  const brainIn = (src.brain && typeof src.brain === 'object') ? src.brain : null;
  const body = {
    schema: SCHEMA_VERSION,
    run: {
      id: runId,
      ts: String(src.ts || new Date().toISOString()),
      source: String(src.source || 'vision-loopB'),
    },
    loops,
    cases,
    result: {
      verdict: String(src.verdict || (cases.length && passed === cases.length ? 'PASS' : 'MIXED')),
      pass_rate: cases.length ? Number((passed / cases.length).toFixed(3)) : 0,
    },
    cost: {
      api_calls: num(costIn.api_calls),
      tokens_in: num(costIn.tokens_in),
      tokens_out: num(costIn.tokens_out),
      usd_estimated: costIn.usd_estimated === null || costIn.usd_estimated === undefined
        ? null : Number(costIn.usd_estimated),
    },
    // N4: report carries brain{mode,model,blind} when the caller provides a
    // brain block; absent block means pre-N4 report (field omitted, old
    // reports still validate).
    ...(brainIn ? {
      brain: {
        mode: String(brainIn.mode || 'unknown'),
        model: String(brainIn.model || 'unknown'),
        blind: blindStatus(brainIn),
      },
    } : {}),
    storage: {
      paths: Array.isArray(src.storagePaths) ? src.storagePaths.map(String) : [],
    },
  };
  const ref = `run-${runId}`;
  return { ...body, citable: { ref, sha1: sha1Of(body) } };
}

function indexRow(report) {
  const r = (report && typeof report === 'object') ? report : {};
  const cells = [
    (r.citable && r.citable.ref) || '',
    (r.result && r.result.verdict) || '',
    r.result && r.result.pass_rate !== undefined ? String(r.result.pass_rate) : '',
    r.cost && r.cost.usd_estimated !== undefined && r.cost.usd_estimated !== null ? String(r.cost.usd_estimated) : 'n/a',
    ((r.storage && r.storage.paths) || []).join(';'),
    (r.citable && r.citable.sha1) || '',
  ];
  return `| ${cells.join(' | ')} |`;
}

function checkReport(report) {
  const bad = [];
  if (!report || typeof report !== 'object') return ['not-an-object'];
  if (report.schema !== SCHEMA_VERSION) bad.push(`schema!=${SCHEMA_VERSION}`);
  for (const k of ['run', 'loops', 'cases', 'result', 'cost', 'storage', 'citable']) {
    if (!(k in report)) bad.push(`missing:${k}`);
  }
  if (report.run && typeof report.run.id !== 'string') bad.push('run.id:not-string');
  if (report.cases && !Array.isArray(report.cases)) bad.push('cases:not-array');
  if (report.cost && typeof report.cost.api_calls !== 'number') bad.push('cost.api_calls:not-number');
  if (report.citable && typeof report.citable.sha1 !== 'string') bad.push('citable.sha1:not-string');
  return bad;
}

module.exports = {
  SCHEMA_VERSION,
  ACTION_ENUM,
  checkAction,
  stableStringify,
  sha1Of,
  buildReport,
  indexRow,
  checkReport,
  blindStatus,
  resolveAutonomy,
};
