'use strict';

// F-C missing-signals regression (numeric): dialog/new-tab signal builders,
// SIGNAL_RANKS pins, regex-aware text_present fallback for mapping-limit
// expects. CONTROL tests pin honest-nulls. No browser, no network, no LLM.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { dialogSignal, newPageSignal, SIGNAL_RANKS, textPresentVerify } = require('../src/executeTests');

test('F-C dialogSignal builds exact signal; empty message stays null', () => {
  assert.deepEqual(dialogSignal('alert', 'zoo alert fired'),
    { method: 'dialog_message', detail: 'alert: zoo alert fired' });
  assert.equal(dialogSignal('confirm', '   '), null);
  assert.equal(dialogSignal('prompt', null), null);
  const long = dialogSignal('alert', 'm'.repeat(500));
  assert.equal(long.detail.length, 'alert: '.length + 200);
});

test('F-C newPageSignal blanks stay null; URL passes through capped', () => {
  assert.equal(newPageSignal(''), null);
  assert.equal(newPageSignal('about:blank'), null);
  assert.equal(newPageSignal(null), null);
  assert.deepEqual(newPageSignal('http://127.0.0.1:5010/new-tab-target'),
    { method: 'new_page_url', detail: 'http://127.0.0.1:5010/new-tab-target' });
});

test('F-C SIGNAL_RANKS pins new methods; legacy ranks frozen', () => {
  assert.deepEqual(SIGNAL_RANKS, {
    input_value: 3, checked_state: 3, new_page_url: 3, count_delta: 3,
    scroll_position: 2, visual_state_change: 2, dialog_message: 2,
  });
});

test('F-C regex expect matches post-only (dbl mapping-limit leg)', () => {
  const r = textPresentVerify('You have done a (double|right) click',
    'press the buttons below', 'You have done a double click');
  assert.equal(r.method, 'text_present');
});

test('F-C CONTROL regex expect present-pre => null (no trivial pass)', () => {
  assert.equal(textPresentVerify('You have done a (double|right) click',
    'You have done a double click already', 'You have done a double click again'), null);
});

test('F-C CONTROL invalid regex falls through silently, never throws', () => {
  assert.doesNotThrow(() => textPresentVerify('([broken', 'a', 'b c'));
  assert.equal(textPresentVerify('([broken', 'a', 'b c'), null);
});

test('F-C expect+3 pin: dialogs/new-tab/dbl truths carry expected', () => {
  const dir = path.join(__dirname, '..', 'zoo', 'truth');
  const expects = {
    'dialogs.truth.json': 'zoo (alert|confirm|prompt)',
    'new-tab.truth.json': 'new-tab-target',
    'dbl-right-click.truth.json': 'You have done a (double|right) click',
  };
  for (const [f, exp] of Object.entries(expects)) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.equal(t.expected.expect, exp, f);
  }
});
