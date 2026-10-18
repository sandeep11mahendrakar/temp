'use strict';

// metricsCalc.js — R-3 aggregate metrics calculator (read-only over report JSONs).
// Pure, no I/O dependencies beyond node:fs for the directory loader. Never
// estimates missing numbers (null stays null; counts stay 0).
//
// PX-1 (W-A) extends this with a dashboard-aware, NOT_RECORDED-safe aggregation:
// the fusion `dashboard_data.json` shape has no `cases[]` (R-3 honestly returned
// 0 case records). `vision/src/dashboardAdapter.js` maps that real shape into
// this report shape; `aggregateCaseRecords()` then aggregates it WITHOUT zeroing
// unavailable fields (they stay the literal 'NOT_RECORDED' / null). The adapter
// is an OPTIONAL import: metricsCalc still loads and its legacy behavior is
// byte-identical when the adapter is absent.

const fs = require('node:fs');
const path = require('node:path');

const NOT_RECORDED = 'NOT_RECORDED';

function num(n, fb = 0) { return Number.isFinite(n) ? n : fb; }

// Optional import of the PX-1 adapter. Absence is tolerated (feature degrades,
// module still loads); used by the `--dashboards` CLI path only.
function loadAdapter() {
  try { return require('./dashboardAdapter'); } catch (_) { return null; }
}

function isPass(v) { return v === 'PASS' || String(v || '').startsWith('PASS_WEAK'); }
function isWeak(v) { return String(v || '').startsWith('PASS_WEAK'); }

function aggregateReports(reports) {
  const rs = Array.isArray(reports) ? reports : [];
  const out = {
    runs: rs.length,
    cases_total: 0,
    cases_pass: 0,
    pass_rate: 0,
    verdict_mix: {},
    weak_count: 0,
    weak_rate: 0,
    dom_assist_count: 0,
    dom_assist_rate: 0,
    block_count: 0,
    block_rate: 0,
    block_classes: {},
    cost: { api_calls: 0, tokens_in: 0, tokens_out: 0, usd_estimated: null },
    usd_known: false,
    labels: {},
    brains: {},
    per_run: [],
  };
  let usdSum = 0, usdN = 0;
  for (const r of rs) {
    if (!r || typeof r !== 'object') continue;
    const cases = Array.isArray(r.cases) ? r.cases : [];
    const runPass = cases.filter((c) => isPass(c && c.verdict)).length;
    const runWeak = cases.filter((c) => isWeak(c && c.verdict)).length;
    const runDom = cases.filter((c) => c && (c.dom_assist === true || c.dom_assist === 'Y' || c.dom_assist === 1)).length;
    const runBlock = cases.filter((c) => c && c.block !== null && c.block !== undefined).length;
    for (const c of cases) {
      out.cases_total += 1;
      if (isPass(c && c.verdict)) out.cases_pass += 1;
      const v = String((c && c.verdict) || 'UNKNOWN');
      out.verdict_mix[v] = (out.verdict_mix[v] || 0) + 1;
      if (isWeak(c && c.verdict)) out.weak_count += 1;
      if (c && (c.dom_assist === true || c.dom_assist === 'Y' || c.dom_assist === 1)) out.dom_assist_count += 1;
      if (c && c.block !== null && c.block !== undefined) {
        out.block_count += 1;
        const cls = typeof c.block === 'string' ? c.block : (c.block && c.block.class) || 'unknown';
        out.block_classes[cls] = (out.block_classes[cls] || 0) + 1;
      }
      const lbl = String((c && c.label) || 'n/a');
      out.labels[lbl] = (out.labels[lbl] || 0) + 1;
    }
    // run-level block
    if (r.block && typeof r.block === 'object' && r.block.class) {
      const cls = r.block.class;
      out.block_classes[cls] = (out.block_classes[cls] || 0) + 1;
    }
    if (r.brain && typeof r.brain === 'object') {
      const key = (r.brain.mode || 'unknown') + '/' + (r.brain.model || 'unknown') + '/' + (r.brain.blind || 'n/a');
      out.brains[key] = (out.brains[key] || 0) + 1;
    }
    const cost = (r.cost && typeof r.cost === 'object') ? r.cost : {};
    out.cost.api_calls += num(cost.api_calls);
    out.cost.tokens_in += num(cost.tokens_in);
    out.cost.tokens_out += num(cost.tokens_out);
    if (cost.usd_estimated !== null && cost.usd_estimated !== undefined && Number.isFinite(cost.usd_estimated)) {
      usdSum += cost.usd_estimated; usdN += 1;
    }
    out.per_run.push({
      run_id: (r.run && r.run.id) || null,
      verdict: (r.result && r.result.verdict) || null,
      pass_rate: (r.result && r.result.pass_rate) || 0,
      cases: cases.length,
      pass: runPass,
      weak: runWeak,
      dom_assist: runDom,
      blocked: runBlock,
      api_calls: num(cost.api_calls),
      tokens_in: num(cost.tokens_in),
      tokens_out: num(cost.tokens_out),
    });
  }
  out.pass_rate = out.cases_total ? Number((out.cases_pass / out.cases_total).toFixed(3)) : 0;
  out.weak_rate = out.cases_total ? Number((out.weak_count / out.cases_total).toFixed(3)) : 0;
  out.dom_assist_rate = out.cases_total ? Number((out.dom_assist_count / out.cases_total).toFixed(3)) : 0;
  out.block_rate = out.cases_total ? Number((out.block_count / out.cases_total).toFixed(3)) : 0;
  out.cost.usd_estimated = usdN ? Number(usdSum.toFixed(4)) : null;
  out.usd_known = usdN > 0;
  return out;
}

function loadReportsFromDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
      // Accept either a single report or {samples:[{report}]} or {reports:[]}
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj.samples)) {
          for (const s of obj.samples) { if (s && s.report) out.push(s.report); }
        } else if (Array.isArray(obj.reports)) {
          for (const r of obj.reports) out.push(r);
        } else {
          out.push(obj);
        }
      }
    } catch (_) { /* skip unparseable */ }
  }
  return out;
}

function metricsToMarkdown(m) {
  const mm = m || aggregateReports([]);
  const lines = [];
  lines.push('# Metrics summary');
  lines.push('');
  lines.push('- Runs: ' + mm.runs);
  lines.push('- Cases: ' + mm.cases_pass + '/' + mm.cases_total + ' pass (pass_rate ' + mm.pass_rate + ')');
  lines.push('- Weak rate: ' + mm.weak_rate + ' (' + mm.weak_count + ')');
  lines.push('- dom_assist rate: ' + mm.dom_assist_rate + ' (' + mm.dom_assist_count + ')');
  lines.push('- Block rate: ' + mm.block_rate + ' (' + mm.block_count + ')');
  if (Object.keys(mm.verdict_mix).length) lines.push('- Verdict mix: ' + Object.entries(mm.verdict_mix).map(([k,v]) => k + '=' + v).join(', '));
  if (Object.keys(mm.block_classes).length) lines.push('- Block classes: ' + Object.entries(mm.block_classes).map(([k,v]) => k + '=' + v).join(', '));
  if (Object.keys(mm.labels).length) lines.push('- Labels: ' + Object.entries(mm.labels).map(([k,v]) => k + '=' + v).join(', '));
  lines.push('- Cost: api_calls=' + mm.cost.api_calls + ', tokens_in=' + mm.cost.tokens_in + ', tokens_out=' + mm.cost.tokens_out + ', usd_estimated=' + (mm.cost.usd_estimated === null ? 'n/a' : mm.cost.usd_estimated));
  lines.push('');
  return lines.join('\n');
}

// PX-1: NOT_RECORDED-safe aggregation over dashboard-adapted reports.
// A value that was not recorded stays 'NOT_RECORDED' (strings) or null (rates);
// it is never converted to 0. Arithmetic (numerator/denominator) is exposed so
// published numbers are reproducible by hand (FX-2 law).
function aggregateCaseRecords(reports) {
  const rs = Array.isArray(reports) ? reports : [];
  const out = {
    sites: 0,
    cases_total: 0,
    cases_pass: 0,
    cases_fail: 0,
    cases_weak: 0,
    cases_not_recorded: 0,
    n_verdict_recorded: 0,
    pass_rate: null,
    verdict_mix: {},
    labels: {},
    final_tests_total: 0,
    executed_total: 0,
    not_executed_total: 0,
    sites_with_final_tests: 0,
    sites_with_executed: 0,
    attribution_total: { from_a: 0, from_b: 0, fusion_created: 0, already_covered: 0 },
    api_calls_total: 0,
    api_calls_sites_recorded: 0,
    cost: { api_calls: 0, tokens_in: NOT_RECORDED, tokens_out: NOT_RECORDED, usd_estimated: NOT_RECORDED },
    per_site: [],
    not_recorded_fields: [],
    arithmetic: {},
  };
  const nr = new Set();
  const addNum = (v) => (Number.isFinite(v) ? v : null);

  for (const r of rs) {
    if (!r || typeof r !== 'object') continue;
    out.sites += 1;
    const cs = (r.case_summary && typeof r.case_summary === 'object') ? r.case_summary : {};
    const cases = Array.isArray(r.cases) ? r.cases : [];

    let p = 0, f = 0, w = 0, unk = 0;
    for (const c of cases) {
      out.cases_total += 1;
      const v = String((c && c.verdict) || NOT_RECORDED);
      out.verdict_mix[v] = (out.verdict_mix[v] || 0) + 1;
      const lbl = String((c && c.label) || NOT_RECORDED);
      out.labels[lbl] = (out.labels[lbl] || 0) + 1;
      if (v === NOT_RECORDED) { unk += 1; out.cases_not_recorded += 1; }
      else if (v === 'FAIL') { f += 1; out.cases_fail += 1; }
      else if (v === 'PASS' || v.startsWith('PASS_WEAK')) {
        p += 1; out.cases_pass += 1;
        if (v.startsWith('PASS_WEAK')) { w += 1; out.cases_weak += 1; }
      } else { unk += 1; out.cases_not_recorded += 1; }
    }
    out.n_verdict_recorded += p + f;

    const ft = addNum(cs.final_tests);
    const ex = addNum(cs.executed);
    const ne = addNum(cs.not_executed);
    if (ft !== null) { out.final_tests_total += ft; out.sites_with_final_tests += 1; }
    if (ex !== null) { out.executed_total += ex; out.sites_with_executed += 1; }
    if (ne !== null) out.not_executed_total += ne;
    for (const k of ['from_a', 'from_b', 'fusion_created', 'already_covered']) {
      const v = addNum(cs[k]);
      if (v !== null) out.attribution_total[k] += v;
    }
    const ac = r.cost && Number.isFinite(r.cost.api_calls) ? r.cost.api_calls : null;
    if (ac !== null) { out.api_calls_total += ac; out.api_calls_sites_recorded += 1; }
    for (const cst of ['tokens_in', 'tokens_out', 'usd_estimated']) {
      const v = r.cost ? r.cost[cst] : undefined;
      if (v !== null && v !== undefined && v !== NOT_RECORDED && !Number.isFinite(v)) { /* ignore */ }
      if (v === NOT_RECORDED || v === null || v === undefined) nr.add('cost.' + cst);
    }
    for (const name of (Array.isArray(r.not_recorded) ? r.not_recorded : [])) nr.add(name);

    out.per_site.push({
      run_id: (r.run && r.run.id) || NOT_RECORDED,
      site_url: (r.site && r.site.url) || NOT_RECORDED,
      n_cases: cases.length,
      pass: p,
      fail: f,
      weak: w,
      not_recorded_cases: unk,
      final_tests: ft === null ? NOT_RECORDED : ft,
      executed: ex === null ? NOT_RECORDED : ex,
      api_calls: ac === null ? NOT_RECORDED : ac,
      pass_rate: (r.result && r.result.pass_rate !== undefined) ? r.result.pass_rate : NOT_RECORDED,
    });
  }

  out.cost = {
    api_calls: out.api_calls_total,
    tokens_in: NOT_RECORDED,
    tokens_out: NOT_RECORDED,
    usd_estimated: NOT_RECORDED,
  };
  const den = out.cases_pass + out.cases_fail;
  out.pass_rate = den > 0 ? Number((out.cases_pass / den).toFixed(3)) : null;
  out.arithmetic = {
    cases_total: out.cases_total,
    cases_pass: out.cases_pass,
    cases_fail: out.cases_fail,
    cases_weak: out.cases_weak,
    cases_not_recorded: out.cases_not_recorded,
    pass_rate_numerator: out.cases_pass,
    pass_rate_denominator: den,
    pass_rate: out.pass_rate,
    sites: out.sites,
    api_calls_total: out.api_calls_total,
    api_calls_sites_recorded: out.api_calls_sites_recorded,
    final_tests_total: out.final_tests_total,
    executed_total: out.executed_total,
    not_executed_total: out.not_executed_total,
    formula: 'pass_rate = cases_pass / (cases_pass + cases_fail); NOT_RECORDED fields excluded, never zeroed',
  };
  out.not_recorded_fields = [...nr].sort();
  return out;
}

function caseRecordsToMarkdown(m) {
  const mm = m || aggregateCaseRecords([]);
  const lines = [];
  lines.push('# Dashboard case records (PX-1)');
  lines.push('');
  lines.push('- Sites (dashboards): ' + mm.sites);
  lines.push('- Cases (real n): ' + mm.cases_total + ' = ' + mm.cases_pass + ' PASS + ' + mm.cases_fail + ' FAIL + ' + mm.cases_not_recorded + ' NOT_RECORDED');
  lines.push('- pass_rate: ' + (mm.pass_rate === null ? 'n/a' : mm.pass_rate) + ' (' + mm.cases_pass + '/' + (mm.cases_pass + mm.cases_fail) + ' recorded-verdict cases)');
  lines.push('- weak (PASS_WEAK): ' + mm.cases_weak);
  lines.push('- final_tests: ' + mm.final_tests_total + ' | executed: ' + mm.executed_total + ' | not_executed: ' + mm.not_executed_total);
  lines.push('- api_calls: ' + mm.cost.api_calls + ' (tokens/usd: ' + NOT_RECORDED + ')');
  if (Object.keys(mm.verdict_mix).length) lines.push('- verdict_mix: ' + Object.entries(mm.verdict_mix).map(([k, v]) => k + '=' + v).join(', '));
  if (mm.not_recorded_fields.length) lines.push('- NOT_RECORDED fields: ' + mm.not_recorded_fields.join(', '));
  lines.push('');
  lines.push('| run_id | site | n | PASS | FAIL | weak | final_tests | executed | api_calls |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const s of mm.per_site) {
    lines.push('| ' + s.run_id + ' | ' + (s.site_url === NOT_RECORDED ? NOT_RECORDED : s.site_url) + ' | ' + s.n_cases + ' | ' + s.pass + ' | ' + s.fail + ' | ' + s.weak + ' | ' + s.final_tests + ' | ' + s.executed + ' | ' + s.api_calls + ' |');
  }
  lines.push('');
  return lines.join('\n');
}

if (require.main === module) {
  const a = process.argv.slice(2);
  let dir = null, dashboards = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dir') { dir = a[i + 1]; i += 1; }
    else if (a[i] === '--dashboards') { dashboards = a[i + 1]; i += 1; }
  }
  if (dashboards) {
    const adapter = loadAdapter();
    if (!adapter) { process.stderr.write('error: dashboardAdapter.js not available\n'); process.exit(3); }
    const reports = adapter.loadDashboardsFromDir(dashboards);
    process.stdout.write(JSON.stringify(aggregateCaseRecords(reports), null, 2) + '\n');
  } else if (dir) {
    const reports = loadReportsFromDir(dir);
    process.stdout.write(JSON.stringify(aggregateReports(reports), null, 2) + '\n');
  } else {
    process.stderr.write('usage: node metricsCalc.js --dir <folder> | --dashboards <runs-root>\n');
    process.exit(2);
  }
}

module.exports = {
  NOT_RECORDED,
  aggregateReports,
  loadReportsFromDir,
  metricsToMarkdown,
  aggregateCaseRecords,
  caseRecordsToMarkdown,
};
