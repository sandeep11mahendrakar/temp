'use strict';

/**
 * executorRobustness.js — V-4 helpers: bounded retries, timeouts, stale-element
 * detection. Pure-ish (no browser); callers wrap their actions.
 */

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function isStaleError(err) {
  const m = String((err && err.message) || err || '').toLowerCase();
  return /stale|detached|not attached|no such element|element not found/.test(m);
}

async function withTimeout(fn, ms) {
  const timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 30000;
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      const e = new Error(`timeout after ${timeoutMs}ms`);
      e.code = 'TIMEOUT';
      reject(e);
    }, timeoutMs);
    Promise.resolve().then(async () => {
      try {
        const r = await fn();
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(r);
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        reject(e);
      }
    });
  });
}

async function withRetry(fn, opts) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const retries = Number.isFinite(o.retries) ? Math.max(0, Math.floor(o.retries)) : 2;
  const delay = Number.isFinite(o.delay) ? Math.max(0, o.delay) : 50;
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(delay);
    }
  }
  throw lastErr;
}

function boundedRetries(n) {
  const v = Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.min(Math.max(0, v), 5);
}

module.exports = { sleep, isStaleError, withTimeout, withRetry, boundedRetries };
