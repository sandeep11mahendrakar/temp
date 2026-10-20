const { runGenerateLive } = require('./src/generateLive');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  process.env.GENERATE = 'on';
  const fakePage = {
    _url: 'https://example.com/',
    url() { return this._url; },
    async goto(u) { this._url = u; },
    async waitForTimeout() {},
    async evaluate() { return { elements: [{ id: 'b', type: 'button', text: 'Go' }], bodyText: 'hello' }; },
  };
  const fakeBrowser = { newPage: async () => fakePage, close: async () => {} };
  const captured = [];
  const result = await runGenerateLive({
    pages: ['form-validate'],
    model: 'gemini-3.5-flash-lite',
    cap: 15,
    port: 5010,
    bootZoo: async () => ({ proc: { kill: () => {} }, port: 5010 }),
    browserFactory: async () => fakeBrowser,
    geminiGenerate: async () => JSON.stringify({ tcs: [{ id: 'g1', objective: 'o', steps: [{ action: 'click', target: { type: 'button', text: 'Go' } }] }] }),
    execSyncImpl: (cmd) => { captured.push(cmd); throw new Error('exec failed'); },
  });
  console.log('blocked:', result.blocked);
  console.log('pages:', result.pages.length, JSON.stringify(result.pages));
  console.log('calls:', result.calls.length);
  console.log('captured:', captured.length, captured);
})();
