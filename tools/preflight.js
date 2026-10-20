'use strict';

// Offline policy preflight. It never navigates, clicks, or fills a page.
// Usage: node tools/preflight.js <url|site-id|list.txt> [--permitted] [--snapshot page.json]
const fs = require('node:fs');
const path = require('node:path');
const siteLibrary = require('../vision/src/siteLibrary');
const blockDetector = require('../vision/src/blockDetector');
const ROOT = path.resolve(__dirname, '..');
const SITES = path.join(ROOT, 'sites');
const STOP = new Set(['stackoverflow', 'imdb', 'goodreads', 'npmjs', 'reddit', 'magento', 'opencart']);

function hostname(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}
function registry() {
  return siteLibrary.listSites(SITES).map((id) => siteLibrary.loadSite(SITES, id)).filter((x) => x.ok).map((x) => x.site);
}
function matchSite(input, sites) {
  const host = hostname(input);
  return sites.find((s) => s.id === input || (host && hostname(s.url) === host)) || null;
}
function evaluate(input, opts = {}) {
  const site = matchSite(input, opts.sites || registry());
  if (!site) return { input, site: 'NOT_RECORDED', access: 'NOT_RECORDED', block_class: 'NOT_RECORDED', decision: 'NO-GO', reason: 'not in site library; no page probe performed' };
  const block = opts.snapshot ? blockDetector.classify(opts.snapshot) : null;
  const blocked = block && block.class !== 'ok';
  const policyStop = STOP.has(site.id) || /stop-list|blocked/i.test(String(site.notes || ''));
  const access = site.access || 'NOT_RECORDED';
  const permitted = opts.permitted === true;
  let reason = 'registry access permits; runtime page not probed';
  let decision = 'GO';
  if (policyStop) { decision = 'NO-GO'; reason = 'project stop-list applies'; }
  else if (access === 'third_party' && !permitted) { decision = 'NO-GO'; reason = 'third_party requires --permitted'; }
  else if (access === 'credentialed') { decision = 'NO-GO'; reason = 'credentialed site requires a separate human-approved credential gate'; }
  else if (access !== 'open' && access !== 'third_party') { decision = 'NO-GO'; reason = 'unsupported/missing access class'; }
  else if (blocked) { decision = 'NO-GO'; reason = `blockDetector=${block.class}`; }
  return { input, site: site.id, access, block_class: block ? block.class : 'NOT_RECORDED', decision, reason,
    read_only: true, navigated: false, clicked: false, filled: false };
}
function readInputs(arg) {
  const resolved = path.resolve(ROOT, arg);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return fs.readFileSync(resolved, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [arg];
}
module.exports = { evaluate, registry, matchSite, STOP };

if (require.main === module) {
  try {
    const argv = process.argv.slice(2);
    const input = argv.find((x) => !x.startsWith('--'));
    const snapIndex = argv.indexOf('--snapshot');
    if (!input) throw new Error('usage: node tools/preflight.js <url|site-id|list.txt> [--permitted] [--snapshot page.json]');
    const snapshot = snapIndex >= 0 ? JSON.parse(fs.readFileSync(path.resolve(ROOT, argv[snapIndex + 1]), 'utf8')) : null;
    const permitted = argv.includes('--permitted');
    for (const item of readInputs(input)) {
      const result = evaluate(item, { permitted, snapshot });
      console.log(`${result.decision} ${result.site} access=${result.access} block=${result.block_class} reason=${result.reason} read_only=true`);
    }
  } catch (error) { console.error(`PREFLIGHT-ERROR ${error.message}`); process.exitCode = 1; }
}
