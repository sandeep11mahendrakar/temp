'use strict';

// Z0 zoo-batch1: no-browser tests (zero-dep http client, real server boot).
// - server boots, index + 8 pages each return 200 with page markers.
// - each <page>.truth.json returns 200 and passes validateTruth.
// - pure functions (validateTruth, pickPort) + numeric assertions.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zoo = require('../zoo/server');

const MARKERS = {
  'form-validate': 'id="contact-form"',
  'select-check-radio': 'id="color-select"',
  'hover-menu': 'id="main-menu"',
  'dbl-right-click': 'id="dbl-btn"',
  'dialogs': 'id="alert-btn"',
  'new-tab': 'id="sample-link"',
  'iframe': 'id="zoo-frame"',
  'cart-checkout-wizard': 'id="step-cart"',
  // Z1 batch2.
  'drag-drop': 'id="drop-zone"',
  'upload-download': 'id="file-input"',
  'shadow-dom': 'id="zoo-login"',
  'infinite-scroll': 'id="feed"',
  'paginate-sort-filter-search': 'id="rows"',
  'login-6users': 'id="login-btn"',
  'cookie-banner': 'id="cookie-banner"',
  'spinner-delayed': 'id="spinner"',
};

function get(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, timeout: 5000, agent: false }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('Z0 zoo: server boots on 5010 (or next-free) + index lists 16 pages', async () => {
  const { server, port, pages } = await zoo.start({ port: 5010, nextFree: true });
  try {
    assert.ok(port >= 5010 && port < 5030, 'port in zoo range, got ' + port);
    assert.equal(pages.length, 16, 'batch1 8 + batch2 8 pages');
    const idx = await get(port, '/');
    assert.equal(idx.status, 200);
    for (const p of pages) assert.ok(idx.body.includes(`/` + p), 'index links ' + p);
  } finally { server.close(); }
});

test('Z0 zoo: each of the 16 pages returns 200 with its static marker', async () => {
  const { server, port } = await zoo.start({ port: 5010, nextFree: true });
  try {
    let n = 0;
    for (const [page, marker] of Object.entries(MARKERS)) {
      const r = await get(port, '/' + page);
      assert.equal(r.status, 200, page + ' status');
      assert.ok(r.body.includes(marker), page + ' marker present (MCP-perceivable static id)');
      n += 1;
    }
    assert.equal(n, 16, 'all 16 pages fetched');
  } finally { server.close(); }
});

test('Z0 zoo: each truth.json returns 200 and passes truth-schema validation', async () => {
  const { server, port } = await zoo.start({ port: 5010, nextFree: true });
  try {
    let n = 0;
    for (const page of zoo.PAGES) {
      const r = await get(port, `/${page}.truth.json`);
      assert.equal(r.status, 200, page + ' truth status');
      const doc = JSON.parse(r.body);
      assert.deepEqual(zoo.validateTruth(doc), [], page + ' truth valid');
      assert.ok(doc.expected && typeof doc.expected.kind === 'string');
      n += 1;
    }
    assert.equal(n, 16, 'all 16 truth files served+valid');
  } finally { server.close(); }
});

test('Z0 zoo pure: validateTruth rejects bad docs + pickPort is numeric', () => {
  assert.deepEqual(zoo.validateTruth(null), ['not-an-object']);
  assert.ok(zoo.validateTruth({ tc_id: 'x', steps: [], expected: { kind: 'k', expect: 'e' } }).includes('steps:empty'));
  assert.ok(zoo.validateTruth({ tc_id: 'x', steps: [1], expected: {} }).includes('expected.kind:missing'));
  assert.equal(zoo.pickPort(5010, new Set()), 5010);
  assert.equal(zoo.pickPort(5010, new Set([5010, 5011])), 5012);
  assert.ok(Number.isInteger(zoo.pickPort('5010', new Set([5010]))));
});
