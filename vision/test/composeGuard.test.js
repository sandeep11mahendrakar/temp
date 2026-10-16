'use strict';

// F-B compose-guard regression (numeric): composeFinalStatus() pure rule.
// Oracle-unsat fails a ladder PASS; zero-step PASS fails (baseline
// mandatory, no trivial pass); oracle never promotes; OBSERVED untouched.
// CONTROL tests pin the no-change paths. No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { composeFinalStatus } = require('../src/executeTests');

const STEPS = [{ ok: true }, { ok: true }];

test('F-B oracle FAIL flips ladder PASS to FAIL with reason', () => {
  assert.deepEqual(
    composeFinalStatus({ ladderStatus: 'PASS', oracleVerdict: 'FAIL', stepsExecuted: STEPS }),
    { status: 'FAIL', forced: true, reason: 'oracle unsatisfied' });
});

test('F-B zero steps flips PASS to FAIL (baseline mandatory)', () => {
  assert.deepEqual(
    composeFinalStatus({ ladderStatus: 'PASS', oracleVerdict: 'PASS', stepsExecuted: [] }),
    { status: 'FAIL', forced: true, reason: 'no baseline actuation: zero steps executed' });
});

test('F-B CONTROL ladder FAIL stays FAIL untouched', () => {
  assert.deepEqual(
    composeFinalStatus({ ladderStatus: 'FAIL', oracleVerdict: 'PASS', stepsExecuted: STEPS }),
    { status: 'FAIL', forced: false, reason: null });
});

test('F-B CONTROL happy path PASS+PASS+steps stays PASS unforced', () => {
  assert.deepEqual(
    composeFinalStatus({ ladderStatus: 'PASS', oracleVerdict: 'PASS', stepsExecuted: STEPS }),
    { status: 'PASS', forced: false, reason: null });
});

test('F-B CONTROL OBSERVED never promotes and never fails', () => {
  assert.deepEqual(
    composeFinalStatus({ ladderStatus: 'PASS', oracleVerdict: 'OBSERVED', stepsExecuted: STEPS }),
    { status: 'PASS', forced: false, reason: null });
});

test('F-B CONTROL missing oracle verdict holds PASS (null-safe)', () => {
  assert.deepEqual(
    composeFinalStatus({ ladderStatus: 'PASS', stepsExecuted: STEPS }),
    { status: 'PASS', forced: false, reason: null });
});
