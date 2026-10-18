'use strict';

// dashboardAdapter.js — PX-1 (W-A): offline parse adapter for the REAL fusion
// `dashboard_data.json` shape produced by the canonical campaign runs.
//
// Why this exists: `vision/src/metricsCalc.js` (R-3) consumes a reports-v1
// shape (`{ run, result, cases[], cost, brain }`). The fusion dashboard is a
// different shape (headline / coverage_matrix / architecture_comparison /
// findings / gaps / fusion / execution) and has NO `cases[]`, so R-3 honestly
// reported 0 case records on `fusion/dashboard_data.json`.
//
// This adapter maps the REAL recorded fields into that report shape so the
// calculator can compute per-case records with a REAL n.
//
// NOT_RECORDED law (binding): any field the dashboard did not record is set to
// the literal 'NOT_RECORDED' (or null for a rate/mean that cannot exist). It is
// never zeroed, never estimated, never inferred from another field.
//
// Read-only. No LLM, no browser, no network. `node:fs` is used only by the
// directory loader.
//
// Real-shape evidence (canonical runs root, 69 dashboards, 2026-10-18):
//   top-level keys: run_dir, generated_from_artifacts, schema_version(38/69),
//   llm_calls, wall_clock, headline, coverage_matrix, architecture_comparison,
//   findings, gaps, fusion, execution.
//   execution keys: available, executed_tests, passed, failed, pass_rate,
//   steps_total, steps_passed, weak_verifications, verification_methods,
//   reliability_flakiness, steps[], evidence_dir, sources.
//   step keys: test_id, step, action, ref, result(PASS|FAIL), method
//   (url_change|popup_opened_or_dom_response|dropdown_option_selected|
//   input_value_persisted|weak_page_change|null), coordinates_live, detail.
// Invariants verified over all 69 dashboards:
//   * test-groups reconstructed from steps === execution.executed_tests (69/69)
//   * derived PASS groups === execution.passed (69/69)
//   * derived FAIL groups === execution.failed (69/69)
//   * weak steps ('weak_page_change') === execution.weak_verifications (43)

const fs = require('node:fs');
const path = require('node:path');

const NOT_RECORDED = 'NOT_RECORDED';

// Verification methods that the executor itself tags weak (see execution
// `.weak_verifications` accounting in the dashboards).
const WEAK_METHODS = new Set(['weak_page_change']);

function isObj(v) { return v !== null && typeof v !== 'object' ? false : (typeof v === 'object' && v !== null); }
function recorded(v) { return v !== null && v !== undefined; }
function rec(v, fallback = NOT_RECORDED) { return recorded(v) ? v : fallback; }

// Reconstruct one case record per executed test from execution.steps, grouped
// by test_id in first-seen order. A test with any FAIL step is FAIL; otherwise
// it is PASS, or PASS_WEAK(k) when k of its steps used a weak verification
// method (matches the executor's PASS_WEAK convention and counts).
function caseRecordsFromDashboard(dashboard) {
  const d = isObj(dashboard) ? dashboard : {};
  const exec = isObj(d.execution) ? d.execution : {};
  const steps = Array.isArray(exec.steps) ? exec.steps.filter(isObj) : [];

  // objective/start_page lookup from the fusion test list, when present.
  const fusionTests = isObj(d.fusion) && Array.isArray(d.fusion.tests) ? d.fusion.tests.filter(isObj) : [];
  const byId = new Map();
  for (const t of fusionTests) if (recorded(t.test_id)) byId.set(String(t.test_id), t);

  const groups = new Map();
  for (const s of steps) {
    const id = recorded(s.test_id) ? String(s.test_id) : NOT_RECORDED;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(s);
  }

  const out = [];
  for (const [id, group] of groups) {
    let fail = 0, pass = 0, weak = 0;
    for (const s of group) {
      if (s.result === 'FAIL') fail += 1;
      else if (s.result === 'PASS') {
        pass += 1;
        if (WEAK_METHODS.has(s.method)) weak += 1;
      }
    }
    let verdict;
    if (fail > 0) verdict = 'FAIL';
    else if (pass > 0) verdict = weak > 0 ? 'PASS_WEAK(' + weak + ')' : 'PASS';
    else verdict = NOT_RECORDED; // steps existed but no PASS/FAIL result recorded

    const t = byId.get(id);
    out.push({
      id,
      objective: t ? rec(t.objective) : NOT_RECORDED,
      start_page: t ? rec(t.start_page) : NOT_RECORDED,
      verdict,
      steps: group.length,
      weak_steps: weak,
      // The dashboard records none of these per case -> NOT_RECORDED (never 0).
      dom_assist: NOT_RECORDED,
      app_outcome: NOT_RECORDED,
      label: NOT_RECORDED,
      block: null,
      // Attribution: steps only ever reference fusion-created tests (verified:
      // 0 step test_ids absent from fusion.tests across the canon).
      attribution: t ? 'fusion-created' : NOT_RECORDED,
      source_gap_id: t ? rec(t.source_gap_id) : NOT_RECORDED,
    });
  }
  return out;
}

function overallVerdict(cases) {
  if (!cases.length) return NOT_RECORDED; // nothing executed: unknown, not FAIL
  const fail = cases.filter((c) => c.verdict === 'FAIL').length;
  const pass = cases.filter((c) => c.verdict === 'PASS' || String(c.verdict).startsWith('PASS_WEAK')).length;
  if (fail === 0 && pass > 0) return 'PASS';
  if (pass === 0 && fail > 0) return 'FAIL';
  if (pass > 0 && fail > 0) return 'MIXED';
  return NOT_RECORDED;
}

// dashboard_data.json -> reports-v1-shaped report (consumed by metricsCalc).
// opts.manifest (optional) = parsed run_manifest.json sibling, used only for
// the site URL; absent => site.url = NOT_RECORDED.
function dashboardToReport(dashboard, opts) {
  const d = isObj(dashboard) ? dashboard : {};
  const o = isObj(opts) ? opts : {};
  const exec = isObj(d.execution) ? d.execution : {};
  const headline = isObj(d.headline) ? d.headline : {};
  const fusion = isObj(d.fusion) ? d.fusion : {};
  const manifest = isObj(o.manifest) ? o.manifest : null;

  const cases = caseRecordsFromDashboard(d);

  const finalTests = recorded(headline.total_final_tests) ? headline.total_final_tests : NOT_RECORDED;
  const executed = recorded(exec.executed_tests) ? exec.executed_tests : NOT_RECORDED;
  let notExecuted = NOT_RECORDED;
  if (typeof finalTests === 'number' && typeof executed === 'number') {
    notExecuted = finalTests - executed; // real remaining set; never fudged
  }

  const notRecorded = [];
  const mark = (name, v) => { if (v === NOT_RECORDED) notRecorded.push(name); };
  mark('cost.tokens_in', NOT_RECORDED);
  mark('cost.tokens_out', NOT_RECORDED);
  mark('cost.usd_estimated', NOT_RECORDED);
  if (!recorded(fusion.provider)) notRecorded.push('brain.model');
  if (!manifest || !recorded(manifest.url)) notRecorded.push('site.url');

  return {
    schema: 'dashboard-adapter-1',
    adapter_source: 'fusion/dashboard_data.json',
    run: { id: recorded(d.run_dir) ? d.run_dir : NOT_RECORDED },
    site: {
      url: manifest && recorded(manifest.url) ? manifest.url : NOT_RECORDED,
      run_id: recorded(d.run_dir) ? d.run_dir : NOT_RECORDED,
    },
    result: {
      verdict: overallVerdict(cases),
      pass_rate: recorded(exec.pass_rate) ? exec.pass_rate : NOT_RECORDED,
      pass_rate_unit: 'percent',
    },
    cases,
    case_summary: {
      n_cases: cases.length, // REAL n (executed, case-level outcome recorded)
      final_tests: finalTests,
      from_a: recorded(headline.tests_from_architecture_a) ? headline.tests_from_architecture_a : NOT_RECORDED,
      from_b: recorded(headline.tests_from_architecture_b) ? headline.tests_from_architecture_b : NOT_RECORDED,
      fusion_created: recorded(headline.tests_fusion_created) ? headline.tests_fusion_created : NOT_RECORDED,
      already_covered: recorded(headline.tests_already_covered_by_ab) ? headline.tests_already_covered_by_ab : NOT_RECORDED,
      pct_fusion_attributable: recorded(headline.pct_final_tests_attributable_to_fusion) ? headline.pct_final_tests_attributable_to_fusion : NOT_RECORDED,
      executed,
      passed: recorded(exec.passed) ? exec.passed : NOT_RECORDED,
      failed: recorded(exec.failed) ? exec.failed : NOT_RECORDED,
      not_executed: notExecuted,
    },
    cost: {
      api_calls: recorded(d.llm_calls) ? d.llm_calls : NOT_RECORDED, // recorded field
      tokens_in: NOT_RECORDED,
      tokens_out: NOT_RECORDED,
      usd_estimated: NOT_RECORDED,
    },
    brain: {
      mode: NOT_RECORDED,
      model: recorded(fusion.provider) ? fusion.provider : NOT_RECORDED,
      blind: NOT_RECORDED,
    },
    block: null,
    not_recorded: notRecorded,
    sources: Array.isArray(fusion.sources) ? fusion.sources.slice() : [],
  };
}

function adaptDashboards(list, opts) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map((d) => dashboardToReport(d, opts)).filter(Boolean);
}

// Walk `root` for `<run>/fusion/dashboard_data.json`. For each, optionally read
// the sibling `<run>/run_manifest.json` for the site URL. Returns an array of
// adapted reports. Unparseable/absent files are skipped (never invented).
function loadDashboardsFromDir(root) {
  if (!root || !fs.existsSync(root)) return [];
  const found = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    // Recognize a run dir directly when it contains fusion/dashboard_data.json
    const direct = path.join(dir, 'fusion', 'dashboard_data.json');
    if (fs.existsSync(direct)) {
      found.push({ dashboard: direct, manifest: path.join(dir, 'run_manifest.json') });
      continue; // don't descend into a recognized run dir
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === 'node_modules' || e.name === '.git') continue;
      stack.push(path.join(dir, e.name));
    }
  }
  const out = [];
  for (const f of found) {
    let dashboard = null;
    try { dashboard = JSON.parse(fs.readFileSync(f.dashboard, 'utf8')); } catch { dashboard = null; }
    if (!dashboard) continue;
    let manifest = null;
    try { if (fs.existsSync(f.manifest)) manifest = JSON.parse(fs.readFileSync(f.manifest, 'utf8')); } catch { manifest = null; }
    out.push(dashboardToReport(dashboard, { manifest }));
  }
  return out;
}

module.exports = {
  NOT_RECORDED,
  WEAK_METHODS,
  caseRecordsFromDashboard,
  dashboardToReport,
  adaptDashboards,
  loadDashboardsFromDir,
};
