'use strict';

// H1x detector-hook regression (numeric): explorer.stateBlock() is the pure
// post-perceive hook logic (captureState stores its result as state.block).
// Synthetic inputs only - no browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { stateBlock } = require('../src/explorer');

test('H1x stateBlock cf-like page => bot_challenge with numeric confidence', () => {
  const r = stateBlock({
    title: 'Attention Required! | Cloudflare',
    url: 'https://shop.example.com/',
    visibleText: 'Checking your browser before you access the site.',
  });
  assert.equal(r.class, 'bot_challenge');
  assert.equal(r.confidence, 0.85);
  assert.deepEqual(Object.keys(r).sort(), ['class', 'confidence']);
});

test('H1x stateBlock normal login => ok 0.6, never bot_challenge', () => {
  const r = stateBlock({
    title: 'Swag Labs',
    url: 'https://www.saucedemo.com/',
    visibleText: 'Swag Labs Username Password LOGIN',
  });
  assert.deepEqual(r, { class: 'ok', confidence: 0.6 });
});

test('H1x stateBlock empty text => blank_render 0.55', () => {
  const r = stateBlock({ title: '', url: 'https://x.example/', visibleText: '   ' });
  assert.deepEqual(r, { class: 'blank_render', confidence: 0.55 });
});

test('H1x stateBlock never throws; empty input reads as blank_render', () => {
  assert.deepEqual(stateBlock(), { class: 'blank_render', confidence: 0.55 });
  assert.deepEqual(stateBlock({ visibleText: null }), { class: 'blank_render', confidence: 0.55 });
});
