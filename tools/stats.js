'use strict';

// Research statistics from archived manifest.json + report.json only.
// Usage: node tools/stats.js <runs-dir>
const fs = require('node:fs');
const path = require('node:path');
const UNKNOWN = 'NOT_RECORDED';

function wilson(success, n, z = 1.96) {
  if (!Number.isFinite(success) || !Number.isFinite(n) || n <= 0 || success < 0 || success > n) return null;
  const p = success / n; const z2 = z * z; const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const margin = z * Math.sqrt((p * (1 - p) / n) + (z2 / (4 * n * n))) / den;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function sampleVariance(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + ((b - mean) ** 2), 0) / (values.length - 1);
}

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function normalize(value) { return typeof value === 'string' ? value.trim().toUpperCase() : ''; }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${path.relative(process.cwd(), file)}: ${error.message}`); }
}

function classifyRun(manifest, report) {
  const reasons = [];
  const sampleClass = normalize(report.sample_class);
  const runVerdict = normalize(report.result && report.result.verdict);
  if (normalize(manifest.label) === 'TRIAL' || sampleClass === 'TRIAL') reasons.push('TRIAL');
  if (sampleClass === 'CONTAMINATED' || runVerdict === 'CONTAMINATED' ||
      (Array.isArray(report.contamination) && report.contamination.length > 0)) reasons.push('CONTAMINATED');
  if (normalize(manifest.access) === 'THIRD_PARTY' || normalize(report.access) === 'THIRD_PARTY') reasons.push('THIRD_PARTY');
  return [...new Set(reasons)];
}

function collect(runsDir) {
  const groups = new Map(); const excluded = [];
  const ids = fs.readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const id of ids) {
    const dir = path.join(runsDir, id); const mp = path.join(dir, 'manifest.json'); const rp = path.join(dir, 'report.json');
    if (!fs.existsSync(mp) || !fs.existsSync(rp)) {
      excluded.push({ run_id: id, site: UNKNOWN, reasons: [!fs.existsSync(mp) ? 'manifest_missing' : 'report_missing'] });
      continue;
    }
    const manifest = readJson(mp); const report = readJson(rp);
    if (!isRecord(manifest) || !isRecord(report)) throw new Error(`${id}: manifest/report root must be objects`);
    const runId = typeof manifest.run_id === 'string' && manifest.run_id.trim() ? manifest.run_id : id;
    const site = typeof manifest.site === 'string' && manifest.site.trim() && manifest.site !== UNKNOWN ? manifest.site : UNKNOWN;
    const reasons = classifyRun(manifest, report);
    if (site === UNKNOWN) reasons.push('site_NOT_RECORDED');
    if (!Array.isArray(report.cases)) throw new Error(`${id}: report.cases must be an array`);
    const entry = { id: runId, site, manifest, report, cases: report.cases };
    if (reasons.length) {
      excluded.push({ run_id: runId, site, reasons: [...new Set(reasons)] });
      continue;
    }
    if (!groups.has(site)) groups.set(site, []);
    groups.get(site).push(entry);
  }
  return { groups, excluded };
}

function knownSum(runs, key) {
  const values = runs.map((run) => run.manifest.cost && run.manifest.cost[key]);
  return values.length && values.every((value) => Number.isFinite(value) && value >= 0)
    ? values.reduce((sum, value) => sum + value, 0) : null;
}

function mixFor(runs, selector) {
  const mix = {};
  for (const run of runs) for (const item of selector(run)) {
    const key = typeof item === 'string' && item.trim() ? item.trim() : UNKNOWN;
    mix[key] = (mix[key] || 0) + 1;
  }
  return mix;
}

function stats(runsDir) {
  const { groups, excluded } = collect(runsDir);
  const rows = [];
  for (const [site, runs] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const rates = []; let pass = 0; let fail = 0; let blocked = 0; let total = 0; let other = 0;
    let domAssistYes = 0; let domAssistN = 0;
    for (const run of runs) {
      let runPass = 0; let runFail = 0;
      for (const c of run.cases) {
        const verdict = normalize(c && c.verdict);
        if (verdict === 'PASS' || verdict.startsWith('PASS_WEAK')) { pass++; runPass++; }
        else if (verdict === 'FAIL' || verdict === 'REJECT') { fail++; runFail++; }
        else if (verdict === 'BLOCKED') blocked++;
        else other++;
        total++;
        if (c && typeof c.dom_assist === 'boolean') { domAssistN++; if (c.dom_assist) domAssistYes++; }
      }
      if (runPass + runFail) rates.push(runPass / (runPass + runFail));
    }
    const eligible = pass + fail;
    const strengthMix = mixFor(runs, (run) => run.cases.map((c) => c && c.verification_strength));
    rows.push({
      site, runs: runs.length, pass, fail, blocked, other, total, eligible,
      pass_rate: eligible ? pass / eligible : null, wilson95: wilson(pass, eligible),
      repeat_n: rates.length, repeat_variance: sampleVariance(rates), block_denominator: total,
      block_rate: total ? blocked / total : null,
      label_mix: mixFor(runs, (run) => [run.manifest.label]),
      verification_strength_mix: strengthMix,
      dom_assist_yes: domAssistN ? domAssistYes : null,
      dom_assist_n: domAssistN || null,
      dom_assist_rate: domAssistN ? domAssistYes / domAssistN : null,
      calls: knownSum(runs, 'calls'), tokens: knownSum(runs, 'tokens'),
      screens: knownSum(runs, 'screens'), time: knownSum(runs, 'time'),
    });
  }
  return { rows, excluded };
}

function fmt(value, digits = 4) { return value === null || value === undefined ? UNKNOWN : value.toFixed(digits); }
function fmtMix(mix) { return Object.keys(mix).sort().map((key) => `${key}:${mix[key]}`).join(',') || UNKNOWN; }

module.exports = { wilson, sampleVariance, collect, stats };
if (require.main === module) {
  try {
    const folder = process.argv[2];
    if (!folder) throw new Error('usage: node tools/stats.js <runs-dir>');
    const result = stats(path.resolve(folder));
    console.log('site | runs | pass | fail | blocked | other | total | eligible | pass_rate | Wilson95 | repeat_variance(n) | block_rate(blocked/total) | labels | strength | dom_assist(yes/n) | calls | tokens | screens | time');
    for (const r of result.rows) console.log(`${r.site} | ${r.runs} | ${r.pass} | ${r.fail} | ${r.blocked} | ${r.other} | ${r.total} | ${r.eligible} | ${fmt(r.pass_rate)} | ${r.wilson95 ? r.wilson95.map((x) => x.toFixed(4)).join('-') : UNKNOWN} | ${fmt(r.repeat_variance, 6)} (${r.repeat_n}) | ${fmt(r.block_rate)} (${r.blocked}/${r.block_denominator}) | ${fmtMix(r.label_mix)} | ${fmtMix(r.verification_strength_mix)} | ${r.dom_assist_yes === null ? UNKNOWN : `${r.dom_assist_yes}/${r.dom_assist_n}`} | ${r.calls ?? UNKNOWN} | ${r.tokens ?? UNKNOWN} | ${r.screens ?? UNKNOWN} | ${r.time ?? UNKNOWN}`);
    for (const e of result.excluded) console.log(`EXCLUDED ${e.run_id} | site=${e.site} | reason=${e.reasons.join(',')}`);
    console.log(`sites=${result.rows.length} excluded=${result.excluded.length} source=manifest.json+report.json performance_excludes=TRIAL,CONTAMINATED,THIRD_PARTY`);
  } catch (error) { console.error(`STATS-ERROR ${error.message}`); process.exitCode = 2; }
}
