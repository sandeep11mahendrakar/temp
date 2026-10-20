'use strict';

// Deterministic three-case reviewer sample per archived run; never edits archives.
// Usage: node tools/spotcheck.js <runs-dir> [seed]
const fs = require('node:fs');
const path = require('node:path');

function rng(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an unsigned 32-bit integer');
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 0x100000000; };
}
function csvCell(value) { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${path.basename(file)}: ${error.message}`); }
}
function makeSheet(runsDir, seed = 32) {
  const random = rng(seed);
  const rows = [['run_id', 'site', 'run_label', 'sample_class', 'tc_id', 'evid_paths', 'verdict', 'source_report', 'human_verdict', 'human_notes']];
  const dirs = fs.readdirSync(runsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const folderId of dirs) {
    const dir = path.join(runsDir, folderId);
    const manifestFile = path.join(dir, 'manifest.json'); const reportFile = path.join(dir, 'report.json');
    if (!fs.existsSync(manifestFile) || !fs.existsSync(reportFile)) throw new Error(`${folderId}: manifest.json and report.json required`);
    const manifest = readJson(manifestFile); const report = readJson(reportFile);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error(`${folderId}: manifest root must be an object`);
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error(`${folderId}: report root must be an object`);
    if (manifest.run_id !== folderId) throw new Error(`${folderId}: manifest.run_id must match archive folder`);
    if (typeof manifest.site !== 'string' || !manifest.site.trim() || manifest.site === 'NOT_RECORDED') throw new Error(`${folderId}: recorded manifest.site required`);
    if (!Array.isArray(report.cases)) throw new Error(`${folderId}: report.cases must be an array`);
    if (report.cases.length < 3) throw new Error(`${folderId}: 3 test cases required for human spot-check; found ${report.cases.length}`);
    const cases = report.cases.slice();
    for (let i = cases.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [cases[i], cases[j]] = [cases[j], cases[i]]; }
    const sourceReport = path.relative(process.cwd(), reportFile).replace(/\\/g, '/');
    for (const c of cases.slice(0, 3)) {
      if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.id !== 'string' || !c.id.trim()) throw new Error(`${folderId}: selected case requires recorded id`);
      if (!Array.isArray(c.evid_paths) || c.evid_paths.length === 0 || c.evid_paths.some((p) => typeof p !== 'string' || !p.trim())) throw new Error(`${folderId}/${c.id}: selected case requires non-empty evid_paths string[]`);
      rows.push([manifest.run_id, manifest.site, manifest.label || 'NOT_RECORDED', report.sample_class || 'NOT_RECORDED',
        c.id, JSON.stringify(c.evid_paths), c.verdict || 'NOT_RECORDED', sourceReport, '', '']);
    }
  }
  if (dirs.length === 0) throw new Error('no archived run directories found');
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

if (require.main === module) {
  try {
    const folder = process.argv[2]; const rawSeed = process.argv[3] === undefined ? '32' : process.argv[3];
    const seed = Number(rawSeed);
    if (!folder) throw new Error('usage: node tools/spotcheck.js <runs-dir> [seed]');
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be an unsigned 32-bit integer');
    const output = path.resolve('docs/SPOTCHECK.csv');
    if (fs.existsSync(output)) throw new Error('refuse overwrite: docs/SPOTCHECK.csv');
    const csv = makeSheet(path.resolve(folder), seed);
    fs.writeFileSync(output, csv, { encoding: 'utf8', flag: 'wx' });
    console.log(`SPOTCHECK ${path.relative(process.cwd(), output).replace(/\\/g, '/')} sampled=${csv.trimEnd().split(/\r?\n/).length - 1} seed=${seed} human_verdicts=blank`);
  } catch (error) { console.error(`SPOTCHECK-ERROR ${error.message}`); process.exitCode = 2; }
}
module.exports = { makeSheet };
