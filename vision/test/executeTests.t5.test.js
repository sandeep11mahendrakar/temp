'use strict';

// R3-T5 (worker-3): offline tests for executor hardening (5a/5b/5c).
// No browser, no network, no LLM. Live collaborators are injected mocks.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  resolveTarget,
  isCheckTarget,
  resolveCheckTarget,
  checkToggled,
  runCheckRetries,
  resolveLowConfFill,
  buildRedetectPayload,
  submitKeyPress,
  snapCheckToNativeInput,
  DEFAULT_CONF,
  LOWCONF_RETRY_CONF,
} = require('../src/executeTests');

const el = (id, type, text, cx, cy, conf) => ({
  id, type, text, conf: conf ?? 0.8, cx, cy,
  bbox: { x1: cx - 10, y1: cy - 5, x2: cx + 10, y2: cy + 5 },
});

// --- 5a: checkbox/radio resolution --------------------------------------

test('isCheckTarget matches checkbox/radiobox only', () => {
  assert.equal(isCheckTarget({ target: { type: 'checkbox' } }), true);
  assert.equal(isCheckTarget({ target: { type: 'radiobox' } }), true);
  assert.equal(isCheckTarget({ target: { type: 'button' } }), false);
  assert.equal(isCheckTarget({}), false);
  assert.equal(isCheckTarget(null), false);
});

test('resolveCheckTarget uses bbox center, never label text', () => {
  const elements = [
    el('e-btn', 'button', 'Remember me', 100, 100),
    el('e-box', 'checkbox', '', 300, 300),
  ];
  const step = { target: { type: 'checkbox', text: 'Remember me' }, x: 305, y: 298 };
  const r = resolveCheckTarget(elements, step);
  assert.equal(r.resolved, true);
  assert.equal(r.element.id, 'e-box');
  assert.equal(r.via, 'check_bbox');
});

test('resolveCheckTarget: single check resolves w/o coords; multi w/o coords is unresolved', () => {
  const one = [el('e-box', 'checkbox', '', 300, 300)];
  assert.equal(resolveCheckTarget(one, { target: { type: 'checkbox' } }).resolved, true);
  const two = [el('a', 'checkbox', '', 10, 10), el('b', 'checkbox', '', 900, 800)];
  const r = resolveCheckTarget(two, { target: { type: 'checkbox' } });
  assert.equal(r.resolved, false);
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
});

test('resolveCheckTarget ignores non-check elements entirely', () => {
  const r = resolveCheckTarget(
    [el('e-btn', 'button', 'I agree', 100, 100)],
    { target: { type: 'checkbox', text: 'I agree' }, x: 100, y: 100 }
  );
  assert.equal(r.resolved, false);
});

test('checkToggled reads boolean flips only', () => {
  assert.equal(checkToggled({ checked: false }, { checked: true }), true);
  assert.equal(checkToggled({ checked: true }, { checked: true }), false);
  assert.equal(checkToggled(null, { checked: true }), false);
  assert.equal(checkToggled({ value: 'x' }, { value: 'x' }), false);
});

test('runCheckRetries: first retry toggles (attempt 2 overall)', async () => {
  const probes = [{ checked: false }, { checked: true }];
  let clicks = 0;
  const r = await runCheckRetries({
    before: { checked: false },
    probe: async () => probes.shift() || { checked: true },
    click: async () => { clicks += 1; },
    focusSpace: async () => { throw new Error('must not reach Space'); },
  });
  assert.equal(r.toggled, true);
  assert.equal(r.attempts, 2);
  assert.equal(clicks, 1);
});

test('runCheckRetries: falls back to focus+Space, then honest failure', async () => {
  let spaces = 0;
  const r = await runCheckRetries({
    before: { checked: false },
    probe: async () => ({ checked: false }),
    click: async () => {},
    focusSpace: async () => { spaces += 1; },
  });
  assert.equal(r.toggled, false);
  assert.equal(r.attempts, 3);
  assert.equal(spaces, 1);
});

// --- 5b: low-confidence fill retry ---------------------------------------

test('resolveLowConfFill takes nearest input-class within 90px', () => {
  const elements = [
    el('e-btn', 'button', 'Submit', 50, 50),
    el('e-in', 'text_input', '', 200, 200, 0.05),
  ];
  const r = resolveLowConfFill(elements, { x: 210, y: 205, target: { type: 'text_input', text: 'Email' } });
  assert.equal(r.resolved, true);
  assert.equal(r.element.id, 'e-in');
  assert.equal(r.via, 'lowconf_retry');
});

test('resolveLowConfFill: none in range, or only non-inputs, is unresolved', () => {
  const elements = [el('e-in', 'text_input', '', 500, 500, 0.05)];
  assert.equal(resolveLowConfFill(elements, { x: 0, y: 0 }).resolved, false);
  const checks = [el('e-box', 'checkbox', '', 10, 10, 0.05)];
  assert.equal(resolveLowConfFill(checks, { x: 12, y: 12 }).resolved, false);
});

test('buildRedetectPayload defaults conf 0.15, override honored', () => {
  assert.deepEqual(buildRedetectPayload('/shot.png'), { image_path: '/shot.png', conf: 0.15 });
  assert.deepEqual(buildRedetectPayload('/shot.png', { conf: 0.05 }), { image_path: '/shot.png', conf: 0.05 });
  assert.equal(DEFAULT_CONF, 0.15);
  assert.equal(LOWCONF_RETRY_CONF, 0.05);
});

// --- 5c: submitKey ---------------------------------------------------------

test('submitKeyPress normalizes Enter|Tab, rejects the rest', () => {
  assert.equal(submitKeyPress({ submitKey: 'Enter' }), 'Enter');
  assert.equal(submitKeyPress({ submitKey: 'tab' }), 'Tab');
  assert.equal(submitKeyPress({ submitKey: 'Escape' }), null);
  assert.equal(submitKeyPress({}), null);
  assert.equal(submitKeyPress(null), null);
});

test('existing resolveTarget text behavior unchanged (no-regression pin)', () => {
  const r = resolveTarget(
    [el('e1', 'button', 'Login', 10, 10)],
    { target: { type: 'button', text: 'Login' }, x: 9999, y: 9999 }
  );
  assert.equal(r.resolved, true);
  assert.equal(r.via, 'text_match');
});
test('T5 integration: retry, submit key and honest checked-state failure are wired', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/executeTests.js'), 'utf8');
  const executor = source.slice(source.indexOf('async function runTestCase'));
  assert.match(executor, /await runCheckRetries\(/);
  assert.match(executor, /submitKeyPressed = submitKeyPress\(step\)/);
  assert.match(executor, /checked_state_verified:/);
  assert.match(executor, /if \(checkedStateFailure\)/);
});

test('T5 integration: lowered confidence reaches YOLO inference', () => {
  const gateway = fs.readFileSync(path.join(__dirname, '../gateway/app.js'), 'utf8');
  const yolo = fs.readFileSync(path.join(__dirname, '../services/yolo-service/detect.py'), 'utf8');
  assert.match(gateway, /conf:\s*requestedConf/);
  assert.match(gateway, /detectPayload\.conf\s*=\s*requestedConf/);
  assert.match(yolo, /data\.get\(['"]conf['"],\s*CONF_THRESHOLD\)/);
  assert.match(yolo, /model\(img,\s*conf=conf_threshold/);
});

// --- M2: FIX-A domsnap ----------------------------------------------------
// Minimal fake page fixture: only evaluate() is exercised.
const fakePage = (pt) => ({
  evaluate: async () => pt,
});
const throwingPage = () => ({
  evaluate: async () => { throw new Error('dead page'); },
});

test('M2 FIX-A: snap moves label-text point to native control center', async () => {
  const r = await snapCheckToNativeInput(fakePage({ x: 535, y: 285 }), 632, 284);
  assert.equal(r.snapped, true);
  assert.equal(r.x, 535);
  assert.equal(r.y, 285);
});

test('M2 FIX-A: snap falls back to recorded point when no control (null/throw)', async () => {
  const r1 = await snapCheckToNativeInput(fakePage(null), 632, 284);
  assert.equal(r1.snapped, false);
  assert.equal(r1.x, 632);
  assert.equal(r1.y, 284);
  const r2 = await snapCheckToNativeInput(throwingPage(), 632, 284);
  assert.equal(r2.snapped, false);
  assert.equal(r2.x, 632);
  assert.equal(r2.y, 284);
});

test('M2 integration: domsnap wire + check_snap evidence are in the click path', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/executeTests.js'), 'utf8');
  const executor = source.slice(source.indexOf('async function runTestCase'));
  assert.match(executor, /await snapCheckToNativeInput\(page, execStep\.x, execStep\.y\)/);
  assert.match(executor, /resolutionVia = `\$\{resolutionVia \|\| 'check_bbox'\}\+domsnap`/);
  assert.match(executor, /check_snap:/);
});

test('M3 integration: crop_retry precedes lowconf; ocr_anchor tagged WEAK', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/executeTests.js'), 'utf8');
  const executor = source.slice(source.indexOf('async function runTestCase'));
  assert.match(executor, /cropTopband: true/);
  assert.match(executor, /via: 'crop_retry'/);
  assert.ok(
    executor.indexOf("'crop_retry'") < executor.indexOf('LOWCONF_RETRY_CONF'),
    'crop_retry attempt is ordered before the lowconf fallback'
  );
  assert.match(executor, /ocr_anchor/);
  assert.match(executor, /OCR-anchor synth target \(WEAK verification\)/);
});

