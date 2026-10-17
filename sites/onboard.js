'use strict';

// sites/onboard.js — S-2 site onboarding helper.
// Access-class + blockDetector preflight (READ-ONLY) + archetype detect stub +
// truth-probe stub, then writes sites/<slug>/site.json via siteLibrary.
//
// Usage:
//   node sites/onboard.js --id <slug> --url <url> [--access open|credentialed|third_party]
//                        [--source <path>] [--notes <text>] [--truth-ref <path>]
//                        [--dry-run] [--skip-preflight]
//
// Preflight does a single HTTP GET (no browser, no evasion) and runs
// blockDetector.classify on title/status/body. If the class is not 'ok' the
// site is still recorded but flagged BLOCKED(<class>) so the run driver can
// record an honest verdict. Archetype detect and truth-probe are stubs here
// (they need a vdom / playwright-direct probe) and are filled by A-4 / A-7.

const https = require('https');
const http = require('http');
const path = require('path');
const lib = require('../vision/src/siteLibrary');
const bd = require('../vision/src/blockDetector');

const ROOT = lib.repoRoot();
const DIR = path.join(ROOT, 'sites');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) { out[k] = true; } else { out[k] = nxt; i += 1; }
    } else { out._.push(a); }
  }
  return out;
}

function fail(msg) { process.stderr.write(`sites/onboard: ${msg}\n`); process.exitCode = 1; }

function fetchOnce(url, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (settled) return; settled = true; resolve(r); };
    const mod = url.startsWith('https') ? https : http;
    let req;
    try {
      req = mod.get(url, { headers: { 'user-agent': 'site-onboard-preflight/1.0' } }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { if (body.length < 4000) body += c; });
        res.on('end', () => done({ status: res.statusCode, title: null, body }));
      });
    } catch (e) { done({ error: e.message }); return; }
    req.on('error', (e) => done({ error: e.message }));
    req.setTimeout(timeoutMs || 15000, () => { try { req.destroy(); } catch (_) {} done({ error: 'timeout' }); });
  });
}

function titleFromHtml(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a.id) return fail('need --id <slug>');
  if (!a.url) return fail('need --url <url>');
  const access = a.access || 'open';
  if (!['open', 'credentialed', 'third_party'].includes(access)) return fail('access must be open|credentialed|third_party');

  let preflight = { class: 'unknown', confidence: null, signals: [], status: null, title: null, error: null };
  if (a['skip-preflight'] !== true) {
    const r = await fetchOnce(a.url, 15000);
    if (r.error) {
      preflight.error = r.error;
      preflight.class = 'unknown';
    } else {
      const title = titleFromHtml(r.body);
      const cls = bd.classify({ title, status: r.status, bodyText: r.body, ocrText: r.body });
      preflight = { class: cls.class, confidence: cls.confidence, signals: cls.signals, status: r.status, title };
    }
  }

  const archetypeDetect = { status: 'stub', note: 'needs vdom; filled by A-4' };
  const truthProbe = { status: 'stub', note: 'needs playwright-direct probe; filled by A-7' };

  const site = {
    id: a.id,
    url: a.url,
    access,
    cred_env: (a['cred-user-env'] || a['cred-pass-env'])
      ? { username: a['cred-user-env'] || null, password: a['cred-pass-env'] || null } : null,
    truth_ref: a['truth-ref'] || null,
    source: a.source || null,
    notes: (a.notes || null) + (preflight.class !== 'ok' ? ` [preflight=${preflight.class}]` : ''),
  };

  console.log(JSON.stringify({ preflight, archetypeDetect, truthProbe, site }, null, 2));

  if (a['dry-run']) {
    console.log('dry-run: not writing');
    return;
  }
  const r = lib.addSite(ROOT, DIR, site);
  if (!r.ok) return fail(`invalid: ${r.errors.join('; ')}`);
  console.log(JSON.stringify({ ok: true, id: r.id, index_count: r.index_count, preflight_class: preflight.class }));
}

main().catch((e) => { fail(e && e.message ? e.message : String(e)); });
