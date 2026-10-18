'use strict';

// Offline, immutable R3 export preparation. This module never uploads data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validate } = require('./researchSchema');
const { buildEnvelope, payloadHash } = require('./r3DbContract');

const SENSITIVE_KEY = /(?:secret|api[_-]?key|authorization|password|cookie|service[_-]?role|token)/i;
const PROHIBITED = new RegExp(['service_role', 'sb_secret_', String.fromCharCode(101, 121, 74), 'AIza[0-9A-Za-z_-]{35}'].join('|'), 'i');
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const MANIFEST_KEYS = new Set(['run_id','site','url','head','dirty','model_provider','model_id','contract_hash','prompt_hash','browser','viewport','os','limits','seed','started','ended','label','brain','cost','per_call','experiment_kind','citable','aggregate_eligibility','artifacts','path','bytes','sha256','mode','role','blind','calls','tokens','screens','time']);
const REPORT_KEYS = new Set(['schema_version','experiment_kind','citable','aggregate_eligibility','sample_class','app_id','comparison_id','platform','stage','execution_outcome','integrity_verdict','supersedes_report','run','id','source','result','verdict','integrity','reasons','cases','case_id','app_outcome','tc_source','label','block','strength','evid_paths','cause','telemetry','duration_ms','calls','tokens','screens','objective','findings','anomalies','metrics','availability','value','status','started','ended','notes','evidence','path','content_utf8']);

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function failIfMarker(value) {
  if (typeof value === 'string') { if (PROHIBITED.test(value)) throw new Error('export rejected: prohibited credential marker'); return; }
  if (Array.isArray(value)) { for (const item of value) failIfMarker(item); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (PROHIBITED.test(key)) throw new Error('export rejected: prohibited credential marker'); failIfMarker(item); }
}
function safeUrl(value) {
  if (!/^https?:\/\//i.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('export rejected: invalid URL'); }
  if (url.username || url.password) throw new Error('export rejected: URL credentials');
  url.search = '';
  url.hash = '';
  return url.toString();
}
function sanitize(value, allowed, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitize(item, allowed, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [name, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(name) || !allowed.has(name)) continue;
      out[name] = sanitize(item, allowed, name);
    }
    return out;
  }
  if (typeof value === 'string') {
    if (/url$/i.test(key) || key === 'url') return safeUrl(value);
    if (/(?:path|file)$/i.test(key) && (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\'))) return path.basename(value);
  }
  return value;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function canonical(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }
function buildExport(runDir) {
  const dir = path.resolve(runDir);
  const checked = validate(dir);
  if (!checked.ok) throw new Error(`run rejected by schema: ${checked.errors.join('; ')}`);
  const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
  const reportBytes = fs.readFileSync(path.join(dir, 'report.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const report = JSON.parse(reportBytes.toString('utf8'));
  if (!ID.test(manifest.run_id || '') || report.run.id !== manifest.run_id) throw new Error('run rejected: manifest/report run_id mismatch');
  failIfMarker([manifest, report]);
  const sourceHashes = { manifest_sha256: sha256(manifestBytes), report_sha256: sha256(reportBytes) };
  const cleanManifest = sanitize(manifest, MANIFEST_KEYS);
  const cleanReport = sanitize(report, REPORT_KEYS);
  const envelope = buildEnvelope({ manifest: cleanManifest, report: cleanReport, ...sourceHashes });
  envelope.source_version = 'R3-1.0';
  envelope.payload_sha256 = payloadHash(envelope);
  return { envelope, source_hashes: sourceHashes, export_sha256: payloadHash(envelope), run_id: manifest.run_id };
}
function writeOutbox(runDir, outboxDir) {
  const result = buildExport(runDir);
  const destDir = path.resolve(outboxDir);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, `${result.run_id}.json`);
  const bytes = canonical(result.envelope);
  if (fs.existsSync(dest)) {
    const old = fs.readFileSync(dest, 'utf8');
    const prior = JSON.parse(old);
    if (prior.payload_sha256 === result.envelope.payload_sha256 && old === bytes) return { ...result, path: dest, duplicate: true };
    throw new Error('outbox conflict: same run_id has different sanitized payload');
  }
  fs.writeFileSync(dest, bytes, { encoding: 'utf8', flag: 'wx' });
  return { ...result, path: dest, duplicate: false };
}

module.exports = { buildExport, writeOutbox, sanitize, failIfMarker, canonical };

if (require.main === module) {
  try {
    const [runDir, outboxDir] = process.argv.slice(2);
    if (!runDir || !outboxDir) throw new Error('usage: node tools/r3DbExport.js <run-dir> <outbox-dir>');
    const result = writeOutbox(runDir, outboxDir);
    console.log(`EXPORT ${result.duplicate ? 'DUPLICATE' : 'CREATED'} run_id=${result.run_id} path=${path.basename(result.path)}`);
    console.log(`source_manifest_sha256=${result.source_hashes.manifest_sha256} source_report_sha256=${result.source_hashes.report_sha256}`);
    console.log(`export_sha256=${result.export_sha256}`);
  } catch (error) { console.error(`EXPORT-REFUSED ${error.message}`); process.exitCode = 1; }
}
