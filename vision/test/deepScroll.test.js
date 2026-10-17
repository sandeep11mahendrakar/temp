'use strict';

// X-F2 scroll-86ch regression (numeric): deepScroll() bounded repeated
// target-aware scroll + evidence signals (scroll_position / count_delta).
// CONTROL pins no-scroll=>no-signal (the caller then FAILs) and never throws.
// No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');

const { deepScroll, SIGNAL_RANKS } = require('../src/executeTests');

function fakePage(queue) {
  const q = queue.slice();
  return {
    evaluate: async () => {
      const v = q.length ? q.shift() : null;
      if (v instanceof Error) throw v;
      return v;
    },
    waitForTimeout: async () => {},
  };
}
const round = (b, a) => ({ before: b, after: a });

test('X-F2 growing content yields scroll_position + count_delta', async () => {
  const p = fakePage([
    round({ y: 0, top: 0, count: 10 }, { y: 0, top: 180, count: 20 }),
    round({ y: 0, top: 180, count: 20 }, { y: 0, top: 360, count: 30 }),
    round({ y: 0, top: 360, count: 30 }, { y: 0, top: 360, count: 30 }),
  ]);
  const sig = await deepScroll(p, { action: 'scroll', target: { type: 'input', text: 'feed' } });
  const methods = sig.map((s) => s.method);
  assert.deepEqual(methods, ['scroll_position', 'count_delta']);
  assert.ok(sig[1].detail.includes('10->30'));
});

test('X-F2 CONTROL no movement => [] (caller owns the FAIL)', async () => {
  const p = fakePage([round({ y: 0, top: 0, count: 10 }, { y: 0, top: 0, count: 10 })]);
  assert.deepEqual(await deepScroll(p, { action: 'scroll', target: { type: 'input', text: 'feed' } }), []);
});

test('X-F2 CONTROL evaluate throwing => [], never throws', async () => {
  const p = fakePage([new Error('no page')]);
  await assert.doesNotReject(() => deepScroll(p, { action: 'scroll', target: { type: 'input', text: 'feed' } }));
  assert.deepEqual(await deepScroll(p, { action: 'scroll', target: { type: 'input', text: 'feed' } }), []);
});

test('X-F2 window-only scroll => scroll_position without count_delta', async () => {
  const p = fakePage([
    round({ y: 0, top: 0, count: 10 }, { y: 50, top: 100, count: 10 }),
    round({ y: 50, top: 100, count: 10 }, { y: 50, top: 100, count: 10 }),
  ]);
  const sig = await deepScroll(p, { action: 'scroll', target: { type: 'input', text: 'feed' } });
  assert.deepEqual(sig.map((s) => s.method), ['scroll_position']);
});

test('X-F2 count_delta is a STRONG-ranked signal', () => {
  assert.equal(SIGNAL_RANKS.count_delta, 3);
  assert.equal(SIGNAL_RANKS.scroll_position, 2);
});

test('X-F2b mechanism: scrolls the target AND dispatches a scroll event', async () => {
  const events = [];
  const target = {
    id: 'feed', scrollTop: 0, scrollHeight: 500, clientHeight: 200, textContent: '',
    getAttribute: () => null, dispatchEvent: (ev) => { events.push(ev.type); return true; },
  };
  const stub = {
    document: {
      getElementById: (id) => (id === 'feed' ? target : null),
      querySelectorAll: () => [target],
      scrollingElement: target,
      body: { scrollHeight: 1000 },
    },
    window: { scrollY: 0, scrollTo: () => {} },
    Event: class { constructor(type) { this.type = type; } },
  };
  const page = {
    evaluate: async (fn, arg) => {
      const prev = { document: global.document, window: global.window, Event: global.Event };
      Object.assign(global, stub);
      try { return fn(arg); } finally { Object.assign(global, prev); }
    },
    waitForTimeout: async () => {},
  };
  const sig = await deepScroll(page, { action: 'scroll', target: { type: 'input', text: 'feed' } });
  assert.ok(events.includes('scroll'), 'a scroll event was dispatched on the target');
  assert.equal(target.scrollTop, 500, 'target scrolled to its scrollHeight');
  assert.deepEqual(sig.map((s) => s.method), ['scroll_position']);
});
