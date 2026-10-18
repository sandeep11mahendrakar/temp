'use strict';

// tools/px1CaseRecords.js — PX-1 (W-A) reproduction script.
//
// Regenerates the per-site case-record table from the REAL fusion
// `dashboard_data.json` shape via `vision/src/dashboardAdapter.js` +
// `vision/src/metricsCalc.aggregateCaseRecords()`. Offline: no LLM, no browser,
// no network. Read-only over the runs root; writes evidence only under
// `vision/storage/outputs/` (git-ignored, on-disk) unless --no-write.
//
// FX-2 law: every headline number is printed with its arithmetic
// (numerator/denominator) so a reader can reproduce it by hand:
//   pass_rate = cases_pass / (cases_pass + cases_fail)
// NOT_RECORDED fields are excluded from that rate and never zeroed.
//
// Usage:
//   node tools/px1CaseRecords.js [--root <runs-root>] [--out <dir>] [--no-write] [--quiet]

const fs = require('node:fs');
const path = require('node:path');

const { loadDashboardsFromDir } = require('../vision/src/dashboardAdapter');
const { aggregateCaseRecords, caseRecordsToMarkdown, NOT_RECORDED } = require('../vision/src/metricsCalc');

const DEFAULT_ROOT = 'C:/Users/sandeep/pes/vs code/Capstone-Project/runs';
const DEFAULT_OUT = path.join(__dirname, '..', 'vision', 'storage', 'outputs');

function parseArgs(argv) {
  const out = { root: DEFAULT_ROOT, out: DEFAULT_OUT, write: true, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') { out.root = argv[i + 1]; i += 1; }
    else if (a === '--out') { out.out = argv[i + 1]; i += 1; }
    else if (a === '--no-write') out.write = false;
    else if (a === '--quiet') out.quiet = true;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reports = loadDashboardsFromDir(args.root);
  const m = aggregateCaseRecords(reports);

  const lines = [];
  lines.push('=== PX-1 case records (dashboard_data.json adapter) ===');
  lines.push('Root: ' + args.root);
  lines.push('Dashboards: ' + m.sites);
  lines.push('');
  lines.push('--- Arithmetic (reproducible by hand) ---');
  lines.push('pass_rate = cases_pass / (cases_pass + cases_fail)');
  lines.push('          = ' + m.cases_pass + ' / (' + m.cases_pass + ' + ' + m.cases_fail + ') = ' +
    (m.pass_rate === null ? 'n/a' : m.pass_rate));
  lines.push('cases_total = cases_pass + cases_fail + cases_not_recorded = ' +
    m.cases_pass + ' + ' + m.cases_fail + ' + ' + m.cases_not_recorded + ' = ' + m.cases_total);
  lines.push('weak (PASS_WEAK) = ' + m.cases_weak);
  lines.push('final_tests_total = ' + m.final_tests_total + ' (sites ' + m.sites_with_final_tests + '/' + m.sites + ')');
  lines.push('executed_total = ' + m.executed_total + ' (sites ' + m.sites_with_executed + '/' + m.sites + ')');
  lines.push('not_executed_total = final_tests_total - executed_total = ' + m.final_tests_total + ' - ' + m.executed_total + ' = ' + m.not_executed_total);
  lines.push('api_calls_total = ' + m.api_calls_total + ' (sites recording llm_calls ' + m.api_calls_sites_recorded + '/' + m.sites + ')');
  lines.push('cost tokens/usd = ' + NOT_RECORDED + ' (excluded, never zeroed)');
  lines.push('');
  lines.push('--- Per-site case records ---');
  lines.push('run_id\tsite\tn_cases\tPASS\tFAIL\tweak\tfinal_tests\texecuted\tapi_calls');
  for (const s of m.per_site) {
    lines.push([s.run_id, s.site_url, s.n_cases, s.pass, s.fail, s.weak, s.final_tests, s.executed, s.api_calls].join('\t'));
  }
  lines.push('');
  lines.push('--- NOT_RECORDED fields (never zeroed) ---');
  lines.push(m.not_recorded_fields.join(', ') || '(none)');
  lines.push('');

  const text = lines.join('\n');
  if (!args.quiet) process.stdout.write(text + '\n');

  if (args.write) {
    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(path.join(args.out, 'px1_case_records.json'), JSON.stringify(m, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(args.out, 'px1_case_records.md'), caseRecordsToMarkdown(m), 'utf8');
    process.stdout.write('wrote: ' + path.join(args.out, 'px1_case_records.json') + '\n');
    process.stdout.write('wrote: ' + path.join(args.out, 'px1_case_records.md') + '\n');
  }
}

main();
