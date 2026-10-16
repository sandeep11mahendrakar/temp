'use strict';

// F-E shadow-pierce tests (mock-only, duck-typed DOM fakes): parse, walk,
// center, candidate, assist-never-throws, dom_assist tag. No browser.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  splitPierce, pierceQueryNode, rectCenter, pierceCandidate, tryShadowPierce, domAssistTag,
} = require('../src/executeTests');

function fakeEl({ rect = { x: 10, y: 20, width: 100, height: 40 }, shadow = null, text = '' } = {}) {
  return {
    shadowRoot: shadow,
    innerText: text,
    tagName: 'INPUT',
    getBoundingClientRect: () => ({ ...rect }),
  };
}

function fakeRoot(map) {
  return { querySelector: (sel) => map[sel] || null };
}

// 1. splitPierce: multi-segment parses, single/plain/null do not.
test('F-E parse: >>> splits, plain selectors return null', () => {
  assert.deepEqual(splitPierce('#zoo-login>>>#shadow-user'), ['#zoo-login', '#shadow-user']);
  assert.deepEqual(splitPierce('a >>> b >>> c'), ['a', 'b', 'c']);
  assert.equal(splitPierce('#plain'), null);
  assert.equal(splitPierce(''), null);
  assert.equal(splitPierce(null), null);
});

// 2. walk: open shadow root pierces; closed (no shadowRoot) stops.
test('F-E walk: open shadow pierces, closed root returns null', () => {
  const inner = fakeEl({ text: 'User' });
  const host = fakeEl({ shadow: fakeRoot({ '#shadow-user': inner }) });
  const root = fakeRoot({ '#zoo-login': host });
  assert.equal(pierceQueryNode(root, ['#zoo-login', '#shadow-user']), inner);
  const closedHost = fakeEl({ shadow: null });
  assert.equal(pierceQueryNode(fakeRoot({ '#zoo-login': closedHost }), ['#zoo-login', '#shadow-user']), null);
  assert.equal(pierceQueryNode(root, ['#zoo-login', '#nope']), null);
});

// 3. rectCenter: center math exact; zero-area element is null.
test('F-E center: midpoint math, zero-area null', () => {
  assert.deepEqual(rectCenter(fakeEl()), { x: 60, y: 40 });
  assert.equal(rectCenter(fakeEl({ rect: { x: 0, y: 0, width: 0, height: 0 } })), null);
  assert.equal(rectCenter(null), null);
});

// 4. candidate: >>> text wins; plain steps decline without calling evaluate.
test('F-E candidate: >>> text selected, plain steps decline', async () => {
  let calls = 0;
  const noCall = async () => { calls += 1; return { x: 1, y: 2 }; };
  const step = { action: 'fill', target: { type: 'text_input', text: 'zoo-login>>>#shadow-user' } };
  assert.equal(pierceCandidate(step), 'zoo-login>>>#shadow-user');
  const r = await tryShadowPierce(noCall, { action: 'click', target: { type: 'button', text: 'Go' } });
  assert.equal(r, null);
  assert.equal(calls, 0);
});

// 5. assist: stub hit resolves coords; stub null/throw declines, never throws.
test('F-E assist: hit coords pass, miss/throw decline silently', async () => {
  const step = { action: 'fill', target: { type: 'text_input', text: '#a>>>#b' } };
  const hit = await tryShadowPierce(async () => ({ x: 60, y: 40 }), step);
  assert.deepEqual(hit, { x: 60, y: 40 });
  assert.equal(await tryShadowPierce(async () => null, step), null);
  assert.equal(await tryShadowPierce(async () => { throw new Error('no page'); }, step), null);
  assert.equal(await tryShadowPierce(null, step), null);
});

// 6. tag: pierced resolutions carry shadow-pierce + click_by_vision N.
test('F-E tag: pierced => shadow-pierce/N; prior paths unchanged', () => {
  assert.deepEqual(domAssistTag({ pierced: true }), { dom_assist: 'shadow-pierce', click_by_vision: 'N' });
  assert.deepEqual(domAssistTag({ snapped: true, pierced: true }), { dom_assist: 'domsnap+shadow-pierce', click_by_vision: 'N' });
  assert.deepEqual(domAssistTag({}), { dom_assist: null, click_by_vision: 'Y' });
  assert.deepEqual(domAssistTag({ snapped: true }), { dom_assist: 'domsnap', click_by_vision: 'N' });
});
