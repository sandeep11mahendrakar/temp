'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate } = require('./preflight');

test('unknown URLs fail closed and do not claim a runtime block probe', () => {
  const result = evaluate('https://unknown.example');
  assert.equal(result.decision, 'NO-GO');
  assert.equal(result.block_class, 'NOT_RECORDED');
});

test('third-party requires explicit permit while stop-list remains NO-GO', () => {
  const sites = [
    { id: 'third-demo', url: 'https://third.example', access: 'third_party', notes: '' },
    { id: 'goodreads', url: 'https://www.goodreads.com', access: 'third_party', notes: 'STOP-LIST' },
  ];
  assert.equal(evaluate('https://third.example', { sites }).decision, 'NO-GO');
  assert.equal(evaluate('https://third.example', { sites, permitted: true }).decision, 'GO');
  assert.equal(evaluate('https://www.goodreads.com', { sites, permitted: true }).decision, 'NO-GO');
});

test('block detector findings fail closed and output makes no interaction', () => {
  const result = evaluate('https://open.example', {
    sites: [{ id: 'open-demo', url: 'https://open.example', access: 'open', notes: '' }],
    snapshot: { title: 'Checking your browser', status: 200, bodyText: 'Cloudflare captcha' },
  });
  assert.equal(result.decision, 'NO-GO');
  assert.equal(result.block_class, 'bot_challenge');
  assert.deepEqual([result.navigated, result.clicked, result.filled], [false, false, false]);
});
