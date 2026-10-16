'use strict';

// F-D value-fixes verification pins (mock-only, zero src edits): prove the
// F-A gate resolves the V0-upload cause at unit level and fires on nothing
// else. Shadow cause is F-E scope (gate correctly returns null here).

const test = require('node:test');
const assert = require('node:assert/strict');

const { textPresentVerify } = require('../src/executeTests');

// V0-upload bodies modeled on the zoo page (short bodies, real transition).
const UPLOAD_PRE = 'Files\nUpload\nno file yet\nDownload sample';
const UPLOAD_POST = 'Files\nUpload\nuploaded: zoo-sample.txt\nDownload sample';

// 1. V0-upload delta: proven transition verifies despite short bodies.
test('F-D upload-delta: expected appears post => verifies (both <100ch)', () => {
  assert.ok(UPLOAD_PRE.length < 100 && UPLOAD_POST.length < 100);
  const r = textPresentVerify('uploaded: zoo-sample.txt', UPLOAD_PRE, UPLOAD_POST);
  assert.ok(r && r.method === 'text_present');
  assert.equal(typeof r.baseline_chars, 'number');
});

// 2. Control: pre-existing text never bypasses (no trivial pass).
test('F-D control-pre-existing: text present pre+post => null', () => {
  assert.equal(textPresentVerify('uploaded: zoo-sample.txt', UPLOAD_POST, UPLOAD_POST), null);
});

// 3. Control: empty/missing expectation never verifies.
test('F-D control-empty: blank expected => null', () => {
  assert.equal(textPresentVerify('', UPLOAD_PRE, UPLOAD_POST), null);
  assert.equal(textPresentVerify(null, UPLOAD_PRE, UPLOAD_POST), null);
});

// 4. Control: unrelated post text never verifies.
test('F-D control-unrelated: expected absent post => null', () => {
  assert.equal(textPresentVerify('uploaded: zoo-sample.txt', UPLOAD_PRE, 'Files\nUpload\nno file yet'), null);
});

// 5. Shadow scope-pin: shadow expectation never appears in light-DOM bodies
// => gate returns null (shadow stays unresolved; F-E owns the pierce).
test('F-D shadow-scope: shadow text absent from light bodies => null', () => {
  const lightPre = 'Shadow lab\nUser\nGo\nouter: waiting';
  const lightPost = 'Shadow lab\nUser\nGo\nouter: waiting';
  assert.equal(textPresentVerify('shadow says: Ada', lightPre, lightPost), null);
});
