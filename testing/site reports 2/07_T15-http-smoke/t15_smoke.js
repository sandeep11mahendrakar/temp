'use strict';
// P7/T15 live HTTP smoke (LoopB, headed, api_calls=0).
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5123';
const t0 = Date.now();
const ms = () => Date.now() - t0;

async function postMcp(id, method, params, timeoutMs = 180000) {
  const t = Date.now();
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: ctl.signal,
    });
    return { dt: Date.now() - t, status: r.status, body: await r.json() };
  } finally { clearTimeout(to); }
}

(async () => {
  const out = { ts: new Date().toISOString(), api_calls: 0, steps: [] };
  const health = await (await fetch(BASE + '/health')).json();
  out.steps.push({ op: 'health', dt: ms(), ok: health.ok === true });
  const init = await postMcp(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't15-smoke', version: '0' } });
  out.steps.push({ op: 'init', dt: init.dt, proto: init.body.result && init.body.result.protocolVersion });
  const list = await postMcp(2, 'tools/list', {});
  const names = ((list.body.result || {}).tools || []).map((x) => x.name).sort();
  out.steps.push({ op: 'list', dt: list.dt, tools: names });
  const st = await postMcp(3, 'tools/call', { name: 'status', arguments: {} });
  const sbody = JSON.parse(st.body.result.content[0].text);
  out.steps.push({ op: 'status', dt: st.dt, services: sbody.services });
  const pc = await postMcp(4, 'tools/call', { name: 'perceive', arguments: { url: 'https://example.com' } }, 300000);
  const pbody = JSON.parse(pc.body.result.content[0].text);
  out.steps.push({
    op: 'perceive', dt: pc.dt, url: pbody.url,
    elements: pbody.element_count, page_chars: (pbody.page_text || '').length,
  });
  out.pass = out.steps.every((s) => s.op !== 'perceive' || (s.elements > 0 && s.page_chars > 0));
  const p = path.join(__dirname, 't15_http_smoke.json');
  fs.writeFileSync(p, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.steps.map((s) => `${s.op} ${s.dt}ms`), null, 0));
  console.log('PASS=' + out.pass + ' saved=' + p);
})().catch((e) => { console.error('SMOKE-FAIL ' + e.message); process.exit(1); });
