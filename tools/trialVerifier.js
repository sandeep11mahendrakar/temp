'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SECRET_MARKERS = [
  { name: 'service_role', re: /service_role/g },
  { name: 'sb_secret_', re: /sb_secret_/g },
  { name: 'eyJ', re: /eyJ/g },
  { name: 'AIza', re: /AIza[0-9A-Za-z_-]{35}/g },
];

function sha256Buffer(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function sha256File(file) { return sha256Buffer(fs.readFileSync(file)); }

function normalizeManifest(manifest) {
  if (Array.isArray(manifest)) return manifest.slice();
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest must be object or array');
  if (Array.isArray(manifest.runs)) return manifest.runs.slice();
  if (Array.isArray(manifest.rows)) return manifest.rows.slice();
  // single-run P-1 style manifest
  return [manifest];
}

function runCount(manifest) {
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest) && Number.isInteger(manifest.run_count)) {
    return manifest.run_count;
  }
  return normalizeManifest(manifest).length;
}

function dedupRows(rows) {
  const seen = new Set();
  const unique = [];
  let duplicates = 0;
  for (const r of rows) {
    const id = r && (r.run_id || r.runId || r.id);
    if (id == null) { unique.push(r); continue; }
    if (seen.has(id)) { duplicates += 1; continue; }
    seen.add(id);
    unique.push(r);
  }
  return { unique, duplicates };
}

function scanSecrets(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const counts = {};
  let total = 0;
  for (const m of SECRET_MARKERS) {
    const matches = text.match(m.re);
    const n = matches ? matches.length : 0;
    counts[m.name] = n;
    total += n;
  }
  return { counts, total };
}

function isBlockedOrPartial(v) {
  return typeof v === 'string' && /block|partial/i.test(v);
}
function isEligible(v) {
  return typeof v === 'string' && /eligible/i.test(v) && !isBlockedOrPartial(v);
}

function verify(input) {
  const manifest = input.manifest;
  const rows = Array.isArray(input.rows) ? input.rows.slice() : [];
  const runs = normalizeManifest(manifest);
  const expectedCount = runCount(manifest);
  const checks = [];

  // 1. identity + both hashes required and must match
  const hashMismatches = [];
  for (const run of runs) {
    const rid = run.run_id || run.runId || run.id;
    if (!rid) { hashMismatches.push({ run_id: null, reason: 'missing run_id in manifest' }); continue; }
    const row = rows.find((r) => (r.run_id || r.runId || r.id) === rid);
    if (!row) { hashMismatches.push({ run_id: rid, reason: 'no readback row' }); continue; }
    const manifestHash = run.sha256 || run.hash || run.target_sha256;
    const rowHash = row.sha256 || row.hash || row.target_sha256;
    if (!manifestHash) { hashMismatches.push({ run_id: rid, reason: 'missing manifest hash' }); continue; }
    if (!rowHash) { hashMismatches.push({ run_id: rid, reason: 'missing readback hash' }); continue; }
    if (!/^[0-9a-f]{64}$/i.test(String(manifestHash))) { hashMismatches.push({ run_id: rid, reason: 'invalid manifest hash format' }); continue; }
    if (!/^[0-9a-f]{64}$/i.test(String(rowHash))) { hashMismatches.push({ run_id: rid, reason: 'invalid readback hash format' }); continue; }
    if (manifestHash.toLowerCase() !== rowHash.toLowerCase()) {
      hashMismatches.push({ run_id: rid, reason: 'hash mismatch', manifest: manifestHash, row: rowHash });
      continue;
    }
    // app_id consistency when present
    if (run.app_id !== undefined || row.app_id !== undefined) {
      if (run.app_id !== row.app_id) hashMismatches.push({ run_id: rid, reason: 'app_id mismatch' });
    }
    const tf = run.target_file || row.target_file;
    if (!tf || typeof tf !== 'string' || !fs.existsSync(tf) || !fs.statSync(tf).isFile()) { hashMismatches.push({ run_id: rid, reason: 'missing or unreadable target file' }); continue; }
    const fileHash = sha256File(tf);
    if (fileHash.toLowerCase() !== manifestHash.toLowerCase()) hashMismatches.push({ run_id: rid, reason: 'file hash mismatch' });
  }
  const manifestIds = new Set(runs.map((r) => r.run_id || r.runId || r.id));
  // reject rows with missing identity, orphan rows, metadata mismatch
  for (const row of rows) {
    const rid = row.run_id || row.runId || row.id;
    if (!rid) { hashMismatches.push({ run_id: null, reason: 'missing run_id in readback row' }); continue; }
    if (!manifestIds.has(rid)) { hashMismatches.push({ run_id: rid, reason: 'orphan readback row' }); continue; }
    const run = runs.find((r) => (r.run_id || r.runId || r.id) === rid);
    const rh = row.sha256 || row.hash || row.target_sha256;
    if (!rh) hashMismatches.push({ run_id: rid, reason: 'missing readback hash' });
    else if (!/^[0-9a-f]{64}$/i.test(String(rh))) hashMismatches.push({ run_id: rid, reason: 'invalid readback hash format' });
    // metadata: symmetric ALL-field compare over union of keys (present on one side only = reject)
    const excluded = new Set(['sha256','hash','target_sha256','run_id','runId','id','eligibility','status','label']);
    const unionKeys = new Set([...Object.keys(run || {}), ...Object.keys(row || {})]);
    for (const key of unionKeys) {
      if (excluded.has(key)) continue;
      const inRun = Object.prototype.hasOwnProperty.call(run || {}, key);
      const inRow = Object.prototype.hasOwnProperty.call(row || {}, key);
      if (inRun !== inRow) { hashMismatches.push({ run_id: rid, reason: key + ' present on one side only' }); continue; }
      if (inRun && inRow && JSON.stringify(run[key]) !== JSON.stringify(row[key])) { hashMismatches.push({ run_id: rid, reason: key + ' metadata mismatch' }); }
    }
  }
  checks.push({ name: 'target_file_sha256_equals_manifest_row_hash', pass: hashMismatches.length === 0, detail: hashMismatches });

  // 2. readback row count equals manifest run count (raw rows)
  const countOk = rows.length === expectedCount;
  checks.push({ name: 'readback_row_count_equals_manifest_run_count', pass: countOk, detail: { readback: rows.length, manifest: expectedCount } });

  // 3. re-upload same run twice => 1 row: no duplicate run_ids allowed
  const ids = rows.map((r) => r.run_id || r.runId || r.id);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  const conflicting = [];
  const byId = new Map();
  for (const r of rows) {
    const id = r.run_id || r.runId || r.id;
    const h = r.sha256 || r.hash || r.target_sha256;
    if (byId.has(id) && byId.get(id) !== h) conflicting.push({ run_id: id, reason: 'conflicting hash for same run_id' });
    byId.set(id, h);
  }
  const duplicateOk = dupIds.length === 0 && conflicting.length === 0;
  checks.push({ name: 'duplicate_run_id_collapsed_to_one_row', pass: duplicateOk, detail: { duplicate_run_ids: dupIds, conflicting: conflicting } });

  // 4. eligibility excludes BLOCKED/partial rows from eligible pass
  const eligibilityViolations = [];
  for (const row of rows) {
    const elig = row.eligibility || row.status || row.label;
    if (isBlockedOrPartial(elig)) {
      if (row.eligible === true || row.pass === true) eligibilityViolations.push({ run_id: row.run_id || row.runId || row.id, reason: 'blocked/partial marked eligible' });
      if (Array.isArray(row.eligible_runs) && row.eligible_runs.includes(row.run_id || row.runId || row.id)) eligibilityViolations.push({ run_id: row.run_id || row.runId || row.id, reason: 'blocked/partial in eligible set' });
    }
  }
  // also check top-level eligible list if present
  const topEligible = input.eligible || input.eligible_runs || input.eligiblePass;
  if (Array.isArray(topEligible)) {
    for (const id of topEligible) {
      const row = rows.find((r) => (r.run_id || r.runId || r.id) === id);
      if (row) {
        const elig = row.eligibility || row.status || row.label;
        if (isBlockedOrPartial(elig)) eligibilityViolations.push({ run_id: id, reason: 'blocked/partial in top-level eligible set' });
      }
    }
  }
  checks.push({ name: 'eligibility_excludes_blocked_and_partial_rows', pass: eligibilityViolations.length === 0, detail: eligibilityViolations });

  // 5. payload scan for secret markers (counts only)
  const secretScan = scanSecrets({ manifest: runs, rows });
  const secretClean = secretScan.total === 0;
  checks.push({ name: 'payload_secret_scan_counts_only', pass: secretClean, detail: secretScan.counts });

  const ok = checks.every((c) => c.pass);
  return { ok, checks, secret_scan: secretScan.counts, secret_total: secretScan.total, counts: { runs: runs.length, readback_rows: rows.length, duplicate_run_ids: dupIds.length, conflicting: conflicting.length } };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('usage: node tools/trialVerifier.js <manifest.json> <rows.json> [eligible.json]');
    process.exitCode = 1;
    return;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
    const rows = JSON.parse(fs.readFileSync(path.resolve(args[1]), 'utf8'));
    const input = { manifest, rows };
    if (args[2]) {
      const extra = JSON.parse(fs.readFileSync(path.resolve(args[2]), 'utf8'));
      if (Array.isArray(extra)) input.eligible = extra;
      else Object.assign(input, extra);
    }
    const result = verify(input);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (err) {
    console.error(`VERIFY-ERROR ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { verify, normalizeManifest, runCount, dedupRows, scanSecrets, sha256File };

if (require.main === module) main();
