'use strict';
// PX-1 (W-A): dashboard adapter tests. Offline only: no LLM, no browser, no
// network. Fixtures are built in temp dirs (never pinned fixtures/) so the
// fixture manifest is untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  NOT_RECORDED,
  caseRecordsFromDashboard,
  dashboardToReport,
  adaptDashboards,
  loadDashboardsFromDir,
} = require('../src/dashboardAdapter');
const { aggregateCaseRecords, caseRecordsToMarkdown } = require('../src/metricsCalc');

// Minimal fixture in the REAL dashboard_data.json shape (trimmed), with two
// executed tests: FT001 all-PASS (one weak), FT002 a FAIL step.
function dash(overrides) {
  const base = {
    run_dir: 'run_test_0001',
    generated_from_artifacts: true,
    llm_calls: 0,
    wall_clock: null,
    headline: {
      total_final_tests: 4,
      tests_from_architecture_a: 2,
      tests_from_architecture_b: 1,
      tests_fusion_created: 1,
      tests_already_covered_by_ab: 0,
      pct_final_tests_attributable_to_fusion: 25,
      novel_targets_exercised_by_fusion: 6,
    },
    coverage_matrix: { elements: { total: 204 }, behaviors: { total: 23 }, tests: { total: 4 }, states: { a: 15 } },
    architecture_comparison: { a: { tests: 2 }, b: { tests: 1 } },
    findings: { conflicts: [] },
    gaps: { actionable_uncovered_sample: [] },
    fusion: {
      tests_generated: 2,
      tests_accepted: 2,
      tests_rejected: 0,
      provider: 'openrouter:google/gemini-3.5-flash',
      tests: [
        { test_id: 'FT001', objective: 'obj1', start_page: 'https://s.example/a', source_gap_id: 'gap_1' },
        { test_id: 'FT002', objective: 'obj2', start_page: 'https://s.example/b', source_gap_id: 'gap_2' },
      ],
      sources: ['fusion/fusion_tests.json'],
    },
    execution: {
      available: true,
      executed_tests: 2,
      passed: 1,
      failed: 1,
      pass_rate: 50,
      steps_total: 4,
      steps_passed: 3,
      weak_verifications: 1,
      verification_methods: { url_change: 1, weak_page_change: 1, popup_opened_or_dom_response: 1 },
      steps: [
        { test_id: 'FT001', step: 1, action: 'navigate', ref: 'https://s.example/a', result: 'PASS', method: 'url_change' },
        { test_id: 'FT001', step: 2, action: 'click', ref: 'el_1', result: 'PASS', method: 'weak_page_change' },
        { test_id: 'FT002', step: 1, action: 'click', ref: 'el_2', result: 'PASS', method: 'popup_opened_or_dom_response' },
        { test_id: 'FT002', step: 2, action: 'click', ref: 'el_3', result: 'FAIL', method: null },
      ],
      evidence_dir: 'fusion/ft_execution_evidence/',
      sources: ['fusion/ft_execution_results.json'],
    },
  };
  return Object.assign({}, base, overrides || {});
}

test('PX1 adapter: reconstructs one case record per executed test (real n)', () => {
  const cases = caseRecordsFromDashboard(dash());
  assert.equal(cases.length, 2); // REAL n = executed tests, not 0
  const ft1 = cases.find((c) => c.id === 'FT001');
  const ft2 = cases.find((c) => c.id === 'FT002');
  assert.equal(ft1.verdict, 'PASS_WEAK(1)'); // all steps PASS, one weak method -> PASS_WEAK
  assert.equal(ft1.objective, 'obj1');
  assert.equal(ft1.attribution, 'fusion-created');
  assert.equal(ft2.verdict, 'FAIL'); // one FAIL step -> FAIL
  assert.equal(ft2.source_gap_id, 'gap_2');
});

test('PX1 adapter: derived PASS/FAIL tallies reproduce the dashboard own counts', () => {
  const d = dash();
  const cases = caseRecordsFromDashboard(d);
  const fail = cases.filter((c) => c.verdict === 'FAIL').length;
  const pass = cases.filter((c) => c.verdict === 'PASS' || c.verdict.startsWith('PASS_WEAK')).length;
  assert.equal(fail, d.execution.failed);
  assert.equal(pass, d.execution.passed);
  assert.equal(cases.length, d.execution.executed_tests);
});

test('PX1 adapter: unavailable per-case fields are NOT_RECORDED, never 0/false', () => {
  const c = caseRecordsFromDashboard(dash())[0];
  assert.equal(c.dom_assist, NOT_RECORDED);
  assert.equal(c.label, NOT_RECORDED);
  assert.equal(c.app_outcome, NOT_RECORDED);
  assert.notEqual(c.dom_assist, 0);
  assert.notEqual(c.dom_assist, false);
});

test('PX1 adapter: cost/identity NOT_RECORDED (tokens, usd, blind) and api_calls recorded', () => {
  const r = dashboardToReport(dash());
  assert.equal(r.cost.api_calls, 0); // recorded field (llm_calls)
  assert.equal(r.cost.tokens_in, NOT_RECORDED);
  assert.equal(r.cost.tokens_out, NOT_RECORDED);
  assert.equal(r.cost.usd_estimated, NOT_RECORDED);
  assert.equal(r.brain.blind, NOT_RECORDED);
  assert.equal(r.brain.model, 'openrouter:google/gemini-3.5-flash');
  assert.equal(r.site.url, NOT_RECORDED); // no manifest passed
  assert.ok(r.not_recorded.includes('cost.tokens_in'));
  assert.ok(r.not_recorded.includes('site.url'));
});

test('PX1 adapter: no execution -> 0 cases, verdict NOT_RECORDED (not FAIL), pass_rate NOT_RECORDED', () => {
  const d = dash({ execution: { available: false, executed_tests: 0, passed: 0, failed: 0, pass_rate: null, steps: [] } });
  const r = dashboardToReport(d);
  assert.equal(r.cases.length, 0);
  assert.equal(r.case_summary.n_cases, 0);
  assert.equal(r.result.verdict, NOT_RECORDED); // unknown, never FAIL
  assert.equal(r.result.pass_rate, NOT_RECORDED);
  assert.notEqual(r.result.pass_rate, 0); // NOT_RECORDED must never be zeroed
  assert.equal(r.case_summary.executed, 0); // recorded 0 stays 0
});

test('PX1 adapter: manifest supplies site.url; not_executed computed from recorded counts', () => {
  const r = dashboardToReport(dash(), { manifest: { url: 'https://s.example/' } });
  assert.equal(r.site.url, 'https://s.example/');
  assert.equal(r.case_summary.final_tests, 4);
  assert.equal(r.case_summary.executed, 2);
  assert.equal(r.case_summary.not_executed, 2); // 4 - 2, real remaining set
});

test('PX1 adapter: steps without a fusion test still become records (attribution NOT_RECORDED)', () => {
  const d = dash();
  d.fusion.tests = [];
  const cases = caseRecordsFromDashboard(d);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].attribution, NOT_RECORDED);
  assert.equal(cases[0].objective, NOT_RECORDED);
});

test('PX1 loader: walks runs root, reads sibling manifest url, skips non-run dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px1-'));
  const run = path.join(root, 'run_20260823_225906');
  fs.mkdirSync(path.join(run, 'fusion'), { recursive: true });
  fs.writeFileSync(path.join(run, 'fusion', 'dashboard_data.json'), JSON.stringify(dash()));
  fs.writeFileSync(path.join(run, 'run_manifest.json'), JSON.stringify({ run_id: 'run_20260823_225906', url: 'https://saucedemo.com/' }));
  fs.writeFileSync(path.join(root, 'notes.json'), '{}'); // non-run file must be ignored
  const reports = loadDashboardsFromDir(root);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].site.url, 'https://saucedemo.com/');
  assert.equal(reports[0].cases.length, 2);
});

test('PX1 aggregate: NOT_RECORDED never becomes 0; pass_rate is null with no recorded verdicts', () => {
  const reports = adaptDashboards([dash({ execution: { available: false, executed_tests: 0, passed: 0, failed: 0, pass_rate: null, steps: [] } })]);
  const m = aggregateCaseRecords(reports);
  assert.equal(m.sites, 1);
  assert.equal(m.cases_total, 0);
  assert.equal(m.pass_rate, null); // not 0
  assert.equal(m.cost.tokens_in, NOT_RECORDED);
  assert.equal(m.cost.usd_estimated, NOT_RECORDED);
  assert.ok(m.not_recorded_fields.includes('cost.tokens_in'));
});

test('PX1 aggregate: arithmetic numerator/denominator exact over a mixed fixture set', () => {
  const reports = adaptDashboards([
    dash(),
    dash({ run_dir: 'run_test_0002' }),
  ]);
  const m = aggregateCaseRecords(reports);
  assert.equal(m.sites, 2);
  assert.equal(m.cases_total, 4); // 2 + 2 (real n)
  assert.equal(m.cases_pass, 2);
  assert.equal(m.cases_fail, 2);
  assert.equal(m.arithmetic.pass_rate_numerator, 2);
  assert.equal(m.arithmetic.pass_rate_denominator, 4);
  assert.equal(m.pass_rate, 0.5);
  assert.equal(m.arithmetic.cases_pass + m.arithmetic.cases_fail + m.arithmetic.cases_not_recorded, m.arithmetic.cases_total);
});

test('PX1 aggregate: unrecorded-verdict case is counted separately, NOT as FAIL (no-zero control)', () => {
  const r = dashboardToReport(dash());
  r.cases.push({ id: 'FT003', verdict: NOT_RECORDED, weak_steps: 0, label: NOT_RECORDED });
  const m = aggregateCaseRecords([r]);
  assert.equal(m.cases_total, 3);
  assert.equal(m.cases_fail, 1); // only the genuine FAIL
  assert.equal(m.cases_not_recorded, 1);
  assert.equal(m.arithmetic.pass_rate_denominator, 2); // NOT_RECORDED excluded from the rate, not forced to 0/FAIL
});

test('PX1 markdown: table carries the reproducible denominator', () => {
  const m = aggregateCaseRecords(adaptDashboards([dash()]));
  const md = caseRecordsToMarkdown(m);
  assert.ok(md.includes('1/2 recorded-verdict cases'));
  assert.ok(md.includes('| run_id | site |'));
});

test('PX1 adapter: pure function, no mutation of input', () => {
  const d = dash();
  const before = JSON.stringify(d);
  dashboardToReport(d);
  caseRecordsFromDashboard(d);
  assert.equal(JSON.stringify(d), before);
});
