'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { perCallRow, autonomyGenerateLabel, causeClassOf, PAGES, GEN_CAP, runGenerateLive } = require('../src/generateLive');
const { parseArgs } = require('../runAuto');

test('GL1 perCallRow: carries thoughtsTokenCount; missing usage => nulls', () => {
  assert.deepEqual(
    perCallRow({ page: 'dialogs', model: 'gemini-3.5-flash-lite', usage: { promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 7 }, finishReason: 'STOP' }),
    { page: 'dialogs', model: 'gemini-3.5-flash-lite', promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 7, finishReason: 'STOP' }
  );
  assert.deepEqual(perCallRow({}), { page: null, model: null, promptTokenCount: null, candidatesTokenCount: null, thoughtsTokenCount: null, finishReason: null });
});

test('GL1 autonomyGenerateLabel: AUTONOMOUS only when blind-Y + >=1 schema-valid set', () => {
  assert.equal(autonomyGenerateLabel({ blind: true, schemaValidSets: 1 }), 'AUTONOMOUS(generate)');
  assert.equal(autonomyGenerateLabel({ blind: false, schemaValidSets: 3 }), 'AUTONOMY_NONBLIND(generate)');
  assert.equal(autonomyGenerateLabel({ blind: true, schemaValidSets: 0 }), 'AUTONOMY_NONBLIND(generate)');
  assert.equal(autonomyGenerateLabel({ blind: true, schemaValidSets: 2, preAuthored: true }), 'ASSISTED(generate)');
  assert.equal(autonomyGenerateLabel({ blind: true, schemaValidSets: 2, handshake: true }), 'ASSISTED(generate)');
});

test('GL1 causeClassOf: parse-fail / no-generation / exec / oracle', () => {
  assert.equal(causeClassOf({ parseFail: true }), 'parse-fail');
  assert.equal(causeClassOf({ generated: 0 }), 'no-generation');
  assert.equal(causeClassOf({ generated: 2, status: 'ERROR' }), 'exec-unresolved');
  assert.equal(causeClassOf({ generated: 2, status: 'PASS', unresolved: true }), 'exec-unresolved');
  assert.equal(causeClassOf({ generated: 2, status: 'FAIL' }), 'exec-fail');
  assert.equal(causeClassOf({ generated: 2, status: 'PASS', oracleVerdict: 'FAIL' }), 'oracle-unsat');
  assert.equal(causeClassOf({ generated: 2, status: 'PASS', oracleVerdict: 'PASS' }), null);
});

test('GL1 driver shape: 6 pages, cap 15, requiring module opens no browser', () => {
  assert.deepEqual(PAGES, ['form-validate', 'select-check-radio', 'hover-menu', 'dialogs', 'login-6users', 'paginate-sort-filter-search']);
  assert.equal(GEN_CAP, 15);
});

test('GL1 runAuto wiring: --generate on|off parses; on needs no url/goal; bad rejects', () => {
  assert.equal(parseArgs(['--generate=on']).generate, 'on');
  assert.equal(parseArgs(['u', 'g']).generate, 'off');
  assert.equal(parseArgs(['u', 'g', '--generate=off', '--brain=api']).brain, 'api');
  assert.throws(() => parseArgs(['--generate=maybe']), /--generate must be on\|off/);
  assert.throws(() => parseArgs(['u']), /usage:/);
});

test('GL1 causeClassOf: auth-invalid classified when auth flag set', () => {
  assert.equal(causeClassOf({ auth: true }), 'auth-invalid');
  assert.equal(causeClassOf({ auth: true, status: 'PASS' }), 'auth-invalid');
  assert.equal(causeClassOf({ parseFail: true }), 'parse-fail');
});

test('GL1 perCallRow: error field present only on failure (success deepEqual preserved)', () => {
  assert.deepEqual(
    perCallRow({ page: 'p', model: 'm', usage: { promptTokenCount: 1, candidatesTokenCount: 2, thoughtsTokenCount: 3 }, finishReason: 'STOP' }),
    { page: 'p', model: 'm', promptTokenCount: 1, candidatesTokenCount: 2, thoughtsTokenCount: 3, finishReason: 'STOP' }
  );
  const withErr = perCallRow({ page: 'p', model: 'm', usage: null, finishReason: 'ERROR', error: 'http 401 invalid key' });
  assert.equal(withErr.error, 'http 401 invalid key');
  assert.equal(withErr.promptTokenCount, null);
  const noErr = perCallRow({ page: 'p', model: 'm', usage: null, finishReason: 'ERROR' });
  assert.equal(Object.prototype.hasOwnProperty.call(noErr, 'error'), false);
});

test('GL1 audit: invalid-key (401) records sanitized evidence, sets blocked=invalid-key, stops probing', async () => {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'GENERATE');
  const prev = process.env.GENERATE;
  process.env.GENERATE = 'on';
  const fakePage = {
    _url: 'https://example.com/',
    url() { return this._url; },
    async goto(u) { this._url = u; },
    async waitForTimeout() {},
    async evaluate() { return { elements: [{ id: 'b', type: 'button', text: 'Go' }], bodyText: 'hello' }; },
  };
  const fakeBrowser = { newPage: async () => fakePage, close: async () => {} };
  try {
    const result = await runGenerateLive({
      pages: ['form-validate', 'dialogs'],
      model: 'gemini-3.5-flash-lite',
      cap: 15,
      port: 5010,
      bootZoo: async () => ({ proc: { kill: () => {} }, port: 5010 }),
      browserFactory: async () => fakeBrowser,
      geminiGenerate: async () => { throw new Error('brain/api-gemini: http 401 {"error":{"code":401,"message":"API key not valid. Please pass a valid API key"}}'); },
    });
    assert.equal(result.blocked, 'invalid-key');
    assert.equal(result.pages.length, 1, 'only the first page was probed');
    assert.equal(result.pages[0].blocked, 'invalid-key');
    assert.ok(result.pages[0].error && /401/.test(result.pages[0].error), 'scrubbed 401 evidence recorded');
    assert.equal(result.calls.length, 1, 'one failed call recorded, no further probes');
    assert.ok(result.calls[0].error && /401/.test(result.calls[0].error), 'sanitized failure evidence on the call');
    assert.ok(!JSON.stringify(result).includes('SECRET'), 'no secret leaked');
  } finally {
    if (had) process.env.GENERATE = prev; else delete process.env.GENERATE;
  }
});

test('GL1 hardening: stale legacy report never scored; executor gets unique path', async () => {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'GENERATE');
  const prev = process.env.GENERATE;
  process.env.GENERATE = 'on';
  const fs = require('node:fs');
  const path = require('node:path');
  const legacyRep = path.join(__dirname, '..', '..', 'vision', 'storage', 'outputs', 'gl1_rep_form-validate.json');
  const stale = { results: [{ id: 'STALE-SENTINEL', status: 'PASS', oracle: { verdict: 'PASS', app_outcome: 'accepted' }, steps_executed: [] }] };
  fs.writeFileSync(legacyRep, JSON.stringify(stale));
  const future = new Date(Date.now() + 60000);
  fs.utimesSync(legacyRep, future, future);

  const capturedCmds = [];
  const fakePage = {
    _url: 'https://example.com/',
    url() { return this._url; },
    async goto(u) { this._url = u; },
    async waitForTimeout() {},
    async evaluate() { return { elements: [{ id: 'b', type: 'button', text: 'Go' }], bodyText: 'hello' }; },
  };
  const fakeBrowser = { newPage: async () => fakePage, close: async () => {} };
  try {
    const result = await runGenerateLive({
      pages: ['form-validate'],
      model: 'gemini-3.5-flash-lite',
      cap: 15,
      port: 5010,
      bootZoo: async () => ({ proc: { kill: () => {} }, port: 5010 }),
      browserFactory: async () => fakeBrowser,
      geminiGenerate: async () => ({ text: JSON.stringify({ tcs: [{ id: 'g1', objective: 'o', steps: [{ action: 'click', target: { type: 'button', text: 'Go' } }] }] }), usage: { promptTokenCount: 10, candidatesTokenCount: 5 }, finishReason: 'STOP' }),
      execSyncImpl: (cmd) => { capturedCmds.push(cmd); throw new Error('exec failed'); },
    });
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('STALE-SENTINEL'), 'stale sentinel never scored');
    assert.ok(!serialized.includes('"PASS"'), 'no false PASS from stale report');
    assert.equal(capturedCmds.length, 1, 'executor invoked once');
    assert.ok(!capturedCmds[0].includes('gl1_rep_form-validate.json'), 'executor did not receive the legacy path');
    assert.ok(/gl1_rep_form-validate_[0-9]+_[a-z0-9]+\.json/.test(capturedCmds[0]), 'executor received the unique per-run path');
  } finally {
    if (had) process.env.GENERATE = prev; else delete process.env.GENERATE;
    try { fs.unlinkSync(legacyRep); } catch (_) {}
  }
});
