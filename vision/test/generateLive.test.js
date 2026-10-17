'use strict';

// GL1 (D37) offline tests: live-driver pure helpers + runAuto --generate wiring.
// No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { perCallRow, autonomyGenerateLabel, causeClassOf, PAGES, GEN_CAP } = require('../src/generateLive');
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

// GL1 audit (independent) regression tests:
test('GL1 causeClassOf: auth-invalid classified when auth flag set', () => {
  assert.equal(causeClassOf({ auth: true }), 'auth-invalid');
  assert.equal(causeClassOf({ auth: true, status: 'PASS' }), 'auth-invalid'); // auth wins
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
