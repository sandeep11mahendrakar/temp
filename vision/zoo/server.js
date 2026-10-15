'use strict';

// vision/zoo/server.js — Z0 batch1 local test zoo (zero dependencies).
// Serves 8 deterministic pages + their <page>.truth.json files.
// Port: ZOO_PORT env or 5010; boot fails closed if occupied unless
// ZOO_NEXT_FREE=1 (B-port-conflict rule: take next free, record it).
// Pages are MCP-perceive-compatible: static ids, no canvas-only content,
// no external network, no randomness, no ads.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ZOO_DIR = __dirname;
const PAGES_DIR = path.join(ZOO_DIR, 'pages');
const TRUTH_DIR = path.join(ZOO_DIR, 'truth');

const PAGES = [
  'form-validate',
  'select-check-radio',
  'hover-menu',
  'dbl-right-click',
  'dialogs',
  'new-tab',
  'iframe',
  'cart-checkout-wizard',
  // Z1 batch2 (batch3 tabs/accordion/modal/toast/keyboard DO-NOT-START).
  'drag-drop',
  'upload-download',
  'shadow-dom',
  'infinite-scroll',
  'paginate-sort-filter-search',
  'login-6users',
  'cookie-banner',
  'spinner-delayed',
];

const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8' };

function truthFor(page) {
  const file = path.join(TRUTH_DIR, `${page}.truth.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Pure: validate one truth doc shape ({tc_id, steps[], expected{kind,expect}}).
// Returns violation strings (empty = valid). No I/O, no network.
function validateTruth(doc) {
  const bad = [];
  if (!doc || typeof doc !== 'object') return ['not-an-object'];
  if (typeof doc.tc_id !== 'string' || !doc.tc_id) bad.push('tc_id:missing');
  if (!Array.isArray(doc.steps) || doc.steps.length === 0) bad.push('steps:empty');
  const e = doc.expected;
  if (!e || typeof e !== 'object') bad.push('expected:missing');
  else {
    if (typeof e.kind !== 'string' || !e.kind) bad.push('expected.kind:missing');
    if (typeof e.expect !== 'string' || !e.expect) bad.push('expected.expect:missing');
  }
  return bad;
}

// Pure: pick a free port starting at base using a taken-set (test seam).
// Real boot below uses net probing instead; this helper is unit-tested.
function pickPort(base, taken) {
  let p = Number(base) || 5010;
  const has = (x) => (taken instanceof Set ? taken.has(x) : false);
  while (has(p)) p += 1;
  return p;
}

function freePort(base, maxTries = 20) {
  const net = require('node:net');
  return new Promise((resolve, reject) => {
    let p = Number(base) || 5010;
    let n = 0;
    const tryOne = () => {
      const srv = net.createServer();
      srv.once('error', () => {
        srv.close();
        p += 1;
        n += 1;
        if (n >= maxTries) reject(new Error(`zoo: no free port from ${base}`));
        else tryOne();
      });
      srv.once('listening', () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.listen(p, '127.0.0.1');
    };
    tryOne();
  });
}

function handler(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const name = url.pathname.replace(/^\/+|\/+$/g, '');
  if (name === '' || name === 'index') {
    const links = PAGES.map((p) => `<li><a id="link-${p}" href="/${p}">${p}</a></li>`).join('');
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end(`<!doctype html><html><head><title>zoo index</title></head><body><h1 id="zoo-title">zoo batch1</h1><ul>${links}</ul></body></html>`);
    return;
  }
  if (name === 'new-tab-target') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end('<!doctype html><html><head><title>zoo sample tab</title></head><body><h1 id="sample-title">sample tab ready</h1></body></html>');
    return;
  }
  if (PAGES.includes(name) && !url.pathname.endsWith('.truth.json')) {
    const file = path.join(PAGES_DIR, `${name}.html`);
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  const m = /^\/(.+)\.truth\.json$/.exec(url.pathname);
  if (m && PAGES.includes(m[1])) {
    const file = path.join(TRUTH_DIR, `${m[1]}.truth.json`);
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('zoo: not found');
}

async function start(opts = {}) {
  const base = Number(opts.port || process.env.ZOO_PORT || 5010);
  const allowNext = opts.nextFree === true || process.env.ZOO_NEXT_FREE === '1' || opts.port === 0;
  const port = opts.port === 0 ? await freePort(0) : (allowNext ? await freePort(base) : base);
  if (!allowNext && opts.port !== 0) {
    const probe = await freePort(base).catch(() => -1);
    if (probe !== base) throw new Error(`zoo: port ${base} occupied (set ZOO_NEXT_FREE=1 for next-free)`);
  }
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, port, pages: PAGES.slice() };
}

module.exports = { PAGES, validateTruth, pickPort, freePort, start };
