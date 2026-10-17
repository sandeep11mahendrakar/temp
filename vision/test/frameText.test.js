'use strict';

// X-F1 iframe-32ch regression (numeric): frameAwareText() + the text_present
// path. Capture must include CHILD-FRAME innerText so an expectation inside an
// iframe is seen. CONTROL pins no-trivial-pass: text present pre (including in
// a child frame) never bypasses. No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { frameAwareText, textPresentVerify } = require('../src/executeTests');

function fakeFrame(text, opts = {}) {
  return { evaluate: async () => { if (opts.throws) throw new Error('frame unreadable'); return text; } };
}
function fakePage(mainText) {
  const p = { evaluate: async () => mainText };
  return p;
}
function withFrames(mainText, frames) {
  const p = { evaluate: async () => mainText, frames: () => [fakeFrame(mainText)].concat(frames) };
  return p;
}

test('X-F1 top + child frame innerText are both captured', async () => {
  const p = withFrames('Framed content outer page ready', [fakeFrame('frame says hello')]);
  const t = await frameAwareText(p);
  assert.ok(t.includes('Framed content'));
  assert.ok(t.includes('frame says hello'));
});

test('X-F1 no frames() falls back to the page evaluate (main document only)', async () => {
  const t = await frameAwareText(fakePage('only main text'));
  assert.equal(t, 'only main text');
});

test('X-F1 CONTROL unreadable frame contributes nothing and never throws', async () => {
  const p = withFrames('main', [fakeFrame('secret', { throws: true }), fakeFrame('visible')]);
  await assert.doesNotReject(() => frameAwareText(p));
  const t = await frameAwareText(p);
  assert.ok(t.includes('main'));
  assert.ok(t.includes('visible'));
  assert.ok(!t.includes('secret'));
});

test('X-F1 cap bounds the joined text', async () => {
  const p = withFrames('m'.repeat(5000), []);
  const t = await frameAwareText(p, { cap: 100 });
  assert.equal(t.length, 100);
});

test('X-F1 null page => empty string, never throws', async () => {
  assert.equal(await frameAwareText(null), '');
});

test('X-F1 control: frame text present PRE => no bypass (no trivial pass)', () => {
  const frameText = 'Framed content\nframe says hello\nouter page ready';
  assert.equal(textPresentVerify('frame says hello', frameText, frameText), null);
});

test('X-F1 control: frame text appears only POST => text_present fires', () => {
  const pre = 'Framed content\nouter page ready';
  const post = 'Framed content\nouter page ready\nframe says hello';
  const r = textPresentVerify('frame says hello', pre, post);
  assert.equal(r.method, 'text_present');
});
