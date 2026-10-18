'use strict';

// memoryAblation.js — E-4 experience-memory ablation (with vs without memory).
// Pure: compares the planner prompt produced with EXPERIENCE_MEMORY=on vs off
// using the same lesson store. Reports honest delta (no claimed gain if <=0).

const { isMemoryEnabled, augmentPrompt } = require('./lessonRetrieval');

function augment(basePrompt, store, opts) {
  const env = (opts && opts.env) || process.env;
  const onEnv = Object.assign({}, env, { EXPERIENCE_MEMORY: 'on' });
  const offEnv = Object.assign({}, env, { EXPERIENCE_MEMORY: 'off' });
  const withMem = augmentPrompt(basePrompt, store, { env: onEnv });
  const withoutMem = augmentPrompt(basePrompt, store, { env: offEnv });
  return {
    memory_enabled_on: isMemoryEnabled(onEnv),
    memory_enabled_off: isMemoryEnabled(offEnv),
    prompt_with_memory: withMem,
    prompt_without_memory: withoutMem,
    bytes_with: Buffer.byteLength(String(withMem || ''), 'utf8'),
    bytes_without: Buffer.byteLength(String(withoutMem || ''), 'utf8'),
    delta_bytes: Buffer.byteLength(String(withMem || ''), 'utf8') - Buffer.byteLength(String(withoutMem || ''), 'utf8'),
    changed: String(withMem) !== String(withoutMem),
  };
}

function ablate(opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const base = String(o.basePrompt || '');
  const store = (o.store && typeof o.store === 'object') ? o.store : { lessons: [] };
  const r = augment(base, store, { env: o.env });
  const honest = r.changed
    ? 'memory changes prompt (gain unmeasured without live run)'
    : 'no prompt change (no gain claimed)';
  return Object.assign({}, r, { honest, gain_claimed: false });
}

module.exports = { augment, ablate, isMemoryEnabled };
