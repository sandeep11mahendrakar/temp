const { runGenerateLive } = require('./src/generateLive');

(async () => {
  const fakePage = {
    _url: 'https://example.com/',
    url() { return this._url; },
    async goto(u) { this._url = u; },
    async waitForTimeout() {},
    async evaluate() { return { elements: [{ id: 'b', type: 'button', text: 'Go' }], bodyText: 'hello' }; },
  };
  const fakeBrowser = { newPage: async () => fakePage, close: async () => {} };
  const r = await runGenerateLive({
    pages: ['form-validate', 'dialogs'],
    model: 'gemini-3.5-flash-lite',
    cap: 15,
    port: 5010,
    bootZoo: async () => ({ proc: { kill: () => {} }, port: 5010 }),
    browserFactory: async () => fakeBrowser,
    geminiGenerate: async () => { throw new Error('brain/api-gemini: http 401 API key not valid'); },
  });
  console.log('blocked:', r.blocked);
  console.log('pages:', r.pages.length, JSON.stringify(r.pages));
  console.log('calls:', r.calls.length, JSON.stringify(r.calls));
})();
