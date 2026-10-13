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
