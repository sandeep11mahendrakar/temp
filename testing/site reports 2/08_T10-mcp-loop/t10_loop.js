'use strict';
// R3-T10 MCP-loop proof driver (LoopB brain, headed, api_calls=0).
// Drives ONLY the MCP HTTP tools: status->perceive->fill->fill->click->evidence->reset.
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5123';
const OUT = path.join(__dirname, 't10_loop.json');
let id = 0;

const TMPD = 'C:/Users/sandeep/AppData/Local/Temp/mcp-act';

function newestShot(prefix) {
  const fs = require('fs');
  const files = fs.readdirSync(TMPD)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .map((f) => ({ f, t: fs.statSync(TMPD + '/' + f).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? TMPD + '/' + files[0].f : null;
}

async function ocrHasUser() {
  const fs = require('fs');
  const http = require('http');
  const shot = newestShot('act_after_fill');
  if (!shot) return { found: false, shot: null };
  const b64 = fs.readFileSync(shot).toString('base64');
  const body = JSON.stringify({ image_b64: b64 });
  const t = await new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: 5002, path: '/extract', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 120000 },
      (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => res(JSON.parse(d).full_text || '')); });
    req.on('error', rej);
    req.end(body);
  });
  return { found: /standard.use/i.test(t), shot: shot.split('/').pop() };
}

async function call(method, params, timeoutMs = 240000) {
  const t = Date.now();
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + '/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      signal: ctl.signal,
    });
    const body = await r.json();
    return { dt: Date.now() - t, http: r.status, body };
  } finally { clearTimeout(to); }
}

const txt = (reply) => {
  const c = reply && reply.body && reply.body.result && reply.body.result.content;
  return c && c[0] && c[0].text ? JSON.parse(c[0].text) : null;
};

function findInputs(dom) {
  const els = ((dom && dom.elements) || []).map((e) => ({
    ...e, x: e.center ? e.center.x : e.x, y: e.center ? e.center.y : e.y,
  })).filter((e) => /text_input|input|search|password/i.test(e.type || ''));
  inputsSort(els);
  return els;
}

function inputsSort(els) {
  els.sort((a, b) => a.y - b.y);
}

(async () => {
  const log = { ts: new Date().toISOString(), api_calls: 0, turns: [] };
  const rec = (turn) => { log.turns.push(turn); console.log(JSON.stringify(turn)); };

  await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't10', version: '0' } });
  const st = await call('tools/call', { name: 'status', arguments: {} });
  rec({ turn: 0, action: 'status', verif: 'services', ok: Boolean(txt(st)), dt: st.dt });

  const p1 = await call('tools/call', { name: 'perceive', arguments: { url: 'https://www.saucedemo.com/' } });
  const d1 = txt(p1);
  const [top, bottom] = findInputs(d1);
  rec({ turn: 1, action: 'perceive', verif: 'elements=' + (d1 && d1.element_count), ok: Boolean(top && bottom), dt: p1.dt });
  if (!top || !bottom) throw new Error('need 2 inputs, saw ' + (d1 && d1.element_count));

  const f1 = await call('tools/call', {
    name: 'act', arguments: { action: 'fill', target: { type: top.type, text: top.text || '' }, x: top.x, y: top.y, value: 'standard_user' },
  });
  let v1 = txt(f1);
  let retried = false;
  if (!v1 || v1.status !== 'PASS') {
    // Brain retry: re-perceive fresh, retry once (transient warmup honest).
    const pr = await call('tools/call', { name: 'perceive', arguments: { url: 'https://www.saucedemo.com/' } });
    const dr = txt(pr);
    const [topR] = findInputs(dr);
    const f1b = topR ? await call('tools/call', {
      name: 'act', arguments: { action: 'fill', target: { type: topR.type, text: topR.text || '' }, x: topR.x, y: topR.y, value: 'standard_user' },
    }) : null;
    if (f1b) v1 = txt(f1b);
    retried = true;
  }
  rec({ turn: 2, action: 'fill-user' + (retried ? '-retry' : ''), verif: (v1 && (v1.verification && v1.verification.method || v1.error)) || 'none', ok: Boolean(v1 && v1.status === 'PASS'), dt: f1.dt });

  // NO perceive between fills and click: MCP perceive NAVIGATES (reload),
  // which wipes typed values. Act re-detects live internally (fresh coords),
  // so turn-1 bottom-input coords stay valid (same DOM, no navigation).
  const f2 = await call('tools/call', {
    name: 'act', arguments: { action: 'fill', target: { type: bottom.type, text: bottom.text || '' }, x: bottom.x, y: bottom.y, value: 'secret_sauce' },
  });
  const v2 = txt(f2);
  rec({ turn: 4, action: 'fill-pass', verif: (v2 && v2.verification && v2.verification.method) || 'none', ok: Boolean(v2 && v2.status === 'PASS'), dt: f2.dt });
  // Brain independent check: username text must persist after pass fill.
  const chk = await ocrHasUser().catch(() => ({ found: false, shot: null }));
  rec({ turn: '4b', action: 'ocr-check-user', verif: 'user-persists=' + chk.found, ok: chk.found, shot: chk.shot });

  // NO pre-submit perceive either (same reload hazard); act re-detects.
  // Login button coords: fresh from turn-1 DOM (same page, un-navigated).
  // Find it in d1 directly instead of a second perceive.
  const login = ((d1 && d1.elements) || []).find((e) => /login/i.test(e.text || ''));
  rec({ turn: 5, action: 'locate-login', verif: 'login-btn=' + Boolean(login), ok: Boolean(login), dt: 0 });

  const c1 = await call('tools/call', {
    name: 'act', arguments: { action: 'click', target: { type: (login && login.type) || 'button', text: (login && login.text) || 'Login' }, ...(login && login.center ? { x: login.center.x, y: login.center.y } : {}) },
  });
  const v3 = txt(c1);
  rec({ turn: 6, action: 'click-login', verif: (v3 && v3.verification && v3.verification.method) || 'none', ok: Boolean(v3 && v3.status === 'PASS'), dt: c1.dt, url: v3 && v3.url });

  const p4 = await call('tools/call', { name: 'perceive', arguments: { url: (v3 && v3.url) || 'https://www.saucedemo.com/' } });
  const d4 = txt(p4);
  const pageText = (d4 && d4.page_text) || '';
  const good = /inventory\.html/.test((d4 && d4.url) || '') && /logout|products/i.test(pageText);
  rec({ turn: 7, action: 'perceive', verif: 'inventory+logout/products=' + good, ok: good, dt: p4.dt, url: d4 && d4.url });

  const ev = await call('tools/call', { name: 'evidence', arguments: {} });
  const evb = txt(ev);
  rec({ turn: 8, action: 'evidence', verif: 'shots+history', ok: Boolean(evb), dt: ev.dt });

  const rs = await call('tools/call', { name: 'reset', arguments: {} });
  rec({ turn: 9, action: 'reset', verif: 'session-closed', ok: Boolean(txt(rs)), dt: rs.dt });

  log.pass = log.turns.every((t) => t.ok);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  console.log('T10-PASS=' + log.pass + ' saved=' + OUT);
  if (!log.pass) process.exit(1);
})().catch((e) => { console.error('T10-FAIL ' + e.message); process.exit(1); });
