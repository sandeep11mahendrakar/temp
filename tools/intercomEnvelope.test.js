'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEnvelope, encodeEnvelope, dryReplay } = require('./intercomEnvelope');

const base = {
  id: 'VR-1', from: 'WORKER:W1', to: 'AUD:AUD-1', kind: 'VERIFY_REQUEST',
  task: 'T-1', ist: '2026-10-19 10:00 IST',
  reply_to: 'T-1', revision: 'abc123', evidence: 'docs/evidence/x.json'
};

test('encode valid envelope', () => {
  const out = encodeEnvelope(base);
  assert.ok(out.includes('id=VR-1'));
  assert.ok(out.length <= 300);
});

test('ACK remains receipt only (valid kind)', () => {
  const e = { ...base, id: 'ACK-1', kind: 'ACK', action: 'received', to: 'WORKER:W1', from: 'AUD:AUD-1' };
  const r = validateEnvelope(e);
  assert.equal(r.ok, true);
});

test('four lifecycle kinds encode', () => {
  for (const k of ['VERIFY_REQUEST', 'ACK', 'VERDICT', 'INTEGRATED']) {
    const f = { ...base, kind: k, id: k + '-1', action: 'X', evidence: base.evidence };
    const r = validateEnvelope(f);
    assert.equal(r.ok, true, k);
  }
});

test('missing timestamp rejected', () => {
  const f = { ...base }; delete f.ist;
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('missing_ist'));
});

test('missing recipient rejected', () => {
  const f = { ...base }; delete f.to;
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('missing_to'));
});

test('missing evidence rejected', () => {
  const f = { ...base }; delete f.evidence;
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('missing_evidence'));
});

test('wrong actor route rejected (invalid from)', () => {
  const f = { ...base, from: 'bogus' };
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
});

test('pipe injection rejected', () => {
  const f = { ...base, evidence: 'a|b' };
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('delimiter_injection')));
});

test('newline injection rejected', () => {
  const f = { ...base, evidence: 'a\nb' };
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
});

test('non-ascii rejected', () => {
  const f = { ...base, evidence: 'café' };
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('non_ascii')));
});

test('overlength rejected', () => {
  const f = { ...base, evidence: 'x'.repeat(400) };
  const r = validateEnvelope(f);
  assert.equal(r.ok, false);
});

test('dryReplay does not mutate input', () => {
  const text = 'id=VR-1|from=WORKER:W1|to=AUD:AUD-1|kind=VERIFY_REQUEST|task=T-1|ist=2026-10-19 10:00 IST|reply_to=T-1|revision=abc|evidence=e\n';
  const before = text;
  const r = dryReplay(text);
  assert.equal(r.mutated, false);
  assert.equal(text, before);
  assert.ok(r.result);
});

test('identical duplicate delivery idempotent in inbox', () => {
  const text = 'id=VR-1|from=WORKER:W1|to=AUD:AUD-1|kind=VERIFY_REQUEST|task=T-1|ist=2026-10-19 10:00 IST|reply_to=T-1|revision=abc|evidence=e\n' +
              'id=VR-1|from=WORKER:W1|to=AUD:AUD-1|kind=VERIFY_REQUEST|task=T-1|ist=2026-10-19 10:00 IST|reply_to=T-1|revision=abc|evidence=e\n';
  const r = dryReplay(text);
  assert.equal(r.result.summary.requests, 1);
});

test('conflicting duplicate flagged', () => {
  const text = 'id=VR-1|from=WORKER:W1|to=AUD:AUD-1|kind=VERIFY_REQUEST|task=T-1|ist=2026-10-19 10:00 IST|reply_to=T-1|revision=abc|evidence=e\n' +
              'id=VR-1|from=WORKER:W1|to=AUD:AUD-1|kind=VERIFY_REQUEST|task=T-1|ist=2026-10-19 10:00 IST|reply_to=T-1|revision=def|evidence=e\n';
  const r = dryReplay(text);
  assert.ok(r.result.warnings.some((w) => w.code === 'duplicate_id_conflict'));
});

test('legacy request outside tail visible', () => {
  const text = 'Q-2026-10-19 10:00-W1->AUD\n' +
              'id=VR-1|from=WORKER:W1|to=AUD:AUD-1|kind=VERIFY_REQUEST|task=T-1|ist=2026-10-19 10:00 IST|reply_to=T-1|revision=abc|evidence=e\n';
  const r = dryReplay(text);
  assert.ok(r.result.legacy.length >= 1);
});

test('fake secret marker absent from encode output', () => {
  const f = { ...base, evidence: 'docs/evidence/x.json' };
  const out = encodeEnvelope(f);
  assert.ok(!out.includes('FAKE_SECRET_MARKER'));
});