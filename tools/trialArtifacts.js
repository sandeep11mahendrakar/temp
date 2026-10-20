'use strict';

// Offline adapter: genuine explorer result -> research/trial report.json.
// Missing measurements stay NOT_RECORDED; no invented verdicts.
const fs = require('node:fs');
const path = require('node:path');

const NOT_RECORDED = 'NOT_RECORDED';

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function toReport(exploration, options = {}) {
  const result = exploration && typeof exploration === 'object' ? exploration : {};
  const runId = result.run_id || result.runId || options.run_id || NOT_RECORDED;
  const testCasesPath = result.test_cases_file || options.test_cases_file;
  let testCases = [];
  if (testCasesPath && fs.existsSync(testCasesPath) && fs.statSync(testCasesPath).isFile()) {
    try { const parsed = readJson(testCasesPath); if (Array.isArray(parsed)) testCases = parsed; } catch { testCases = []; }
  }
  const evidenceRefs = [path.basename(String(result.source_file || options.source_file || 'exploration_result.json'))];
  if (testCasesPath) evidenceRefs.push(path.basename(testCasesPath));
  const cases = testCases.map((tc, index) => ({
    id: (tc && tc.id) ? String(tc.id) : `CASE-${index + 1}`,
    verdict: NOT_RECORDED,
    tc_source: 'explorer',
    label: 'ASSISTED',
    block: null,
    evid_paths: evidenceRefs.slice(),
  }));
  if (cases.length === 0) {
    cases.push({
      id: NOT_RECORDED,
      verdict: NOT_RECORDED,
      tc_source: 'explorer',
      label: 'ASSISTED',
      block: null,
      evid_paths: evidenceRefs.slice(),
    });
  }
  const report = {
    schema_version: '1.0',
    experiment_kind: options.experiment_kind || 'TRIAL',
    citable: options.citable === true,
    aggregate_eligibility: options.aggregate_eligibility || 'EXCLUDED',
    sample_class: result.sample_class || NOT_RECORDED,
    run: { id: runId, source: 'explorer' },
    result: { verdict: NOT_RECORDED },
    integrity: { verdict: NOT_RECORDED },
    cases,
    telemetry: {
      total_steps: result.totals && Number.isFinite(result.totals.total_steps) ? result.totals.total_steps : NOT_RECORDED,
      total_states: result.totals && Number.isFinite(result.totals.total_states) ? result.totals.total_states : NOT_RECORDED,
      unique_states: result.totals && Number.isFinite(result.totals.unique_states) ? result.totals.unique_states : NOT_RECORDED,
      unique_urls: result.totals && Number.isFinite(result.totals.unique_urls) ? result.totals.unique_urls : NOT_RECORDED,
      repeated_states_skipped: result.totals && Number.isFinite(result.totals.repeated_states_skipped) ? result.totals.repeated_states_skipped : NOT_RECORDED,
      action_errors: result.totals && Number.isFinite(result.totals.action_errors) ? result.totals.action_errors : NOT_RECORDED,
      generated_tests: result.totals && Number.isFinite(result.totals.generated_tests) ? result.totals.generated_tests : NOT_RECORDED,
      click_actions: result.totals && Number.isFinite(result.totals.click_actions) ? result.totals.click_actions : NOT_RECORDED,
      fill_actions: result.totals && Number.isFinite(result.totals.fill_actions) ? result.totals.fill_actions : NOT_RECORDED,
      scroll_actions: result.totals && Number.isFinite(result.totals.scroll_actions) ? result.totals.scroll_actions : NOT_RECORDED,
      submit_actions: result.totals && Number.isFinite(result.totals.submit_actions) ? result.totals.submit_actions : NOT_RECORDED,
      avg_steps_per_test: result.totals && Number.isFinite(result.totals.avg_steps_per_test) ? result.totals.avg_steps_per_test : NOT_RECORDED,
    },
  };
  return report;
}

function main() {
  const args = process.argv.slice(2);
  let input; let output; let testCases;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--test-cases' && args[i + 1]) testCases = args[++i];
    else throw new Error('usage: node tools/trialArtifacts.js --input <exploration_result.json> [--test-cases <file>] --output <report.json>');
  }
  if (!input) throw new Error('input required');
  const exploration = readJson(path.resolve(input));
  if (testCases) exploration.test_cases_file = path.resolve(testCases);
  exploration.source_file = path.basename(input);
  const report = toReport(exploration, {});
  const text = JSON.stringify(report, null, 2) + '\n';
  if (output) fs.writeFileSync(path.resolve(output), text, { encoding: 'utf8', flag: 'wx' });
  else process.stdout.write(text);
}

module.exports = { toReport };
if (require.main === module) {
  try { main(); } catch (error) { console.error('TRIAL-ARTIFACTS-REFUSED ' + error.message); process.exitCode = 1; }
}
