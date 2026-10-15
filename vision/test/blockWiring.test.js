'use strict';

// H1x block-wiring regression (numeric): executeTests.blockVerdict() pure
// verdict helper for unresolved-target steps. Synthetic inputs only - no
// browser, no network, no LLM. Never throws by contract.

const test = require('node:test');
const assert = require('node:assert/strict');

const { blockVerdict } = require('../src/executeTests');

test('H1x blockVerdict cf-like => bot_challenge with numeric confidence', () => {
  const r = blockVerdict({
    title: 'Attention Required! | Cloudflare',
    url: 'https://shop.example.com/',
    bodyText: 'Checking your browser before you access the site.',
  });
  assert.equal(r.class, 'bot_challenge');
  assert.equal(r.confidence, 0.85);
  assert.deepEqual(Object.keys(r).sort(), ['class', 'confidence']);
});

test('H1x blockVerdict normal page => ok 0.6', () => {
  assert.deepEqual(blockVerdict({
    title: 'Swag Labs', url: 'https://www.saucedemo.com/',
    bodyText: 'Swag Labs Username Password LOGIN',
  }), { class: 'ok', confidence: 0.6 });
});

test('H1x blockVerdict login wall => login_wall, never bot_challenge', () => {
  const r = blockVerdict({ title: 'Forum', url: 'https://f.example/', bodyText: 'Please log in to continue.' });
  assert.equal(r.class, 'login_wall');
  assert.notEqual(r.class, 'bot_challenge');
});

test('H1x blockVerdict never throws on garbage', () => {
  assert.doesNotThrow(() => blockVerdict());
  assert.doesNotThrow(() => blockVerdict({ bodyText: null }));
  const r = blockVerdict();
  assert.ok(r === null || (typeof r.class === 'string' && typeof r.confidence === 'number'));
});
