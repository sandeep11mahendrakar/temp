'use strict';

const { parseTranscript } = require('./intercomInbox');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const ROLE_RE = /^[A-Z][A-Z0-9_-]*(?::[A-Za-z0-9_.-]{1,64})?$/;
const KINDS = new Set(['VERIFY_REQUEST', 'ACK', 'VERDICT', 'CORR', 'INTEGRATED', 'WITHDRAW']);
const LIFECYCLE = new Set(['VERIFY_REQUEST', 'ACK', 'VERDICT', 'CORR', 'INTEGRATED', 'WITHDRAW']);
const KIND_REQUIRED = {
  VERIFY_REQUEST: ['reply_to', 'revision', 'evidence'],
  ACK: ['reply_to', 'revision', 'action'],
  VERDICT: ['reply_to', 'revision', 'action', 'evidence'],
  CORR: ['reply_to', 'revision', 'action', 'evidence'],
  INTEGRATED: ['reply_to', 'revision', 'action', 'evidence'],
  WITHDRAW: ['reply_to', 'revision', 'action', 'evidence']
};
const COMMON_REQUIRED = ['id', 'from', 'to', 'kind', 'task', 'ist'];
const MAX_LINE = 300;

function isAscii(value) {
  return /^[\x20-\x7E]*$/.test(String(value));
}

function validateEnvelope(fields) {
  const errors = [];
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return { ok: false, errors: ['invalid_fields'] };
  }
  const keys = Object.keys(fields);
  // required common
  for (const k of COMMON_REQUIRED) {
    if (!fields[k] || String(fields[k]).trim() === '') errors.push(`missing_${k}`);
  }
  if (fields.kind && !KINDS.has(String(fields.kind).toUpperCase())) errors.push('invalid_kind');
  if (fields.id && !ID_RE.test(String(fields.id))) errors.push('invalid_id');
  if (fields.from && !ROLE_RE.test(String(fields.from))) errors.push('invalid_from');
  if (fields.to && !ROLE_RE.test(String(fields.to))) errors.push('invalid_to');
  if (fields.task && !ID_RE.test(String(fields.task))) errors.push('invalid_task');
  if (fields.cc) {
    const ccs = String(fields.cc).split(',').map((s) => s.trim()).filter(Boolean);
    if (ccs.some((c) => !ROLE_RE.test(c))) errors.push('invalid_cc');
  }
  if (fields.revision && String(fields.revision).length > 200) errors.push('revision_too_long');
  if (fields.evidence && String(fields.evidence).length > 1000) errors.push('evidence_too_long');
  // kind-specific
  const kind = fields.kind ? String(fields.kind).toUpperCase() : '';
  if (KIND_REQUIRED[kind]) {
    for (const k of KIND_REQUIRED[kind]) {
      if (!fields[k] || String(fields[k]).trim() === '') errors.push(`missing_${k}`);
    }
  }
  // delimiter/newline/ascii safety on every value
  for (const key of keys) {
    const v = fields[key];
    if (v === undefined || v === null) continue;
    const s = String(v);
    if (s === '') continue;
    if (!isAscii(s)) errors.push(`non_ascii_${key}`);
    if (/[\r\n|]/.test(s)) errors.push(`delimiter_injection_${key}`);
    if (s.trim() !== s) errors.push(`untrimmed_${key}`);
  }
  // conflicting duplicate id check is external (transcript); here ensure no duplicate keys already (object guarantees).
  // length check on encoded form
  if (errors.length === 0) {
    const encoded = encodeFromFields(fields);
    if (encoded.length > MAX_LINE) errors.push('line_too_long');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function encodeFromFields(fields) {
  const keys = ['id', 'from', 'to', 'cc', 'kind', 'task', 'reply_to', 'revision', 'action', 'evidence', 'ist'];
  const parts = [];
  for (const k of keys) {
    if (fields[k] !== undefined && fields[k] !== null && String(fields[k]).trim() !== '') {
      parts.push(`${k}=${String(fields[k]).trim()}`);
    }
  }
  // include any extra keys deterministically
  for (const k of Object.keys(fields).sort()) {
    if (keys.includes(k)) continue;
    const v = fields[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') parts.push(`${k}=${String(v).trim()}`);
  }
  return parts.join('|');
}

function encodeEnvelope(fields) {
  const v = validateEnvelope(fields);
  if (!v.ok) {
    const err = new Error(`invalid envelope: ${v.errors.join(', ')}`);
    err.errors = v.errors;
    throw err;
  }
  return encodeFromFields(fields);
}

function dryReplay(text, filters) {
  // read-only: never mutates input
  const input = String(text);
  const result = parseTranscript(input, filters || {});
  return { ok: true, mutated: false, result };
}

module.exports = {
  validateEnvelope,
  encodeEnvelope,
  dryReplay,
  KINDS,
  MAX_LINE,
  COMMON_REQUIRED,
  KIND_REQUIRED
};

if (require.main === module) {
  // CLI: --validate-json=<file> or --encode-json=<file> or --dry-replay=<file>
  const fs = require('node:fs');
  const args = process.argv.slice(2);
  let mode = null;
  let file = null;
  let recipient = null;
  let task = null;
  for (const a of args) {
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    if (!m) continue;
    if (m[1] === 'validate-json' || m[1] === 'encode-json' || m[1] === 'dry-replay') { mode = m[1]; file = m[2]; }
    if (m[1] === 'recipient' || m[1] === 'to') recipient = m[2];
    if (m[1] === 'task') task = m[2];
  }
  try {
    if (!mode || !file) throw new Error('required: --validate-json=FILE | --encode-json=FILE | --dry-replay=FILE');
    const raw = fs.readFileSync(file, 'utf8');
    if (mode === 'validate-json') {
      const fields = JSON.parse(raw);
      const r = validateEnvelope(fields);
      process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
      process.exitCode = r.ok ? 0 : 1;
    } else if (mode === 'encode-json') {
      const fields = JSON.parse(raw);
      const out = encodeEnvelope(fields);
      process.stdout.write(`${out}\n`);
      process.exitCode = 0;
    } else {
      const r = dryReplay(raw, { to: recipient, task });
      process.stdout.write(`${JSON.stringify(r.result.summary, null, 2)}\n`);
      process.exitCode = 0;
    }
  } catch (e) {
    process.stderr.write(`intercomEnvelope: ${e.message}\n`);
    process.exitCode = 2;
  }
}