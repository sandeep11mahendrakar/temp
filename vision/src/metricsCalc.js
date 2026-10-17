'use strict';

// metricsCalc.js — R-3 aggregate metrics calculator (read-only over report JSONs).
// Pure, no I/O dependencies beyond node:fs for the directory loader. Never
// estimates missing numbers (null stays null; counts stay 0).

const fs = require('node:fs');
const path = require('node:path');

function num(n, fb = 0) { return Number.isFinite(n) ? n : fb; }

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

if (require.main === module) {
  const a = process.argv.slice(2);
  let dir = null;
  for (let i = 0; i < a.length; i++) if (a[i] === '--dir') { dir = a[i + 1]; i += 1; }
  if (!dir) { process.stderr.write('usage: node metricsCalc.js --dir <folder>\n'); process.exit(2); }
  const reports = loadReportsFromDir(dir);
  const m = aggregateReports(reports);
  process.stdout.write(JSON.stringify(m, null, 2) + '\n');
}

module.exports = { aggregateReports, loadReportsFromDir, metricsToMarkdown };
