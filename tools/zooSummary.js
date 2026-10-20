'use strict';

const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const resultsPath = path.resolve(arg('--results', 'vision/storage/outputs/g2z_results_v2.json'));
const controlsPath = path.resolve(arg('--controls', 'vision/storage/outputs/g2z_controls_v2.json'));
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const controls = JSON.parse(fs.readFileSync(controlsPath, 'utf8'));
const meta = results.meta || {};
const required = ['head', 'chunk_ids', 'started', 'ended', 'excluded_set'];
const missing = required.filter((key) => meta[key] === undefined || meta[key] === null || meta[key] === '');
if (missing.length) {
  console.error(`Z5 INVALID: metadata missing ${missing.join(',')}`);
  process.exit(2);
}

const rows = results.rows || [];
const excludedSet = new Set(meta.excluded_set.map((x) => typeof x === 'string' ? x : x.tc_id));
const excludedRows = rows.filter((r) => excludedSet.has(r.tc_id));
const rateable = rows.filter((r) => !excludedSet.has(r.tc_id));
const passes = rateable.filter((r) => r.verdict === 'PASS').length;
const denominator = rateable.length;
const rate = denominator ? passes / denominator : 0;
const controlRows = controls.rows || [];
const controlNotPass = controlRows.filter((r) => r.control_result === 'NOT-pass').length;
const failures = rows.filter((r) => r.verdict !== 'PASS');

console.log(`RESULTS=${path.relative(process.cwd(), resultsPath)} total=${rows.length}`);
console.log(`META head=${meta.head} chunks=${meta.chunk_ids.join(',')} started=${meta.started} ended=${meta.ended} excluded=${[...excludedSet].join(',')}`);
console.log(`Z-5=GATE-UNMET pass=${passes}/${denominator} rate=${(rate * 100).toFixed(2)}% controls=${controlNotPass}/${controlRows.length} NOT-pass`);
console.log(`FAIL_ROWS=${failures.length}`);
for (const row of failures) console.log(`${row.tc_id}\t${row.class}\t${row.cause}`);
console.log(`EXCLUDED_EXPECTED_BLOCKED=${excludedRows.map((r) => r.tc_id).join(',')}`);
console.log('Z-6=OPTIONAL PARKED (human decision; not started)');

if (rows.length !== 45 || denominator !== 44 || controlNotPass !== 45 || failures.length !== 10) {
  console.error(`Z5 INVALID COUNTS total=${rows.length} rateable=${denominator} controls=${controlNotPass}/${controlRows.length} failures=${failures.length}`);
  process.exitCode = 1;
}
