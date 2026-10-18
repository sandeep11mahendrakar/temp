'use strict';
// V-5 verification signals regression (numeric): synthetic fixtures ONLY.
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveStepSignal } = require('../src/executeTests');

test('V-5 deriveStepSignal: fill input_value signal (existing)', () => {
  const s = deriveStepSignal({ action: 'fill' }, null, { value: 'Ada' });
  assert.deepEqual(s, { method: 'input_value', detail: 'field now holds "Ada"' });
});

test('V-5 deriveStepSignal: click checked_state toggle (existing)', () => {
  const s = deriveStepSignal({ action: 'click' }, { checked: false }, { checked: true });
  assert.deepEqual(s, { method: 'checked_state', detail: 'checkbox/radio toggled false -> true' });
});

test('V-5 deriveStepSignal: select value change => select_change (new)', () => {
  const s = deriveStepSignal({ action: 'select' }, { value: 'Apple' }, { value: 'Banana' });
  assert.equal(s.method, 'select_change');
  assert.ok(s.detail.includes('Apple') && s.detail.includes('Banana'));
});

test('V-5 deriveStepSignal: hover value change => hover_change (new)', () => {
  const s = deriveStepSignal({ action: 'hover' }, { value: '' }, { value: 'Helpful tooltip text' });
  assert.equal(s.method, 'hover_change');
});

test('V-5 deriveStepSignal: press/key input change => press_change (new)', () => {
  const s = deriveStepSignal({ action: 'press' }, { value: '' }, { value: 'a' });
  assert.equal(s.method, 'press_change');
});

test('V-5 deriveStepSignal: scroll change => scroll_change (new)', () => {
  const s = deriveStepSignal({ action: 'scroll' }, { value: '0' }, { value: '100' });
  assert.equal(s.method, 'scroll_change');
});

test('V-5 deriveStepSignal: no before/after => null (no invented signal)', () => {
  assert.equal(deriveStepSignal({ action: 'select' }, null, null), null);
  assert.equal(deriveStepSignal({ action: 'select' }, { value: 'a' }, { value: 'a' }), null);
});

test('V-5 deriveStepSignal: no change in any property => null', () => {
  const s = deriveStepSignal({ action: 'hover' }, { value: 'x', checked: true }, { value: 'x', checked: true });
  assert.equal(s, null);
});

test('V-5 control: generic fallback never fires when probe absent (negative control)', () => {
  const s = deriveStepSignal({ action: 'download' }, null, { value: 'x' });
  assert.equal(s, null);
});
