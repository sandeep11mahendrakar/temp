'use strict';

/**
 * siteLibrary.js — S0 site library (lane: vision/src/siteLibrary.js).
 *
 * Curated site registry for vision runs. Per-site files live in sites/<id>.json;
 * sites/sites.index.json is GENERATED (never hand-edited) by add/validate.
 * Unknown fields are null (never invented); credentials are ENV NAMES only
 * (never values); truth_ref is a repo-relative path that must exist on disk
 * when non-null. runAuto integration (refuse wiring) is S1-PARKED, not here:
 * the refuse policy lives in linkRun/canLaunch so runAuto.js stays untouched.
 */

const fs = require('fs');
const path = require('path');

const ACCESS = ['open', 'credentialed', 'third_party'];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ENV_RE = /^[A-Z][A-Z0-9_]{2,}$/;
const SECRET_RE = /AIza[0-9A-Za-z_-]{35}|password=|key=/;

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function siteFile(dir, id) {
  return path.join(dir, `${id}.json`);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listSites(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'sites.index.json')
    .map((f) => f.slice(0, -5))
    .sort();
}

function loadSite(dir, id) {
  const p = siteFile(dir, id);
  if (!fs.existsSync(p)) return { ok: false, error: `site not found: ${id}` };
  try {
    return { ok: true, site: readJson(p) };
  } catch (e) {
    return { ok: false, error: `site ${id} unparseable: ${e.message}` };
  }
}

function checkNoSecrets(site) {
  const blob = JSON.stringify(site);
  const m = blob.match(SECRET_RE);
  return m ? `secret-pattern hit: ${m[0].slice(0, 12)}...` : null;
}

function checkCredEnv(credEnv) {
  if (credEnv === null || credEnv === undefined) return null;
  if (typeof credEnv !== 'object' || Array.isArray(credEnv)) return 'cred_env must be null or {username,password}';
  for (const k of ['username', 'password']) {
    const v = credEnv[k];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'string' || !ENV_RE.test(v)) return `cred_env.${k} must be an ENV NAME (e.g. SAUCEDEMO_USER), never a value`;
  }
  return null;
}

// validateSite: required-fields + access-enum + truth_ref-exists + no-secrets.
function validateSite(root, site) {
  const errors = [];
  if (!site || typeof site !== 'object' || Array.isArray(site)) return { ok: false, errors: ['site must be an object'] };
  if (typeof site.id !== 'string' || !ID_RE.test(site.id)) errors.push('required: id ^[a-z0-9-]{1,64}$');
  if (typeof site.url !== 'string' || !/^https?:\/\/.+\..+/.test(site.url)) errors.push('required: url http(s)');
  if (typeof site.access !== 'string') {
    errors.push('required: access');
  } else if (!ACCESS.includes(site.access)) {
    errors.push(`access must be one of ${ACCESS.join('|')}`);
  }
  if (site.truth_ref !== null && site.truth_ref !== undefined) {
    if (typeof site.truth_ref !== 'string' || !site.truth_ref) {
      errors.push('truth_ref must be a repo-relative path or null');
    } else {
      const abs = path.resolve(root, site.truth_ref);
      const rel = path.relative(root, abs);
      if (rel.startsWith('..') || path.isAbsolute(site.truth_ref) && !abs.startsWith(root)) {
        errors.push('truth_ref must stay inside the repo');
      } else if (!fs.existsSync(abs)) {
        errors.push(`truth_ref missing on disk: ${site.truth_ref}`);
      }
    }
  }
  const ce = checkCredEnv(site.cred_env);
  if (ce) errors.push(ce);
  const sec = checkNoSecrets(site);
  if (sec) errors.push(sec);
  return { ok: errors.length === 0, errors };
}

function validateAll(root, dir) {
  const out = [];
  for (const id of listSites(dir)) {
    const r = loadSite(dir, id);
    if (!r.ok) { out.push({ id, ok: false, errors: [r.error] }); continue; }
    const v = validateSite(root, r.site);
    out.push({ id, ok: v.ok, errors: v.errors });
  }
  return out;
}

function buildIndex(sites) {
  return {
    schema: 'sites-index-v1',
    generated_at: new Date().toISOString(),
    count: sites.length,
    sites: sites.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

function writeIndex(dir, sites) {
  const idx = buildIndex(sites);
  fs.writeFileSync(path.join(dir, 'sites.index.json'), JSON.stringify(idx, null, 2) + '\n', 'utf8');
  return idx;
}

function addSite(root, dir, obj) {
  const v = validateSite(root, obj);
  if (!v.ok) return { ok: false, errors: v.errors };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(siteFile(dir, obj.id), JSON.stringify(obj, null, 2) + '\n', 'utf8');
  const sites = [];
  for (const id of listSites(dir)) {
    const r = loadSite(dir, id);
    if (r.ok) sites.push(r.site);
  }
  const idx = writeIndex(dir, sites);
  return { ok: true, id: obj.id, index_count: idx.count };
}

// Refuse policy (S1 wires runAuto.js to this; S0 keeps runAuto untouched):
// access=third_party launches are REFUSED unless explicitly permitted, and both
// refusals and permitted runs are appended to sites/runs.log (audit trail).
function appendRunLog(dir, entry) {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'runs.log'), JSON.stringify(entry) + '\n', 'utf8');
}

function canLaunch(site, permitted) {
  if (!site) return { ok: false, refused: true, reason: 'unknown site' };
  if (site.access === 'third_party' && !permitted) {
    return { ok: false, refused: true, reason: 'refuse access=third_party without --permitted (logged)' };
  }
  return { ok: true, refused: false };
}

// linkRun records a run against a site. The record carries MCP-compatible
// evidence slots (mcp.perceive / mcp.act, null until an MCP run attaches).
function linkRun(root, dir, opts) {
  const o = (opts && typeof opts === 'object' ? opts : {});
  const r = loadSite(dir, o.site);
  if (!r.ok) return { ok: false, error: r.error };
  const v = validateSite(root, r.site);
  if (!v.ok) return { ok: false, error: `site invalid: ${v.errors.join('; ')}` };
  const gate = canLaunch(r.site, o.permitted === true);
  const entry = {
    ts: new Date().toISOString(),
    site: r.site.id,
    run_id: o.runId || null,
    access: r.site.access,
    permitted: o.permitted === true,
    refused: gate.refused,
    reason: gate.ok ? null : gate.reason,
  };
  appendRunLog(dir, entry);
  if (!gate.ok) return { ok: false, refused: true, reason: gate.reason };
  if (!o.runId) return { ok: false, error: 'runId required' };
  const evid = o.evid || null;
  const abs = evid ? path.resolve(root, evid) : null;
  const record = {
    schema: 'site-run-link-v1',
    site: r.site.id,
    run_id: o.runId,
    access: r.site.access,
    permitted: o.permitted === true,
    evid_path: evid,
    evid_exists: abs ? fs.existsSync(abs) : null,
    mcp: { perceive: null, act: null },
    ts: entry.ts,
  };
  const runsDir = path.join(dir, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(path.join(runsDir, `${o.runId}.json`), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { ok: true, record };
}

module.exports = {
  ACCESS,
  repoRoot,
  listSites,
  loadSite,
  validateSite,
  validateAll,
  buildIndex,
  writeIndex,
  addSite,
  canLaunch,
  linkRun,
};
