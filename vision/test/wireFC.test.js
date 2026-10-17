'use strict';

// O2 wire-FC regression: the F-C collector evidence (dialogs[]/popups[]) is
// carried into the oracle obs, so the exact zoo conformance case shape (truth
// expected_text + collector evidence) judges honestly. Pure oracle.js + the
// F-C builder + a static carriage pin on executeTests.js. No browser.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { verdictFor } = require('../src/oracle');
const { dialogSignal, newPageSignal } = require('../src/executeTests');

const truth = (name) => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'zoo', 'truth', `${name}.truth.json`), 'utf8')
);

// 1. expect+3: dialogs/new-tab/dbl each reach PASS with the collector evidence
//    shape (exactly as conformance.js passes expected_text from the truth).
test('O2 expect+3: dbl / dialogs / new-tab oracle PASS with collected evidence', () => {
  const dbl = truth('dbl-right-click');
  assert.equal(verdictFor({ expected_text: dbl.expected.expect },
    { pageText: 'Click lab\nYou have done a double click' }).verdict, 'PASS');

  const dl = truth('dialogs');
  const sig = dialogSignal('alert', 'zoo alert: hello');
  assert.ok(sig);
  assert.equal(verdictFor({ expected_text: dl.expected.expect },
    { dialogs: [{ type: 'alert', message: 'zoo alert: hello' }] }).verdict, 'PASS');

  const nt = truth('new-tab');
  assert.ok(newPageSignal('http://127.0.0.1:5010/new-tab-target'));
  assert.equal(verdictFor({ expected_text: nt.expected.expect },
    { popups: ['http://127.0.0.1:5010/new-tab-target'] }).verdict, 'PASS');
});

// 2. CONTROL: absent evidence for dialogs/new-tab => never PASS (no weakening).
test('O2 CONTROL: no dialogs[]/popups[] evidence => not-satisfied', () => {
  const dl = truth('dialogs');
  assert.notEqual(verdictFor({ expected_text: dl.expected.expect },
    { pageText: 'Dialogs page body only' }).verdict, 'PASS');
  const nt = truth('new-tab');
  assert.notEqual(verdictFor({ expected_text: nt.expected.expect },
    { pageText: 'Windows page body only' }).verdict, 'PASS');
});

// 3. Static carriage pin: executeTests must keep wiring the F-C evidence into
//    the oracle obs call (guards against a future refactor dropping it).
test('O2 carriage pin: executeTests wires dialogs/popups into verdictFor obs', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'executeTests.js'), 'utf8');
  assert.match(src, /dialogs:\s*seenDialogs/);
  assert.match(src, /popups:\s*seenPages/);
  assert.match(src, /verdictFor\(testCase,\s*\{/);
});
