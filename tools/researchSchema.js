'use strict';

// Generate and validate research-run summaries from archive manifest + report.
// Usage: node tools/researchSchema.js generate <run-dir>
//        node tools/researchSchema.js validate <run-dir>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const REQUIRED = ['run_id', 'site', 'url', 'head', 'dirty', 'model_provider', 'model_id',
  'contract_hash', 'prompt_hash', 'browser', 'viewport', 'os', 'limits', 'seed', 'started', 'ended', 'label'];
const UNKNOWN = 'NOT_RECORDED';
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function isText(v) { return typeof v === 'string' && v.trim().length > 0; }
function isUnknownOrText(v) { return v === UNKNOWN || isText(v); }
function isUnknownOrCount(v) { return v === UNKNOWN || (Number.isFinite(v) && v >= 0); }
function isRecord(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function validate(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  const reportPath = path.join(dir, 'report.json');
  const errors = [];
  let m; let r; let manifestParsed = false; let reportParsed = false;
  try { m = readJson(manifestPath); manifestParsed = true; } catch (e) { errors.push(`manifest parse: ${e.message}`); }
  try { r = readJson(reportPath); reportParsed = true; } catch (e) { errors.push(`report parse: ${e.message}`); }
  if (manifestParsed && !isRecord(m)) errors.push('manifest root must be object');
  if (reportParsed && !isRecord(r)) errors.push('report root must be object');
  if (isRecord(m)) {
    for (const key of REQUIRED) if (!(key in m)) errors.push(`manifest missing slot: ${key}`);
    if (!isText(m.run_id) || m.run_id === UNKNOWN) errors.push('manifest run_id must be recorded text');
    for (const key of ['site', 'url', 'head', 'model_provider', 'model_id', 'contract_hash', 'prompt_hash', 'browser', 'os', 'started', 'ended', 'label']) {
      if (key in m && !isUnknownOrText(m[key])) errors.push(`manifest ${key} must be non-empty text or NOT_RECORDED`);
    }
    if ('dirty' in m && typeof m.dirty !== 'boolean' && m.dirty !== UNKNOWN) errors.push('manifest dirty must be boolean or NOT_RECORDED');
    for (const key of ['viewport', 'limits']) {
      const v = m[key];
      if (!(v === UNKNOWN || isText(v) || (v && typeof v === 'object' && !Array.isArray(v)))) errors.push(`manifest ${key} must be text/object or NOT_RECORDED`);
    }
    if ('seed' in m && !(m.seed === UNKNOWN || ['string', 'number', 'boolean'].includes(typeof m.seed))) errors.push('manifest seed must be scalar or NOT_RECORDED');
    for (const key of ['mode', 'role', 'blind']) if (!m.brain || !(key in m.brain)) errors.push(`manifest missing slot: brain.${key}`);
    for (const key of ['mode', 'role', 'blind']) if (m.brain && key in m.brain && !isUnknownOrText(m.brain[key])) errors.push(`manifest brain.${key} must be non-empty text or NOT_RECORDED`);
    for (const key of ['calls', 'tokens', 'screens', 'time']) if (!m.cost || !(key in m.cost)) errors.push(`manifest missing slot: cost.${key}`);
    if (m.cost) {
      for (const key of ['calls', 'screens', 'time']) if (key in m.cost && !isUnknownOrCount(m.cost[key])) errors.push(`cost.${key} must be a non-negative number or NOT_RECORDED`);
      if ('tokens' in m.cost && m.cost.tokens !== null && !isUnknownOrCount(m.cost.tokens)) errors.push('cost.tokens must be number/null/NOT_RECORDED');
    }
    if (!Array.isArray(m.artifacts)) errors.push('manifest artifacts must be an array');
    else for (const a of m.artifacts) {
      if (!a || typeof a !== 'object' || !isText(a.path) || !Number.isInteger(a.bytes) || a.bytes < 0 || typeof a.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256)) { errors.push('artifact entry requires path, non-negative bytes, and SHA-256'); continue; }
      const file = path.resolve(dir, a.path || '');
      if (!file.startsWith(path.resolve(dir) + path.sep) || !fs.existsSync(file)) { errors.push(`artifact missing/unsafe: ${a.path}`); continue; }
      if (fs.statSync(file).size !== a.bytes) errors.push(`artifact byte mismatch: ${a.path}`);
      if (hash(file) !== a.sha256) errors.push(`artifact sha256 mismatch: ${a.path}`);
    }
  }
  if (isRecord(r)) {
    if (!r.run || typeof r.run !== 'object' || !isText(r.run.id) || !Array.isArray(r.cases)) errors.push('report requires run.id and cases[]');
    for (const [i, c] of (r.cases || []).entries()) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`case[${i}] must be object`); continue; }
      for (const key of ['id', 'verdict', 'tc_source', 'label']) if (!isText(c[key])) errors.push(`case[${i}] ${key} must be non-empty text`);
      if (!Array.isArray(c.evid_paths) || c.evid_paths.length === 0 || c.evid_paths.some((p) => !isText(p))) errors.push(`case[${i}] evid_paths must be non-empty string[]`);
      if ('block' in c && c.block !== null && !isText(c.block)) errors.push(`case[${i}] block must be text or null`);
    }
  }
  return { ok: errors.length === 0, errors, manifest: m, report: r };
}
function summary(data, check) {
  const m = data.manifest || {};
  const r = data.report || {};
  const lines = ['# Research Run Summary', '', `- Run: ${m.run_id || UNKNOWN}`, `- Sample class: ${r.sample_class || UNKNOWN}`,
    `- Site: ${m.site ?? UNKNOWN} (${m.url ?? UNKNOWN})`, `- HEAD/dirty: ${m.head ?? UNKNOWN} / ${m.dirty ?? UNKNOWN}`,
    `- Model: ${m.model_provider || UNKNOWN}/${m.model_id || UNKNOWN}`, `- Contract/prompt: ${m.contract_hash || UNKNOWN} / ${m.prompt_hash || UNKNOWN}`,
    `- Browser/viewport/OS: ${m.browser || UNKNOWN} / ${m.viewport || UNKNOWN} / ${m.os || UNKNOWN}`,
    `- Limits/seed: ${JSON.stringify(m.limits ?? UNKNOWN)} / ${m.seed ?? UNKNOWN}`,
    `- Label/brain: ${m.label || UNKNOWN}; ${JSON.stringify(m.brain || UNKNOWN)}`,
    `- Cost: ${JSON.stringify(m.cost || UNKNOWN)}`, `- Per-call JSONL: ${m.per_call || UNKNOWN}`,
    `- Cases: ${(r.cases || []).length}`, '', '## Case rows', '', '| ID | Verdict | Source | Label | Block | Evidence paths |', '|---|---|---|---|---|---|'];
  for (const c of r.cases || []) lines.push(`| ${c.id} | ${c.verdict} | ${c.tc_source} | ${c.label} | ${c.block ?? UNKNOWN} | ${(c.evid_paths || []).join(', ') || UNKNOWN} |`);
  lines.push('', '## 17. Automated checklist', '', `- ${check.ok ? 'PASS' : 'FAIL'}: manifest/report parse and required slots`,
    `- ${check.ok ? 'PASS' : 'FAIL'}: report case schema`, `- ${check.ok ? 'PASS' : 'FAIL'}: artifact existence/bytes/SHA-256`);
  for (const error of check.errors) lines.push(`- FAIL: ${error}`);
  return `${lines.join('\n')}\n`;
}
function generate(dir) {
  const result = validate(dir);
  const md = summary(result, result);
  fs.writeFileSync(path.join(dir, 'summary.md'), md, 'utf8');
  return { ...result, summary: path.join(dir, 'summary.md') };
}
module.exports = { validate, summary, generate, REQUIRED };
if (require.main === module) {
  try {
    const [, , mode, folder] = process.argv;
    if (!['validate', 'generate'].includes(mode) || !folder) throw new Error('usage: researchSchema.js <validate|generate> <run-dir>');
    const dir = path.resolve(folder);
    const result = mode === 'generate' ? generate(dir) : validate(dir);
    for (const error of result.errors) console.log(`FAIL ${error}`);
    console.log(`${mode.toUpperCase()} ${result.ok ? 'PASS' : 'FAIL'} errors=${result.errors.length}${result.summary ? ` summary=${path.relative(process.cwd(), result.summary)}` : ''}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) { console.error(`SCHEMA-ERROR ${error.message}`); process.exitCode = 2; }
}
