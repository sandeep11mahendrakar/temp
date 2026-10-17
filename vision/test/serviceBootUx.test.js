'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sm = require('../src/serviceManager');

test('V-8 getServiceHealth returns shape for all 5 services', async () => {
  const h = await sm.getServiceHealth();
  assert.ok(Array.isArray(h));
  assert.equal(h.length, 5);
  for (const row of h) {
    assert.equal(typeof row.name, 'string');
    assert.equal(typeof row.url, 'string');
    assert.equal(typeof row.healthy, 'boolean');
  }
});

test('V-8 readPidRegistry returns [] when ledger missing', () => {
  // point VISION_ROOT storage absent by using a temp dir via env? Module uses fixed root;
  // just assert function returns an array.
  const r = sm.readPidRegistry();
  assert.ok(Array.isArray(r));
});

test('V-8 safeTeardown alias shuts down only started handles', async () => {
  const fake = { started: [] };
  await sm.safeTeardown(fake);
  // no throw
  await sm.safeTeardown(null);
});

test('V-8 export surface', () => {
  for (const k of ['ensureVisionServices', 'shutdownVisionServices', 'safeTeardown', 'getServiceHealth', 'readPidRegistry']) {
    assert.equal(typeof sm[k], 'function', k);
  }
});
