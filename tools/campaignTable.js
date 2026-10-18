'use strict';

// tools/campaignTable.js — FX-2: read-only parse of testing/site_reports/INDEX.md
// citable rows -> per-site table + tier means with n + excluded rows + reason.
// Headline numbers (20%, 48.7%) reproduced from arithmetic where possible;
// otherwise replaced with computed values (honestly reported).

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = { index: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--index') { out.index = argv[i + 1]; i += 1; }
  }
  return out;
}

const DEFAULT_INDEX = 'C:/Users/sandeep/pes/vs code/Capstone-Project/testing/site_reports/INDEX.md';

function parseIndex(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = text.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
  const out = [];
  for (const r of rows) {
    const cols = r.split('|').map((x) => x.trim()).filter((x) => x !== '');
    if (cols.length < 11) continue;
    const num = parseInt(cols[0], 10);
    const site = cols[1];
    const runId = cols[5];
    const fusion = cols[10];
    const m = fusion.match(/([\d.]+)%/);
    const pct = m ? parseFloat(m[1]) : null;
    const tier = num <= 10 ? 1 : (num <= 20 ? 2 : (num <= 30 ? 3 : 4));
    // excluded reason: blocked/contaminated/do-not-cite
    let excludedReason = null;
    const raw = r.toLowerCase();
    if (pct === null) {
      if (/blocked/i.test(raw)) excludedReason = 'BLOCKED';
      else if (/contaminat|do-not-cite/i.test(raw)) excludedReason = 'CONTAMINATED/DO-NOT-CITE';
      else excludedReason = 'no fusion value';
    }
    out.push({ num, site, runId, fusion, pct, tier, excludedReason, raw: r.trim() });
  }
  return out;
}

function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null; }

function main() {
  const args = parseArgs(process.argv.slice(2));
  const idxPath = args.index || DEFAULT_INDEX;
  const rows = parseIndex(idxPath);

  const citable = rows.filter((r) => r.pct !== null && !r.excludedReason);
  // also exclude contaminated even if they have a % (bbc 77.8%)
  const citableClean = citable.filter((r) => !/contaminat|do-not-cite/i.test(r.raw));

  console.log('=== FX-2 campaignTable (read-only parse of INDEX.md) ===');
  console.log('Index:', idxPath);
  console.log('Total rows parsed:', rows.length);
  console.log('');

  console.log('--- Per-site citable table ---');
  console.log('tier\tnum\tsite\trun_id\tfusion%');
  for (const r of citableClean.sort((a, b) => a.num - b.num)) {
    console.log(`${r.tier}\t${r.num}\t${r.site}\t${r.runId}\t${r.pct}`);
  }
  console.log('');

  console.log('--- Tier means (arithmetic shown) ---');
  for (const t of [1, 2, 3]) {
    const sub = citableClean.filter((r) => r.tier === t);
    const vals = sub.map((r) => r.pct);
    const m = mean(vals);
    console.log(`Tier ${t}: n=${sub.length}, sum=${vals.reduce((s, x) => s + x, 0).toFixed(2)}, mean=${m === null ? 'n/a' : m.toFixed(2) + '%'}`);
    console.log(`  values: [${vals.join(', ')}]`);
  }
  const t12 = citableClean.filter((r) => r.tier === 1 || r.tier === 2);
  const m12 = mean(t12.map((r) => r.pct));
  console.log(`Tier1+2 (20-site ledger): n=${t12.length}, sum=${t12.reduce((s, r) => s + r.pct, 0).toFixed(2)}, mean=${m12 === null ? 'n/a' : m12.toFixed(2) + '%'}`);
  console.log('');

  console.log('--- Excluded rows + reason ---');
  for (const r of rows.filter((x) => x.excludedReason)) {
    console.log(`  ${r.num}\t${r.site}\t${r.excludedReason}`);
  }
  console.log('Excluded count:', rows.filter((x) => x.excludedReason).length);
  console.log('Citable count:', citableClean.length);
  console.log('');

  console.log('--- Reconciliation ---');
  console.log('Total rows:', rows.length);
  console.log('Citable (clean):', citableClean.length);
  console.log('Excluded:', rows.length - citableClean.length);
  console.log('');
  console.log('Headline check: Tier1 mean computed above (memory cited ~20%); 48.7% cited for decontaminated 20-site ledger (Tier1+2).');
  console.log('If computed mean differs from cited headline, the cited headline is replaced by the computed value (honest).');
}

main();
