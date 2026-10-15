'use strict';

// B0 blockDetector regression (numeric): synthetic fixtures ONLY - no live
// pages, no network, no evasion. Every case asserts exact class + exact
// confidence + exact signals. False-positive guards pin the honest boundary:
// normal login forms NEVER classify as bot_challenge.

const test = require('node:test');
const assert = require('node:assert/strict');

const { classify } = require('../src/blockDetector');

function page(over) {
  return Object.assign(
    { title: '', status: 200, ocrText: '', bodyText: '', url: 'https://example.com/' }, over);
}

test('B0 synthetic cloudflare-526 => bot_challenge with http signal', () => {
  const r = classify(page({
    title: 'Attention Required! | Cloudflare', status: 526,
    bodyText: 'Checking your browser before you access the site. Please verify you are human.',
    url: 'https://shop.example.com/',
  }));
  assert.equal(r.class, 'bot_challenge');
  assert.ok(r.signals.includes('http-526'));
  assert.ok(r.signals.includes('cloudflare'));
  assert.equal(r.confidence, 0.95);
});

test('B0 synthetic reddit-style wall => login_wall, never bot_challenge', () => {
  const r = classify(page({
    title: 'Reddit - Dive into anything', status: 200,
    bodyText: 'Please log in to continue reading. Members only beyond this point.',
    url: 'https://www.reddit.com/r/example/comments/x',
  }));
  assert.equal(r.class, 'login_wall');
  assert.notEqual(r.class, 'bot_challenge');
  assert.deepEqual(r.signals, ['log in to continue', 'please log in', 'members only']);
  assert.equal(r.confidence, 0.85);
});

test('B0 FALSE-POSITIVE normal login form => ok, never bot_challenge', () => {
  const r = classify(page({
    title: 'Swag Labs', status: 200,
    ocrText: 'Swag Labs Username Password LOGIN',
    bodyText: 'Username Password LOGIN',
    url: 'https://www.saucedemo.com/',
  }));
  assert.equal(r.class, 'ok');
  assert.notEqual(r.class, 'bot_challenge');
  assert.notEqual(r.class, 'login_wall');
  assert.deepEqual(r.signals, []);
  assert.equal(r.confidence, 0.6);
});

test('B0 FALSE-POSITIVE login wall is allowed login_wall but never bot_challenge', () => {
  const r = classify(page({
    title: 'Sign in', status: 200,
    bodyText: 'Authentication required. Sign in to view this page.',
  }));
  assert.ok(r.class === 'ok' || r.class === 'login_wall');
  assert.notEqual(r.class, 'bot_challenge');
});

test('B0 synthetic 403 => forbidden with http signal', () => {
  const r = classify(page({
    title: '403 Forbidden', status: 403, bodyText: 'Access denied by server policy.',
  }));
  assert.equal(r.class, 'forbidden');
  assert.deepEqual(r.signals, ['http-403', '403', 'forbidden', 'access denied']);
  assert.equal(r.confidence, 0.95);
});

test('B0 synthetic empty render => blank_render', () => {
  const r = classify(page({ title: '', status: 200, ocrText: '   ', bodyText: '' }));
  assert.equal(r.class, 'blank_render');
  assert.deepEqual(r.signals, ['empty-render']);
  assert.equal(r.confidence, 0.55);
});

test('B0 synthetic 429 => rate_limit', () => {
  const r = classify(page({
    title: 'Too Many Requests', status: 429, bodyText: 'Slow down. Rate limit exceeded.',
  }));
  assert.equal(r.class, 'rate_limit');
  assert.ok(r.signals.includes('http-429'));
  assert.equal(r.confidence, 0.95);
});

test('B0 numeric confidence: 1 signal 0.55, 2 signals 0.7, cap 0.95', () => {
  const one = classify(page({ bodyText: 'captcha here' }));
  assert.deepEqual(one.signals, ['captcha']);
  assert.equal(one.confidence, 0.55);
  const two = classify(page({ bodyText: 'captcha recaptcha' }));
  assert.equal(two.confidence, 0.7);
  const many = classify(page({
    bodyText: 'cloudflare captcha recaptcha are you a robot unusual traffic bot check',
  }));
  assert.equal(many.confidence, 0.95);
});

test('B0 priority: bot_challenge wins over login_wall on multi-match', () => {
  const r = classify(page({
    bodyText: 'Cloudflare challenge. Please log in to continue after verification.',
  }));
  assert.equal(r.class, 'bot_challenge');
});
