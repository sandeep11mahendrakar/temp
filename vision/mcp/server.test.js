'use strict';

/**
 * vision/mcp/server.test.js — offline MCP protocol tests (no browser,
 * no services needed; status degrades to all-down gracefully).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('path');

const SERVER = path.join(__dirname, 'server.js');

function startServer() {
  const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {}); // keep protocol channel clean
  return child;
}

// Sends [{method, params}] in order, resolves {id: response}.
function transact(child, messages, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const pending = new Map();
    let buf = '';
    const timer = setTimeout(() => reject(new Error('MCP transact timeout')), timeoutMs);
    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && pending.has(msg.id)) pending.get(msg.id)(msg);
        } catch { /* ignore */ }
      }
    });
    let nextId = 1;
    const sends = messages.map((m) => new Promise((res) => {
      const id = m.notify ? undefined : nextId++;
      pending.set(id, res);
      const wire = m.notify
        ? { jsonrpc: '2.0', method: m.method, params: m.params }
        : { jsonrpc: '2.0', id, method: m.method, params: m.params };
      child.stdin.write(JSON.stringify(wire) + '\n');
      if (m.notify) { pending.delete(id); res(null); }
    }));
    Promise.all(sends).then((out) => { clearTimeout(timer); resolve(out); }, reject);
  });
}

describe('mcp server protocol', () => {
  it('handshake negotiates a known protocol version', async () => {
    const child = startServer();
    try {
      const [init] = await transact(child, [
        { method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { method: 'notifications/initialized', notify: true },
      ]);
      assert.equal(init.result.protocolVersion, '2024-11-05');
      assert.equal(init.result.serverInfo.name, 'vision-test');
      assert.ok(init.result.capabilities.tools);
    } finally { child.kill(); }
  });

  it('tools/list exposes the 5 dual-way tools', async () => {
    const child = startServer();
    try {
      const [, , list] = await transact(child, [
        { method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { method: 'notifications/initialized', notify: true },
        { method: 'tools/list' },
      ]);
      const names = list.result.tools.map((t) => t.name).sort();
      assert.deepEqual(names, ['act', 'evidence', 'perceive', 'reset', 'status']);
      for (const t of list.result.tools) assert.equal(typeof t.inputSchema, 'object');
    } finally { child.kill(); }
  });

  it('unknown tool and method return JSON-RPC errors', async () => {
    const child = startServer();
    try {
      const [, , badTool, badMethod] = await transact(child, [
        { method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { method: 'notifications/initialized', notify: true },
        { method: 'tools/call', params: { name: 'nope', arguments: {} } },
        { method: 'bogus/method' },
      ]);
      assert.equal(badTool.error.code, -32601);
      assert.equal(badMethod.error.code, -32601);
    } finally { child.kill(); }
  });

  it('act stub is gone: invalid act returns caller error (never R3-T5-builder); evidence/reset live shapes', async () => {
    const child = startServer();
    try {
      const [, , act, ev, rs] = await transact(child, [
        { method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { method: 'notifications/initialized', notify: true },
        { method: 'tools/call', params: { name: 'act', arguments: { action: 'click' } } },
        { method: 'tools/call', params: { name: 'evidence', arguments: {} } },
        { method: 'tools/call', params: { name: 'reset', arguments: {} } },
      ]);
      assert.equal(act.result.isError, true);
      const body = JSON.parse(act.result.content[0].text);
      assert.equal(body.lane, 'caller');
      assert.ok(!JSON.stringify(body).includes('R3-T5-builder'));
      const evBody = JSON.parse(ev.result.content[0].text);
      assert.ok(Array.isArray(evBody.screenshots));
      assert.ok(Array.isArray(evBody.history));
      const rsBody = JSON.parse(rs.result.content[0].text);
      assert.equal(rsBody.reset, true);
      assert.equal(rsBody.services, 'up');
    } finally { child.kill(); }
  });

  it('status works with no services running', async () => {
    const child = startServer();
    try {
      const [, , st] = await transact(child, [
        { method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
        { method: 'notifications/initialized', notify: true },
        { method: 'tools/call', params: { name: 'status', arguments: {} } },
      ]);
      const body = JSON.parse(st.result.content[0].text);
      assert.deepEqual(Object.keys(body.services).sort(), ['browser', 'gateway', 'merge', 'ocr', 'yolo']);
    } finally { child.kill(); }
  }, { timeout: 120000 });
});

describe('mcp act/evidence/reset with injected fake session (no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 2,
      raw: { full_text: 'Login Welcome Username' },
      elements: [
        { id: 'e1', type: 'button', text: 'Login', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
        { id: 'e2', type: 'input', text: 'Username', bbox: { x1: 80, y1: 280, x2: 220, y2: 310 }, confidence: { yolo: 0.8 } },
      ],
    };
  }

  function makeFakePage(clicks) {
    clicks.keys = clicks.keys || [];
    return {
      _url: 'https://example.com/',
      closed: false,
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: {
        async click(x, y) { clicks.push([x, y]); },
        async wheel() {},
      },
      keyboard: {
        async press(k) { clicks.keys.push(k); },
        async type() {},
      },
      async waitForTimeout() {},
      async waitForLoadState() {},
      async close() { this.closed = true; },
    };
  }

  function setup(clicks) {
    const page = makeFakePage(clicks);
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = page;
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    return page;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('act re-detects live: stale coords replaced by detected center (stub gone)', async () => {
    const clicks = [];
    setup(clicks);
    try {
      const res = await srv.callTool('act', { action: 'click', x: 999, y: 999, target: { type: 'button', text: 'Login' } });
      assert.equal(res.isError, undefined);
      const body = parse(res);
      assert.equal(body.status, 'PASS');
      assert.equal(body.resolved_element.text, 'Login');
      assert.equal(body.resolution_via, 'text_match');
      assert.equal(body.stale_coordinates_prevented, true);
      assert.deepEqual(clicks[0], [100, 200]);
      assert.ok(Array.isArray(body.elements) && body.elements.length === 2);
      assert.ok(body.verification && typeof body.verification.method === 'string');
      assert.ok(!JSON.stringify(body).includes('R3-T5-builder'));
    } finally { teardown(); }
  });

  it('act stale target returns explicit FAIL and never clicks', async () => {
    const clicks = [];
    setup(clicks);
    try {
      const res = await srv.callTool('act', { action: 'click', x: 10, y: 10, target: { type: 'button', text: 'Missing thing xyz' } });
      const body = parse(res);
      assert.equal(body.status, 'FAIL');
      assert.equal(body.error, 'unresolved_target');
      assert.ok(typeof body.reason === 'string' && body.reason.length > 0);
      assert.equal(clicks.length, 0);
    } finally { teardown(); }
  });

  it('act fill + navigate return fresh DOM; evidence/reset shapes hold', async () => {
    const clicks = [];
    const page = setup(clicks);
    try {
      const fill = parse(await srv.callTool('act', { action: 'fill', x: 5, y: 5, value: 'hello', target: { type: 'input', text: 'Username' } }));
      assert.equal(fill.status, 'PASS');
      assert.equal(fill.verification.method, 'input_value');
      const nav = parse(await srv.callTool('act', { action: 'navigate', value: 'https://example.com/other' }));
      assert.equal(nav.status, 'PASS');
      assert.equal(nav.url, 'https://example.com/');
      assert.equal(page._url, 'https://example.com/other');
      const ev = parse(await srv.callTool('evidence', {}));
      assert.ok(Array.isArray(ev.screenshots) && ev.screenshots.includes('/tmp/mcp-fake.png'));
      assert.ok(Array.isArray(ev.history) && ev.history.length >= 2);
      const rs = parse(await srv.callTool('reset', {}));
      assert.equal(rs.reset, true);
      assert.equal(rs.services, 'up');
      assert.equal(page.closed, true);
      assert.equal(srv.session.page, null);
      assert.equal(srv.session.history.length, 0);
    } finally { teardown(); }
  });
});

describe('mcp act key + fill.submitKey T6 (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Username' },
      elements: [
        { id: 'e2', type: 'input', text: 'Username', bbox: { x1: 80, y1: 280, x2: 220, y2: 310 }, confidence: { yolo: 0.8 } },
      ],
    };
  }

  function makeKeyPage(keys) {
    return {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: { async click() {}, async wheel() {} },
      keyboard: { async press(k) { keys.push(k); }, async type() {} },
      async waitForTimeout() {},
      async waitForLoadState() {},
      async close() {},
    };
  }

  function setup(page) {
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = page;
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-key.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('act key presses Enter with no target and returns the same verification block', async () => {
    const keys = [];
    setup(makeKeyPage(keys));
    try {
      const res = await srv.callTool('act', { action: 'key', value: 'Enter' });
      assert.equal(res.isError, undefined);
      const body = parse(res);
      assert.equal(body.status, 'PASS');
      assert.equal(body.key, 'Enter');
      assert.deepEqual(keys, ['Enter']);
      assert.ok(Array.isArray(body.elements) && body.elements.length === 1);
      assert.ok(['url_change', 'visual_state_change'].includes(body.verification.method));
    } finally { teardown(); }
  });

  it('act fill with submitKey types then presses the key', async () => {
    const keys = [];
    setup(makeKeyPage(keys));
    try {
      const body = parse(await srv.callTool('act', {
        action: 'fill', x: 150, y: 295, value: 'standard_user',
        target: { type: 'input', text: 'Username' }, submitKey: 'Tab',
      }));
      assert.equal(body.status, 'PASS');
      assert.equal(body.submit_key, 'Tab');
      assert.ok(keys.includes('Control+A'));
      assert.equal(keys[keys.length - 1], 'Tab');
    } finally { teardown(); }
  });

  it('act key rejects a bad value before services (caller, offline)', async () => {
    const res = await srv.callTool('act', { action: 'key', value: 'F13' });
    assert.equal(res.isError, true);
    assert.equal(parse(res).lane, 'caller');
    const badSubmit = await srv.callTool('act', { action: 'fill', x: 1, y: 1, value: 'v', submitKey: 'Space' });
    assert.equal(badSubmit.isError, true);
    assert.equal(parse(badSubmit).lane, 'caller');
  });

  it('dispatchMessage mirrors key over the shared routing (HTTP fallback path)', async () => {
    const keys = [];
    setup(makeKeyPage(keys));
    try {
      const msg = await srv.dispatchMessage({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'act', arguments: { action: 'key', value: 'Tab' } } });
      const body = parse(msg.result);
      assert.equal(body.status, 'PASS');
      assert.deepEqual(keys, ['Tab']);
    } finally { teardown(); }
  });
});

describe('mcp http fallback transport (--transport http, offline, no browser)', () => {
  const PORT = process.env.MCP_HTTP_PORT || '5123';
  const BASE = 'http://127.0.0.1:' + PORT;

  function startHttpServer() {
    const child = spawn(process.execPath, [SERVER, '--transport', 'http'], {
      env: { ...process.env, MCP_HTTP_PORT: PORT },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', () => {});
    return child;
  }

  async function waitForHealth(timeoutMs = 30000) {
    const start = Date.now();
    for (;;) {
      try {
        const r = await fetch(BASE + '/health');
        if (r.ok) return await r.json();
      } catch { /* not up yet */ }
      if (Date.now() - start > timeoutMs) throw new Error('HTTP transport did not become ready on ' + BASE);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async function postMcp(id, method, params) {
    const r = await fetch(BASE + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    });
    assert.equal(r.status, 200);
    return r.json();
  }

  it('serves health + initialize/tools-list/tools-call-status over HTTP', async () => {
    const child = startHttpServer();
    try {
      const health = await waitForHealth();
      assert.equal(health.ok, true);
      const init = await postMcp(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
      assert.equal(init.result.protocolVersion, '2025-06-18');
      assert.equal(init.result.serverInfo.name, 'vision-test');
      const list = await postMcp(2, 'tools/list', {});
      assert.deepEqual(list.result.tools.map((x) => x.name).sort(), ['act', 'evidence', 'perceive', 'reset', 'status']);
      const st = await postMcp(3, 'tools/call', { name: 'status', arguments: {} });
      const body = JSON.parse(st.result.content[0].text);
      assert.deepEqual(Object.keys(body.services).sort(), ['browser', 'gateway', 'merge', 'ocr', 'yolo']);
    } finally { child.kill(); }
  }, { timeout: 120000 });

  it('unknown method + bad JSON return JSON-RPC errors over HTTP', async () => {
    const child = startHttpServer();
    try {
      await waitForHealth();
      const bad = await postMcp(1, 'bogus/method', {});
      assert.equal(bad.error.code, -32601);
      const raw = await fetch(BASE + '/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      });
      assert.equal(raw.status, 400);
      const parsed = await raw.json();
      assert.equal(parsed.error.code, -32700);
    } finally { child.kill(); }
  }, { timeout: 60000 });
});

describe('H1 perceive-nonav (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Login' },
      elements: [
        { id: 'e1', type: 'button', text: 'Login', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
      ],
    };
  }

  function setup(startUrl) {
    const gotos = [];
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = {
      _url: startUrl,
      url() { return this._url; },
      async goto(u) { gotos.push(u); this._url = u; },
      async screenshot() {},
      async waitForTimeout() {},
      async waitForLoadState() {},
    };
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-nonav.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    return gotos;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('same URL captures in place: no goto, navigated:false', async () => {
    const gotos = setup('https://example.com/');
    try {
      const body = parse(await srv.callTool('perceive', { url: 'https://example.com/' }));
      assert.equal(body.navigated, false);
      assert.deepEqual(gotos, []);
      assert.equal(body.element_count, 1);
    } finally { teardown(); }
  });

  it('trailing-slash variant counts as same URL (R5 rule)', async () => {
    const gotos = setup('https://example.com/');
    try {
      const body = parse(await srv.callTool('perceive', { url: 'https://example.com' }));
      assert.equal(body.navigated, false);
      assert.deepEqual(gotos, []);
    } finally { teardown(); }
  });

  it('other URL navigates, navigated:true', async () => {
    const gotos = setup('https://example.com/');
    try {
      const body = parse(await srv.callTool('perceive', { url: 'https://example.com/other' }));
      assert.equal(body.navigated, true);
      assert.deepEqual(gotos, ['https://example.com/other']);
    } finally { teardown(); }
  });

  it('navigate:true forces goto on same URL (blank-page equivalent)', async () => {
    const gotos = setup('about:blank');
    try {
      const body = parse(await srv.callTool('perceive', { url: 'https://example.com/' }));
      assert.equal(body.navigated, true);
      assert.deepEqual(gotos, ['https://example.com/']);
    } finally { teardown(); }
    const gotos2 = setup('https://example.com/');
    try {
      const body = parse(await srv.callTool('perceive', { url: 'https://example.com/', navigate: true }));
      assert.equal(body.navigated, true);
      assert.deepEqual(gotos2, ['https://example.com/']);
    } finally { teardown(); }
  });
});

describe('K1 batch1 submit/select/check/uncheck (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 2,
      raw: { full_text: 'Login Remember' },
      elements: [
        { id: 'e1', type: 'button', text: 'Login', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
        { id: 'e2', type: 'checkbox', text: '', bbox: { x1: 80, y1: 280, x2: 110, y2: 310 }, confidence: { yolo: 0.8 } },
      ],
    };
  }

  function setup(checked) {
    const acts = { clicks: [], presses: [], types: [] };
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: { async click(x, y) { acts.clicks.push([x, y]); }, async wheel() {} },
      keyboard: {
        async press(k) { acts.presses.push(k); },
        async type(v) { acts.types.push(v); },
      },
      async evaluate() { return checked; },
      async waitForTimeout() {},
      async waitForLoadState() {},
    };
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-k1.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    return acts;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('submit clicks + Enter without navigating', async () => {
    const acts = setup(null);
    try {
      const body = parse(await srv.callTool('act', { action: 'submit', target: { type: 'button', text: 'Login' } }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.presses, ['Enter']);
      assert.equal(body.url, 'https://example.com/');
    } finally { teardown(); }
  });

  it('select opens, types option, confirms', async () => {
    const acts = setup(null);
    try {
      const body = parse(await srv.callTool('act', { action: 'select', x: 100, y: 200, value: 'US' }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.types, ['US']);
      assert.deepEqual(acts.presses, ['Enter']);
    } finally { teardown(); }
  });

  it('check clicks only when live state is unchecked', async () => {
    const acts = setup(false);
    try {
      const body = parse(await srv.callTool('act', { action: 'check', x: 95, y: 295 }));
      assert.equal(body.status, 'PASS');
      assert.equal(acts.clicks.length, 1);
      assert.equal(body.verification.method, 'checked_stateDesired');
    } finally { teardown(); }
    const acts2 = setup(true);
    try {
      const body = parse(await srv.callTool('act', { action: 'check', x: 95, y: 295 }));
      assert.equal(body.status, 'PASS');
      assert.equal(acts2.clicks.length, 0);
    } finally { teardown(); }
  });

  it('uncheck clicks only when live state is checked; unknown action rejected', async () => {
    const acts = setup(true);
    try {
      const body = parse(await srv.callTool('act', { action: 'uncheck', x: 95, y: 295 }));
      assert.equal(body.status, 'PASS');
      assert.equal(acts.clicks.length, 1);
    } finally { teardown(); }
    const acts2 = setup(false);
    try {
      const body = parse(await srv.callTool('act', { action: 'uncheck', x: 95, y: 295 }));
      assert.equal(acts2.clicks.length, 0);
      const bad = parse(await srv.callTool('act', { action: 'dance', x: 1, y: 1 }));
      assert.ok(bad.error && /needs action in/.test(JSON.stringify(bad)));
    } finally { teardown(); }
  });
});

describe('K1 batch2 hover/dblclick/press/wait/focus (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Menu' },
      elements: [
        { id: 'e1', type: 'button', text: 'Menu', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
      ],
    };
  }

  function setup() {
    const acts = { clicks: [], presses: [], moves: [], waits: [] };
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: {
        async click(x, y, opts) { acts.clicks.push([x, y, opts && opts.clickCount ? opts.clickCount : 1]); },
        async wheel() {},
        async move(x, y) { acts.moves.push([x, y]); },
      },
      keyboard: {
        async press(k) { acts.presses.push(k); },
        async type() {},
      },
      async evaluate() { return null; },
      async waitForTimeout(ms) { acts.waits.push(ms); },
      async waitForLoadState() {},
    };
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-k1b2.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    return acts;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('hover moves without clicking', async () => {
    const acts = setup();
    try {
      const body = parse(await srv.callTool('act', { action: 'hover', x: 100, y: 200 }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.moves, [[100, 200]]);
      assert.equal(acts.clicks.length, 0);
    } finally { teardown(); }
  });

  it('dblclick double-clicks at coords', async () => {
    const acts = setup();
    try {
      const body = parse(await srv.callTool('act', { action: 'dblclick', target: { type: 'button', text: 'Menu' } }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.clicks, [[100, 200, 2]]);
    } finally { teardown(); }
  });

  it('press sends any key string; empty value rejected before services', async () => {
    const acts = setup();
    try {
      const body = parse(await srv.callTool('act', { action: 'press', value: 'Escape' }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.presses, ['Escape']);
      const bad = await srv.callTool('act', { action: 'press', value: '' });
      assert.equal(bad.isError, true);
    } finally { teardown(); }
  });

  it('wait sleeps capped value; focus clicks', async () => {
    const acts = setup();
    try {
      const body = parse(await srv.callTool('act', { action: 'wait', value: '200' }));
      assert.equal(body.status, 'PASS');
      assert.ok(acts.waits.includes(200), 'wait slept 200ms (plus settle 500ms)');
      const f = parse(await srv.callTool('act', { action: 'focus', x: 100, y: 200 }));
      assert.equal(f.status, 'PASS');
      assert.deepEqual(acts.clicks, [[100, 200, 1]]);
    } finally { teardown(); }
  });
});

describe('K1 batch3 clear/upload/drag/snapshot/selectOption (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Upload' },
      elements: [
        { id: 'e1', type: 'button', text: 'Upload', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
      ],
    };
  }

  function setup(uploads) {
    const acts = { clicks: [], presses: [], moves: [], shots: 0 };
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() { acts.shots += 1; },
      mouse: {
        async click(x, y, opts) { acts.clicks.push([x, y, opts && opts.clickCount ? opts.clickCount : 1]); },
        async wheel() {},
        async move(x, y) { acts.moves.push([x, y]); },
        async down() { acts.moves.push('down'); },
        async up() { acts.moves.push('up'); },
      },
      keyboard: {
        async press(k) { acts.presses.push(k); },
        async type() {},
      },
      async evaluate(fn, params) { return Array.isArray(params) && params[params.length - 1] === 'US'; },
      async evaluateHandle() {
        return { asElement: () => ({ setInputFiles: async (f) => uploads.push(f) }) };
      },
      async waitForTimeout() {},
      async waitForLoadState() {},
    };
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-k1b3.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    return acts;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('clear selects-all + deletes at coords', async () => {
    const acts = setup([]);
    try {
      const body = parse(await srv.callTool('act', { action: 'clear', x: 100, y: 200 }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.presses, ['Control+A', 'Backspace']);
    } finally { teardown(); }
  });

  it('upload sets files via near file input; missing path rejected', async () => {
    const uploads = [];
    const acts = setup(uploads);
    try {
      const body = parse(await srv.callTool('act', { action: 'upload', x: 100, y: 200, value: '/tmp/a.png' }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(uploads, ['/tmp/a.png']);
      assert.deepEqual(acts.presses, []);
      const bad = await srv.callTool('act', { action: 'upload', x: 100, y: 200, value: '' });
      assert.equal(bad.isError, true);
    } finally { teardown(); }
  });

  it('drag moves held cursor to x2,y2; bad value rejected', async () => {
    const acts = setup([]);
    try {
      const body = parse(await srv.callTool('act', { action: 'drag', x: 10, y: 20, value: '30,40' }));
      assert.equal(body.status, 'PASS');
      assert.deepEqual(acts.moves, [[10, 20], 'down', [30, 40], 'up']);
      const bad = await srv.callTool('act', { action: 'drag', x: 10, y: 20, value: 'nope' });
      assert.equal(bad.isError, true);
    } finally { teardown(); }
  });

  it('snapshot captures without coords; selectOption sets native select', async () => {
    const acts = setup([]);
    try {
      const snap = parse(await srv.callTool('act', { action: 'snapshot' }));
      assert.equal(snap.status, 'PASS');
      assert.equal(acts.shots >= 1, true);
      const sel = parse(await srv.callTool('act', { action: 'selectOption', x: 100, y: 200, value: 'US' }));
      assert.equal(sel.status, 'PASS');
      const miss = await srv.callTool('act', { action: 'selectOption', x: 100, y: 200, value: 'XX' });
      assert.equal(miss.isError, true);
    } finally { teardown(); }
  });
});

describe('H2 value-lost guard (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 3,
      raw: { full_text: 'Login Welcome Username Password' },
      elements: [
        { id: 'e1', type: 'button', text: 'Login', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
        { id: 'e2', type: 'text_input', text: '', bbox: { x1: 80, y1: 280, x2: 220, y2: 310 }, confidence: { yolo: 0.8 } },
        { id: 'e3', type: 'text_input', text: '', bbox: { x1: 80, y1: 330, x2: 220, y2: 360 }, confidence: { yolo: 0.8 } },
      ],
    };
  }

  function setupLens(clicks, lensRows) {
    const page = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: { async click(x, y) { clicks.push([x, y]); }, async wheel() {} },
      keyboard: { async press() {}, async type() {} },
      async waitForTimeout() {},
      async waitForLoadState() {},
      async evaluate() { return lensRows; },
      async close() {},
    };
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = page;
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-h2.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    return page;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('summarizeFormState counts lengths only, never surfaces values', () => {
    const out = srv.summarizeFormState([{ hasValue: true, len: 13 }, { hasValue: false, len: 0 }, null, { hasValue: true, len: 5 }]);
    assert.deepEqual(out, { fields: 3, filled_len_total: 18, empty_count: 1 });
    assert.ok(!JSON.stringify(out).includes('secret_sauce'));
  });

  it('pre-submit click after fills with empty form aborts value_lost, never clicks', async () => {
    const clicks = [];
    setupLens(clicks, [{ hasValue: false, len: 0 }, { hasValue: false, len: 0 }]);
    try {
      const fill = parse(await srv.callTool('act', { action: 'fill', x: 150, y: 295, value: 'standard_user', target: { type: 'text_input', text: '' } }));
      assert.equal(fill.status, 'PASS');
      assert.ok(fill.form_state && typeof fill.form_state.filled_len_total === 'number');
      assert.equal(fill.dom_assist, 'observe');
      assert.ok(!JSON.stringify(fill).includes('standard_user') || fill.verification.detail.includes('standard_user'),
        'value may appear only inside the pre-existing input_value verification detail');
      const click = await srv.callTool('act', { action: 'click', x: 100, y: 200, target: { type: 'button', text: 'Login' } });
      const body = parse(click);
      assert.equal(body.status, 'FAIL');
      assert.equal(body.error, 'value_lost');
      assert.ok(typeof body.reason === 'string' && body.reason.length > 0);
      assert.equal(click.isError, true);
      assert.equal(clicks.length, 1, 'only the fill click happened; aborted submit never clicks');
      assert.deepEqual(clicks[0], [150, 295], 'the single click is the fill, not Login');
    } finally { teardown(); }
  });
});

describe('L1 right_click (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Right Click Me' },
      elements: [
        { id: 'e1', type: 'button', text: 'Right Click Me', bbox: { x1: 80, y1: 180, x2: 120, y2: 220 }, confidence: { yolo: 0.9 } },
      ],
    };
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  it('right_click sends button:right, never a plain click; history keeps the real action', async () => {
    const clicks = [];
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: { async click(x, y, opts) { clicks.push([x, y, opts]); }, async wheel() {} },
      keyboard: { async press() {}, async type() {} },
      async evaluate() { return null; },
      async waitForTimeout() {},
      async waitForLoadState() {},
    };
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-l1.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    try {
      const body = parse(await srv.callTool('act', { action: 'right_click', target: { type: 'button', text: 'Right Click Me' } }));
      assert.equal(body.status, 'PASS');
      assert.equal(clicks.length, 1);
      assert.deepEqual(clicks[0], [100, 200, { button: 'right' }]);
      const last = srv.session.history.at(-1);
      assert.equal(last.action, 'right_click', 'history records right_click, never click-mapped');
    } finally {
      delete srv.__testEnsure; delete srv.__testPage;
      delete srv.__testProcess; delete srv.__testShotPath;
      srv.session.page = null; srv.session.browser = null; srv.session.context = null;
      srv.session.history = []; srv.session.lastDom = null;
      srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    }
  });
});

describe('Q5 fill probe-readback (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  function fakeVdom() {
    return {
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Username' },
      elements: [
        { id: 'e1', type: 'input', text: 'Username', bbox: { x1: 80, y1: 280, x2: 220, y2: 310 }, confidence: { yolo: 0.8 } },
      ],
    };
  }

  function parse(res) { return JSON.parse(res.content[0].text); }

  // Fake page whose DOM probe returns a canned field value (or null).
  function setupProbe(probeResult) {
    const page = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async screenshot() {},
      mouse: { async click() {}, async wheel() {} },
      keyboard: { async press() {}, async type() {} },
      async evaluate() { return probeResult; },
      async waitForTimeout() {},
      async waitForLoadState() {},
      async close() {},
    };
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = page;
    srv.__testProcess = async () => fakeVdom();
    srv.__testShotPath = '/tmp/mcp-fake-q5.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  function teardown() {
    delete srv.__testEnsure; delete srv.__testPage;
    delete srv.__testProcess; delete srv.__testShotPath;
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
  }

  it('fill reports the probed value with matched=true (never the requested echo)', async () => {
    setupProbe({ tag: 'input', value: 'hello' });
    try {
      const body = parse(await srv.callTool('act', { action: 'fill', x: 5, y: 5, value: 'hello', target: { type: 'input', text: 'Username' } }));
      assert.equal(body.status, 'PASS');
      assert.equal(body.verification.method, 'input_value');
      assert.equal(body.verification.readback, 'hello');
      assert.equal(body.verification.matched, true);
      assert.ok(body.verification.detail.includes('hello'), 'detail quotes the observed value');
    } finally { teardown(); }
  });

  it('fill with divergent probe reports matched=false (silent mis-fill caught)', async () => {
    setupProbe({ tag: 'input', value: 'stale-text' });
    try {
      const body = parse(await srv.callTool('act', { action: 'fill', x: 5, y: 5, value: 'hello', target: { type: 'input', text: 'Username' } }));
      assert.equal(body.status, 'PASS');
      assert.equal(body.verification.method, 'input_value');
      assert.equal(body.verification.readback, 'stale-text');
      assert.equal(body.verification.matched, false);
      assert.ok(!body.verification.detail.startsWith('filled "hello"'), 'no self-reported echo');
    } finally { teardown(); }
  });

  it('fill with no probe stays honest: readback null, never claims the echo', async () => {
    setupProbe(null);
    try {
      const body = parse(await srv.callTool('act', { action: 'fill', x: 5, y: 5, value: 'hello', target: { type: 'input', text: 'Username' } }));
      assert.equal(body.status, 'PASS');
      assert.equal(body.verification.method, 'input_value');
      assert.equal(body.verification.readback, null);
      assert.equal(body.verification.matched, null);
      assert.ok(body.verification.detail.includes('unreadable'), 'honest unreadable detail');
      assert.ok(!body.verification.detail.includes('"hello"'), 'requested value never quoted as observation');
    } finally { teardown(); }
  });
});

describe('F-G perceive block field (injected fakes, no browser, no ports)', () => {
  const srv = require('./server');

  it('blockField flags a bot-challenge page as non-ok with confidence', () => {
    const b = srv.blockField({ title: 'Just a moment...', url: 'https://x.test/', bodyText: 'Checking your browser before accessing' });
    assert.equal(b.class, 'bot_challenge');
    assert.ok(b.confidence >= 0.55 && b.confidence <= 0.95, 'confidence in the deterministic band');
  });

  it('blockField flags a login wall', () => {
    const b = srv.blockField({ title: 'Sign in', url: 'https://x.test/', bodyText: 'Please log in to continue' });
    assert.equal(b.class, 'login_wall');
  });

  it('blockField CONTROL normal page => ok (never a false wall)', () => {
    const b = srv.blockField({ title: 'Example', url: 'https://example.com/', bodyText: 'Hello world' });
    assert.deepEqual(b, { class: 'ok', confidence: 0.6 });
  });

  it('blockField never throws on junk/empty input', () => {
    assert.doesNotThrow(() => srv.blockField(null));
    assert.doesNotThrow(() => srv.blockField({}));
    // empty render + status 200 is honestly blank_render (executor parity)
    assert.equal(srv.blockField(null).class, 'blank_render');
    assert.equal(srv.blockField({ title: 'x', bodyText: 'real content' }).class, 'ok');
  });

  it('perceive reply carries block{class,confidence}; act surface untouched', async () => {
    srv.__testEnsure = async () => ({ ok: true });
    srv.__testPage = {
      _url: 'https://example.com/',
      url() { return this._url; },
      async goto(u) { this._url = u; },
      async title() { return 'Example Domain'; },
      async screenshot() {},
      async waitForTimeout() {},
      async waitForLoadState() {},
    };
    srv.__testProcess = async () => ({
      source_url: 'https://example.com/',
      element_count: 1,
      raw: { full_text: 'Hello world' },
      elements: [{ id: 'e1', type: 'button', text: 'Login', bbox: { x1: 1, y1: 2, x2: 3, y2: 4 }, confidence: { yolo: 0.9 } }],
    });
    srv.__testShotPath = '/tmp/mcp-fake-block.png';
    srv.session.page = null; srv.session.browser = null; srv.session.context = null;
    srv.session.history = []; srv.session.lastDom = null;
    srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    try {
      const res = await srv.callTool('perceive', { url: 'https://example.com/' });
      const body = JSON.parse(res.content[0].text);
      assert.ok(body.block, 'perceive reply has a block field');
      assert.equal(body.block.class, 'ok');
      assert.equal(typeof body.block.confidence, 'number');
      // no new tools: the 5 dual-way tools stay; act carries no block property.
      assert.equal(srv.TOOLS.length, 5);
      assert.equal(srv.TOOLS.find((t) => t.name === 'act').inputSchema.properties.block, undefined);
    } finally {
      delete srv.__testEnsure; delete srv.__testPage; delete srv.__testProcess; delete srv.__testShotPath;
      srv.session.page = null; srv.session.browser = null; srv.session.context = null;
      srv.session.history = []; srv.session.lastDom = null;
      srv.session.lastScreenshot = null; srv.session.lastUrl = null;
    }
  });
});
