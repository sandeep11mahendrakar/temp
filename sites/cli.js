'use strict';

// sites/cli.js — S0 node CLI: add|get|list|link-run|validate.
// Usage examples:
//   node sites/cli.js add --id saucedemo --url https://www.saucedemo.com --access credentialed --source vision/saucedemo.regression.js
//   node sites/cli.js get --id saucedemo
//   node sites/cli.js list
//   node sites/cli.js link-run --site saucedemo --run-id r1 --evid docs/INDEX.md
//   node sites/cli.js validate [--write-index]

const path = require('path');
const lib = require('../vision/src/siteLibrary');

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
    } else {
      out._.push(a);
    }
  }
  return out;
}

function fail(msg) {
  process.stderr.write(`sites/cli: ${msg}\n`);
  process.exitCode = 1;
}

function main() {
  const a = args(process.argv.slice(2));
  const cmd = a._[0];
  if (cmd === 'add') {
    const obj = {
      id: a.id || null,
      url: a.url || null,
      access: a.access || null,
      cred_env: (a['cred-user-env'] || a['cred-pass-env'])
        ? { username: a['cred-user-env'] || null, password: a['cred-pass-env'] || null }
        : null,
      truth_ref: a['truth-ref'] || null,
      source: a.source || null,
      notes: a.notes || null,
    };
    const r = lib.addSite(ROOT, DIR, obj);
    if (!r.ok) return fail(`invalid: ${r.errors.join('; ')}`);
    console.log(JSON.stringify({ ok: true, id: r.id, index_count: r.index_count }));
  } else if (cmd === 'get') {
    if (!a.id) return fail('need --id');
    const r = lib.loadSite(DIR, a.id);
    if (!r.ok) return fail(r.error);
    console.log(JSON.stringify(r.site, null, 2));
  } else if (cmd === 'list') {
    const ids = lib.listSites(DIR);
    const sites = [];
    for (const id of ids) {
      const r = lib.loadSite(DIR, id);
      if (r.ok) sites.push(r.site);
    }
    console.log(JSON.stringify(lib.buildIndex(sites), null, 2));
  } else if (cmd === 'link-run') {
    if (!a.site) return fail('need --site');
    const r = lib.linkRun(ROOT, DIR, {
      site: a.site,
      runId: a['run-id'] || null,
      evid: a.evid || null,
      permitted: a.permitted === true || a.permitted === 'true',
    });
    if (r.refused) {
      process.stderr.write(`sites/cli: REFUSED ${r.reason}\n`);
      process.exitCode = 2;
      return;
    }
    if (!r.ok) return fail(r.error);
    console.log(JSON.stringify(r.record, null, 2));
  } else if (cmd === 'validate') {
    const rows = lib.validateAll(ROOT, DIR);
    const bad = rows.filter((x) => !x.ok);
    console.log(JSON.stringify({ ok: bad.length === 0, checked: rows.length, failed: bad.length, rows }, null, 2));
    if (a['write-index'] && bad.length === 0) {
      const sites = [];
      for (const id of lib.listSites(DIR)) {
        const r = lib.loadSite(DIR, id);
        if (r.ok) sites.push(r.site);
      }
      const idx = lib.writeIndex(DIR, sites);
      console.log(JSON.stringify({ index_written: true, count: idx.count }));
    }
    if (bad.length) process.exitCode = 1;
  } else {
    fail('want add|get|list|link-run|validate');
  }
}

main();
