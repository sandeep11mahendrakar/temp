'use strict';

/**
 * vision/mcp/server.js — local MCP server (stdio) for Architecture B.
 *
 * Lets any MCP client (Claude Code, Codex, opencode, Claude Desktop,
 * Cursor, Windsurf, Cline) drive the vision pipeline as the *brain* while
 * this machine does the *seeing* (Playwright + YOLO + OCR, all local).
 * Dual-way contract: tools speak the SAME JSON shapes as the API path
 * (visualDom compact elements, executeTests actions), so switching brains
 * is config-only. See docs/MCP_DUAL_SETUP.md.
 *
 * Transport: newline-delimited JSON-RPC 2.0 over stdio. Zero new
 * dependencies (node builtins + global fetch only; serviceManager is a
 * read-only require of existing code).
 *
 * Run: node vision/mcp/server.js   (from anywhere; paths resolve locally)
 */

const path = require('path');
const { ensureVisionServices, shutdownVisionServices } = require('../src/serviceManager');

const SERVER_NAME = 'vision-test';
const SERVER_VERSION = '0.1.0';
const KNOWN_PROTOCOLS = ['2024-11-05', '2025-03-26', '2025-06-18'];

const VISION_HEADED = process.env.VISION_HEADED !== 'false';
const SVC = {
  gateway: process.env.VISION_GATEWAY_URL || 'http://127.0.0.1:5000',
  yolo: process.env.YOLO_SERVICE_URL || 'http://127.0.0.1:5001',
  ocr: process.env.OCR_SERVICE_URL || 'http://127.0.0.1:5002',
  merge: process.env.MERGE_SERVICE_URL || 'http://127.0.0.1:5003',
  browser: process.env.BROWSER_SERVICE_URL || 'http://127.0.0.1:5004',
};

// One persistent operator-visible session (builder-owned after scaffold).
// R3-T9: perceive AND act share this page, so act-after-perceive just works.
const session = { history: [], svcHandle: null, browser: null, context: null, page: null, lastDom: null, lastScreenshot: null, lastUrl: null, recreated: false };

function dropSessionBrowser() {
  session.page = null; session.context = null; session.browser = null;
}

// Session history is ALSO persisted per-day (monitoring gold for behavior
// analysis). Best-effort; logging never breaks a tool call.
function appendHistory(entry) {
  session.history.push(entry);
  if (session.history.length > 200) session.history.splice(0, session.history.length - 200);
  try {
    const fs = require('fs');
    const day = new Date().toISOString().slice(0, 10);
    const dir = path.join(__dirname, '..', 'storage', 'outputs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `mcp_${day}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n', 'utf8');
  } catch (_) { /* ignore */ }
}

// Wall-clock guard (R3-T9 P3): no tool call may hang forever on a dead or
// wedged service. Timeouts surface as structured isError results the agent
// can reason over (AWS guidance), never silence.
function withTimeout(promise, ms, label) {
  let t;
  const gate = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms); });
  return Promise.race([Promise.resolve(promise).finally(() => clearTimeout(t)), gate]);
}
function timeoutResult(tool) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'FAIL', tool, error: 'timeout',
        retryable: true,
        suggested_action: 'Retry the exact same call once. If it times out again, call reset, then navigate to the URL again.',
      }),
    }],
    isError: true,
  };
}

// Readiness wait (R3-T9 P4/P6): after spawning, block until gateway+yolo+ocr
// all answer health (YOLO needs ~60s to load weights) instead of failing
// fast with a warming 500.
async function waitForServices(timeoutMs = 90000) {
  // TEST-ONLY: injected fake session skips real service readiness polling.
  if (typeof module.exports.__testEnsure === 'function' &&
      module.exports.__testPage &&
      typeof module.exports.__testProcess === 'function') return true;
  const start = Date.now();
  for (;;) {
    const [g, y, o] = await Promise.all([
      getJSON(`${SVC.gateway}/vision/health`),
      getJSON(`${SVC.yolo}/health`),
      getJSON(`${SVC.ocr}/health`),
    ]);
    if (g && y && o) return true;
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
function servicesNotReadyResult() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: 'FAIL', error: 'services_not_ready',
        retryable: true,
        suggested_action: 'Wait 60 seconds for model weights to load, then retry. If still down, report to the operator.',
      }),
    }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// R3-T5-builder helpers (act/evidence/reset only; status/perceive untouched)
// Reuse: same lib/fuzzyMatch tiers + resolveTarget scoring as executeTests.js.
// ---------------------------------------------------------------------------
let fuzzy = null;
try { fuzzy = require('../../lib/fuzzyMatch'); } catch { fuzzy = null; }
function mcpNorm(s) {
  if (fuzzy && typeof fuzzy.normalizeText === 'function') return fuzzy.normalizeText(s);
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function mcpFuzzy(have, want) {
  if (fuzzy && typeof fuzzy.fuzzyTextMatch === 'function') return fuzzy.fuzzyTextMatch(have, want);
  const h = mcpNorm(have); const w = mcpNorm(want);
  const match = !!w && (h === w || h.includes(w) || w.includes(h));
  return { match, via: match ? 'containment' : 'no_tier_matched', editDistance: 0, overlap: 0 };
}

// Full resolvable elements (cx/cy centers) from a gateway visual DOM.
function toFullElements(vdom) {
  return ((vdom && vdom.elements) || []).map((el) => {
    const bbox = el.bbox || null;
    const cx = Number.isFinite(el.cx) ? el.cx
      : (bbox ? Math.round((bbox.x1 + bbox.x2) / 2) : (el.center ? el.center.x : 0));
    const cy = Number.isFinite(el.cy) ? el.cy
      : (bbox ? Math.round((bbox.y1 + bbox.y2) / 2) : (el.center ? el.center.y : 0));
    return {
      id: el.id, type: el.type, text: el.text || '',
      conf: el.confidence ? Number(el.confidence.yolo.toFixed(2)) : (typeof el.conf === 'number' ? el.conf : null),
      cx, cy, bbox,
    };
  });
}

// Mirror of executeTests.resolveTarget: type+text primary, fuzzy tier,
// single controlled proximity fallback. Never invents coordinates.
function resolveMcpTarget(elements, wantType, wantText, px, py, proximityPx = 90) {
  if (!Array.isArray(elements) || !elements.length) {
    return { resolved: false, reason: 'no_elements_in_current_state' };
  }
  const wt = mcpNorm(wantType);
  const wx = mcpNorm(wantText);
  let best = null; let bestScore = 0;
  for (const el of elements) {
    let score = 0;
    if (wt && mcpNorm(el.type) === wt) score += 2;
    if (wx && el.text) {
      const et = mcpNorm(el.text);
      if (et.includes(wx)) score += 3;
      else if (wx.includes(et)) score += 2;
    }
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (bestScore >= 3) return { resolved: true, via: 'text_match', element: best };
  if (wx) {
    const cand = [];
    for (const el of elements) {
      if (!el.text) continue;
      if (wt && mcpNorm(el.type) !== wt) continue;
      const m = mcpFuzzy(el.text, wx);
      if (m.match) cand.push({ el, m });
    }
    if (cand.length) {
      cand.sort((a, b) => ((a.m.editDistance || 0) - (b.m.editDistance || 0)) || ((b.m.overlap || 0) - (a.m.overlap || 0)));
      return { resolved: true, via: `fuzzy_${cand[0].m.via}`, element: cand[0].el };
    }
  }
  const near = elements
    .filter((el) => !wt || mcpNorm(el.type) === wt)
    .map((el) => ({ el, d: Math.hypot(el.cx - px, el.cy - py) }))
    .filter((x) => x.d <= proximityPx)
    .sort((a, b) => a.d - b.d)[0];
  if (near) return { resolved: true, via: 'proximity', element: near.el };
  return { resolved: false, reason: `target not found in current state (wanted type="${wt}" text="${wx}")` };
}

// Canonical key names for act 'key' + fill submitKey (Playwright press set).
const KEY_PRESS_KEYS = ['Enter', 'Tab', 'Space'];
const SUBMIT_KEYS = ['Enter', 'Tab'];
// H2 value-lost guard: form-state lens (lengths only, NEVER values).
// summarizeFormState() is pure over [{hasValue,len}]; formStateLens(page)
// reads the live DOM the same lens-only way. dom_assist:'observe' marks
// observation-only reads (no correction attempted).
function summarizeFormState(fieldLens) {
  const rows = Array.isArray(fieldLens) ? fieldLens.filter((r) => r && typeof r === 'object') : [];
  let filled = 0;
  let total = 0;
  for (const r of rows) {
    const len = Number.isFinite(r.len) && r.len > 0 ? Math.floor(r.len) : 0;
    total += len;
    if (r.hasValue === true || len > 0) filled += 1;
  }
  return { fields: rows.length, filled_len_total: total, empty_count: rows.length - filled };
}

async function formStateLens(page) {
  if (!page || typeof page.evaluate !== 'function') return null;
  try {
    return await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const type = String((el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
      if (tag !== 'textarea' && (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit' || type === 'hidden')) return null;
      const len = typeof el.value === 'string' ? el.value.length : 0;
      return { hasValue: len > 0, len };
    }).filter(Boolean));
  } catch (_) {
    return null;
  }
}

// Q5 probe-readback: read the ACTUAL field value at (x,y) after a fill.
// Returns {tag, value} from the live DOM, or null when unreadable.
// Verification must quote THIS, never the requested string (self-report ban).
async function readInputValue(page, x, y) {
  if (!page || typeof page.evaluate !== 'function') return null;
  try {
    const r = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(Math.round(px), Math.round(py));
      if (!el) return null;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        const type = String((el.getAttribute && el.getAttribute('type')) || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio' || type === 'button' || type === 'submit' || type === 'hidden' || type === 'file') return null;
        return { tag, value: typeof el.value === 'string' ? el.value : null };
      }
      if (tag === 'select') return { tag, value: typeof el.value === 'string' ? el.value : null };
      const edit = el.closest && el.closest('[contenteditable="true"]');
      if (edit) return { tag: 'contenteditable', value: edit.innerText || null };
      return null;
    }, [x, y]);
    if (!r || typeof r.value !== 'string') return null;
    return r;
  } catch (_) {
    return null;
  }
}

function canonKeyName(v, allowed) {
  const t = String(v || '').trim().toLowerCase();
  return (allowed || []).find((k) => k.toLowerCase() === t) || null;
}

async function ensureMcpServices() {
  if (typeof module.exports.__testEnsure === 'function') return module.exports.__testEnsure();
  return ensureVisionServices({});
}

async function ensureMcpPage() {
  // R3-T9 P5: a closed tab (operator closed the window) must recreate, not hang.
  if (session.page) {
    let dead = false;
    try { dead = typeof session.page.isClosed === 'function' ? session.page.isClosed() : false; }
    catch (_) { dead = true; }
    if (!dead) return session.page;
    dropSessionBrowser();
    session.recreated = true;
  }
  if (module.exports.__testPage) { session.page = module.exports.__testPage; return session.page; }
  const { chromium } = require('playwright');
  // R3-T9: launch timeout so a wedged Chromium (stale profile lock, GPU
  // contention) surfaces as an error instead of hanging the tool forever.
  const browser = await chromium.launch({ headless: !VISION_HEADED, slowMo: VISION_HEADED ? 300 : 0, timeout: 90000 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  session.browser = browser; session.context = context; session.page = page;
  return page;
}

async function processMcpImage(imagePath) {
  if (typeof module.exports.__testProcess === 'function') return module.exports.__testProcess(imagePath);
  return postJSON(`${SVC.gateway}/vision/process`, { image_path: imagePath }, 120000);
}

async function shotCurrentPage(page, tag) {
  if (typeof module.exports.__testShotPath === 'string') return module.exports.__testShotPath;
  const fs = require('fs'); const os = require('os'); const p = require('path');
  const dir = p.join(os.tmpdir(), 'mcp-act');
  fs.mkdirSync(dir, { recursive: true });
  const abs = p.join(dir, `${tag}_${Date.now()}.png`);
  // R3-T9: screenshots can hang when the renderer stalls under load.
  await withTimeout(page.screenshot({ path: abs }), 60000, 'screenshot');
  return abs;
}

function currentUrlOf(page) {
  try {
    if (page && typeof page.url === 'function') return page.url();
    if (page && typeof page.url === 'string') return page.url;
  } catch { /* fall through */ }
  return session.lastUrl || null;
}

// H1 perceive-nonav: trailing-slash/case tolerant URL compare (R5 rule).
function sameMcpUrl(a, b) {
  const norm = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b) && norm(a) !== '';
}

async function settleMcpPage(page) {
  try { await page.waitForLoadState('domcontentloaded', { timeout: 5000 }); } catch { /* optional */ }
  try {
    if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(500);
  } catch { /* optional */ }
}

function freshMcpCompact(vdom, fallbackUrl, shotAbs) {
  return {
    url: (vdom && vdom.source_url) || fallbackUrl || null,
    element_count: (vdom && (vdom.element_count ?? (vdom.elements || []).length)) ?? 0,
    page_text: (((vdom && vdom.raw && vdom.raw.full_text) || '')).slice(0, 800),
    elements: compactElements(vdom || { elements: [] }),
    screenshot: shotAbs,
  };
}

/**
 * Unified perceive (R3-T9 P1): drives the PERSISTENT session page to the URL
 * instead of a one-shot capture browser, so act-after-perceive just works.
 * Same compact shape as before (dual-way contract frozen) + `navigated` bool.
 * H1 perceive-nonav: NEVER re-navigate onto a loaded same-URL page — a
 * mid-form perceive (fill user, perceive, fill pass) must not wipe fills.
 * Navigate ONLY when the session page is blank, the URL differs, or the
 * caller passes navigate:true. Otherwise capture in place.
 */
async function handlePerceive(url, opts = {}) {
  const ensured = await ensureMcpServices().catch((e) => ({ ok: false, error: e.message }));
  if (!ensured || !ensured.ok) return toolError(`services failed to start: ${(ensured && ensured.error) || 'unknown'}`, 'local-services');
  session.svcHandle = ensured;
  if (!(await waitForServices(90000))) return servicesNotReadyResult();
  const page = await ensureMcpPage();
  const now = currentUrlOf(page);
  const blank = !now || now === 'about:blank';
  const navigated = Boolean(blank || (opts && opts.navigate === true) || !sameMcpUrl(now, url));
  if (navigated) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settleMcpPage(page);
  }
  const shotAbs = await shotCurrentPage(page, 'perceive');
  const vdom = await processMcpImage(shotAbs);
  const compact = {
    url: (vdom && vdom.source_url) || url,
    element_count: vdom.element_count ?? (vdom.elements || []).length,
    page_text: ((vdom.raw && vdom.raw.full_text) || '').slice(0, 800),
    elements: compactElements(vdom),
    screenshot: shotAbs,
    navigated,
  };
  appendHistory({ tool: 'perceive', url: compact.url, screenshot: shotAbs, at: new Date().toISOString() });
  session.lastDom = compact; session.lastScreenshot = shotAbs; session.lastUrl = compact.url;
  return textResult(compact);
}

async function handleAct(args = {}) {
  // K1 action-extensions batch1+2+3 (case-insensitive, canonical member).
  const K1_COORDLESS = ['scroll', 'key', 'press', 'wait', 'snapshot'];
  const K1_ALL = ['click', 'fill', 'scroll', 'navigate', 'key', 'submit', 'select', 'check', 'uncheck', 'hover', 'dblclick', 'right_click', 'press', 'wait', 'focus', 'clear', 'upload', 'drag', 'snapshot', 'selectOption'];
  const rawAction = String(args.action || '');
  const action = K1_ALL.find((a) => a.toLowerCase() === rawAction.toLowerCase()) || rawAction.toLowerCase();
  if (!K1_ALL.includes(action)) {
    return toolError(`act needs action in [${K1_ALL.join(', ')}], got "${args.action}"`, 'caller');
  }
  const dest = args.url || args.value || '';
  if (action === 'navigate') {
    if (!dest || !/^https?:\/\//.test(dest)) return toolError('act navigate needs {value|url} starting with http(s)', 'caller');
    const ensured = await ensureMcpServices().catch((e) => ({ ok: false, error: e.message }));
    if (!ensured || !ensured.ok) return toolError(`services failed to start: ${(ensured && ensured.error) || 'unknown'}`, 'local-services');
    session.svcHandle = ensured;
    if (!(await waitForServices(90000))) return servicesNotReadyResult();
    const page = await ensureMcpPage();
    const urlBefore = currentUrlOf(page);
    await page.goto(dest, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settleMcpPage(page);
    const shotAbs = await shotCurrentPage(page, 'act_navigate');
    const vdom = await processMcpImage(shotAbs);
    const compact = freshMcpCompact(vdom, dest, shotAbs);
    const verification = {
      method: compact.url && urlBefore && compact.url !== urlBefore ? 'url_change' : 'navigated',
      detail: `navigated to ${compact.url}`,
    };
    session.history.push({ tool: 'act', action, value: dest, url: compact.url, at: new Date().toISOString(), verification });
    session.lastDom = compact; session.lastScreenshot = shotAbs; session.lastUrl = compact.url;
    return textResult({ status: 'PASS', action, url_before: urlBefore, ...compact, verification });
  }
  // click / fill / scroll / key: validate before touching services (keeps offline protocol tests clean).
  const wantType = (args.target && args.target.type) || '';
  const wantText = (args.target && args.target.text) || '';
  const hasTarget = !!(String(wantType).trim() || String(wantText).trim());
  // T6: standalone key press (no target/coords needed) + fill submitKey passthrough.
  let keyPress = null;
  if (action === 'key') {
    keyPress = canonKeyName(args.value, KEY_PRESS_KEYS);
    if (!keyPress) return toolError('act key needs {value} one of Enter|Tab|Space', 'caller');
  }
  let submitKey = null;
  if (action === 'fill' && args.submitKey !== undefined) {
    submitKey = canonKeyName(args.submitKey, SUBMIT_KEYS);
    if (!submitKey) return toolError('act fill submitKey must be Enter|Tab', 'caller');
  }
  if (!hasTarget && !Number.isFinite(args.x) && !Number.isFinite(args.y) && !K1_COORDLESS.includes(action)) {
    return toolError('act click/fill/submit/select/check/uncheck/hover/dblclick/right_click/focus/clear/upload/drag/selectOption needs {target:{type,text}} or numeric {x,y}', 'caller');
  }
  if (action === 'fill' && args.value !== undefined && typeof args.value !== 'string') {
    return toolError('act fill needs string {value}', 'caller');
  }
  const ensured = await ensureMcpServices().catch((e) => ({ ok: false, error: e.message }));
  if (!ensured || !ensured.ok) return toolError(`services failed to start: ${(ensured && ensured.error) || 'unknown'}`, 'local-services');
  session.svcHandle = ensured;
  if (!(await waitForServices(90000))) return servicesNotReadyResult();
  const page = await ensureMcpPage();
  const urlBefore = currentUrlOf(page);
  // Live re-detection BEFORE acting (stale coordinates are never clicked).
  const beforeShot = await shotCurrentPage(page, 'act_before');
  const beforeVdom = await processMcpImage(beforeShot);
  const elementsFull = toFullElements(beforeVdom);
  let execX = args.x; let execY = args.y; let resolvedElement = null; let via = 'direct_coordinates';
  // K1 check/uncheck: live-read state (true/false/null-unresolved), surfaced
  // in verification below; null falls back to visual_state_change.
  let checkSeen = 'unread';
  if (hasTarget) {
    const r = resolveMcpTarget(elementsFull, wantType, wantText, args.x, args.y);
    if (!r.resolved) {
      const entry = { tool: 'act', action, ok: false, error: 'unresolved_target', reason: r.reason, at: new Date().toISOString() };
      appendHistory(entry);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'FAIL', action, error: 'unresolved_target', reason: r.reason,
            wanted: { type: String(wantType), text: String(wantText) },
            retryable: true,
            suggested_action: 'Call perceive again for a fresh element list, then pick type+text EXACTLY as shown (or navigate to the page first if the session is blank).',
          }),
        }],
        isError: true,
      };
    }
    resolvedElement = { id: r.element.id, type: r.element.type, text: r.element.text || '', conf: r.element.conf };
    via = r.via; execX = r.element.cx; execY = r.element.cy;
  }
  if (action === 'key') {
    await page.keyboard.press(keyPress);
  } else if (action === 'click' || action === 'fill') {
    if (!Number.isFinite(execX) || !Number.isFinite(execY)) {
      return toolError('act click/fill needs numeric coordinates after live re-detection', 'caller');
    }
    // H2 pre-submit guard: a click following fills with a totally empty
    // form aborts as value_lost (T10 empty-submit lesson) — never blind.
    if (action === 'click') {
      const hadFills = session.history.some((h) => h && h.tool === 'act' && h.action === 'fill' && h.ok === true);
      if (hadFills) {
        const lens = await formStateLens(page).catch(() => null);
        const total = lens ? summarizeFormState(lens).filled_len_total : null;
        if (total === 0) {
          const entry = { tool: 'act', action, ok: false, error: 'value_lost', reason: 'form empty after fills; submit aborted, refill and retry the fills', at: new Date().toISOString() };
          appendHistory(entry);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'FAIL', action, error: 'value_lost',
                reason: entry.reason, form_state: summarizeFormState(lens),
                retryable: true,
                suggested_action: 'Re-fill the form fields (values were lost, e.g. page reloaded), then click again.',
              }),
            }],
            isError: true,
          };
        }
      }
    }
    await page.mouse.click(execX, execY);
    if (action === 'fill') {
      try { await page.keyboard.press('Control+A'); } catch { /* optional */ }
      await page.keyboard.type(typeof args.value === 'string' ? args.value : 'test', { delay: 30 });
      if (submitKey) await page.keyboard.press(submitKey);
    }
  } else if (action === 'scroll') {
    await page.mouse.wheel(0, Number.isFinite(args.y) ? args.y : 600);
  } else if (action === 'hover' || action === 'dblclick' || action === 'press' || action === 'wait' || action === 'focus') {
    // K1 batch2 (vision-coords-only, one-per-step): hover moves only;
    // dblclick double-clicks; press sends any key string (open lane next to
    // key's canon set); wait sleeps value ms capped at 10s; focus clicks.
    if ((action === 'hover' || action === 'dblclick' || action === 'focus') &&
        (!Number.isFinite(execX) || !Number.isFinite(execY))) {
      return toolError('act hover/dblclick/focus needs numeric coordinates after live re-detection', 'caller');
    }
    if (action === 'hover') {
      await page.mouse.move(execX, execY);
    } else if (action === 'dblclick' || action === 'focus') {
      await page.mouse.click(execX, execY, action === 'dblclick' ? { clickCount: 2 } : {});
    } else if (action === 'press') {
      if (typeof args.value !== 'string' || !args.value) return toolError('act press needs string {value}', 'caller');
      await page.keyboard.press(args.value);
    } else if (action === 'wait') {
      const ms = Math.min(Math.max(Number(args.value) || 1000, 0), 10000);
      if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(ms);
      else await new Promise((r) => setTimeout(r, ms));
    }
  } else if (action === 'clear' || action === 'upload' || action === 'drag' || action === 'snapshot' || action === 'selectOption') {
    // K1 batch3 (vision-coords-only, one-per-step): clear selects-all +
    // deletes; upload sets files on the near file input (path in value);
    // drag moves held cursor to absolute "x2,y2" in value; snapshot captures;
    // selectOption sets a native select by option text/value + change events.
    if (action !== 'snapshot' && (!Number.isFinite(execX) || !Number.isFinite(execY))) {
      return toolError('act clear/upload/drag/selectOption needs numeric coordinates after live re-detection', 'caller');
    }
    if (action === 'clear') {
      await page.mouse.click(execX, execY);
      try { await page.keyboard.press('Control+A'); } catch { /* optional */ }
      await page.keyboard.press('Backspace');
    } else if (action === 'upload') {
      if (typeof args.value !== 'string' || !args.value) return toolError('act upload needs {value} file path', 'caller');
      const handle = (typeof page.evaluateHandle === 'function')
        ? await page.evaluateHandle(([x, y]) => {
          const el = document.elementFromPoint(Math.round(x), Math.round(y));
          if (!el) return null;
          if (el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'file') return el;
          const scope = (el.closest && el.closest('form,li,div')) || document;
          return scope.querySelector('input[type="file"]');
        }, [execX, execY]).catch(() => null)
        : null;
      const input = handle && typeof handle.asElement === 'function' ? handle.asElement() : null;
      if (!input || typeof input.setInputFiles !== 'function') {
        return toolError('act upload found no file input near coordinates', 'caller');
      }
      await input.setInputFiles(args.value);
    } else if (action === 'drag') {
      const m = /^(\d+)\s*,\s*(\d+)$/.exec(String(args.value || ''));
      if (!m) return toolError('act drag needs {value} "x2,y2"', 'caller');
      await page.mouse.move(execX, execY);
      await page.mouse.down();
      await page.mouse.move(Number(m[1]), Number(m[2]), { steps: 8 });
      await page.mouse.up();
    } else if (action === 'snapshot') {
      await page.screenshot();
    } else if (action === 'selectOption') {
      if (typeof args.value !== 'string' || !args.value) return toolError('act selectOption needs {value} option text', 'caller');
      const ok = await page.evaluate(([x, y, want]) => {
        const el = document.elementFromPoint(Math.round(x), Math.round(y));
        if (!el) return false;
        const sel = el.tagName === 'SELECT' ? el
          : ((el.closest && el.closest('div,form,li')) || document).querySelector('select');
        if (!sel) return false;
        const hit = [...sel.options].find((o) => o.value === want || (o.text || '').trim() === String(want).trim());
        if (!hit) return false;
        sel.value = hit.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }, [execX, execY, args.value]).catch(() => false);
      if (!ok) return toolError('act selectOption found no matching option', 'caller');
    }
  } else if (action === 'submit' || action === 'select' || action === 'check' || action === 'uncheck') {
    // K1 batch1 (vision-coords-only, one-per-step): submit clicks + Enter;
    // select opens, types the option, confirms; check/uncheck click ONLY
    // when the live-checked state differs (state read, never blind toggle).
    if (!Number.isFinite(execX) || !Number.isFinite(execY)) {
      return toolError('act submit/select/check/uncheck needs numeric coordinates after live re-detection', 'caller');
    }
    if (action === 'submit') {
      await page.mouse.click(execX, execY);
      await page.keyboard.press('Enter');
    } else if (action === 'select') {
      await page.mouse.click(execX, execY);
      if (typeof args.value === 'string' && args.value) {
        await page.keyboard.type(args.value, { delay: 30 });
      }
      await page.keyboard.press('Enter');
    } else {
      // K1 check/uncheck: click ONLY when the live-checked state differs.
      const want = action === 'check';
      const st = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(Math.round(x), Math.round(y));
        if (!el) return null;
        let ctrl = null;
        if (el.tagName === 'INPUT' && /checkbox|radio/i.test(el.getAttribute('type') || '')) ctrl = el;
        else if (el.tagName === 'LABEL' && el.control) ctrl = el.control;
        else { const scope = (el.closest && el.closest('li')) || document; ctrl = scope.querySelector('input[type="checkbox"],input[type="radio"]'); }
        return ctrl ? !!ctrl.checked : null;
      }, [execX, execY]).catch(() => null);
      if (st === null || st !== want) await page.mouse.click(execX, execY);
      checkSeen = st;
    }
  } else if (action === 'right_click') {
    // L1 real right-click (never click-mapped): context menu opens at coords;
    // the fresh re-detect below observes it (menu items land in the vdom).
    if (!Number.isFinite(execX) || !Number.isFinite(execY)) {
      return toolError('act right_click needs numeric coordinates after live re-detection', 'caller');
    }
    await page.mouse.click(execX, execY, { button: 'right' });
  }
  await settleMcpPage(page);
  const afterShot = await shotCurrentPage(page, `act_after_${action}`);
  const afterVdom = await processMcpImage(afterShot);
  const compact = freshMcpCompact(afterVdom, currentUrlOf(page) || urlBefore, afterShot);
  let verification;
  if (compact.url && urlBefore && compact.url !== urlBefore) {
    verification = { method: 'url_change', detail: `navigated to ${compact.url}` };
  } else if (action === 'fill') {
    // Q5: input_value MUST be a DOM probe-readback, never the requested echo.
    const want = typeof args.value === 'string' ? args.value : 'test';
    const probed = await readInputValue(page, execX, execY).catch(() => null);
    verification = probed
      ? { method: 'input_value', readback: probed.value, matched: probed.value === want, detail: `field holds "${String(probed.value).slice(0, 40)}" (wanted "${want.slice(0, 40)}")` }
      : { method: 'input_value', readback: null, matched: null, detail: 'fill typed but value unreadable (no DOM probe)' };
  } else if ((action === 'check' || action === 'uncheck') && typeof checkSeen === 'boolean') {
    verification = { method: 'checked_stateDesired', detail: `checkbox/radio read ${checkSeen}, want ${action === 'check'} (clicked=${checkSeen !== (action === 'check')})` };
  } else {
    verification = { method: 'visual_state_change', detail: `elements=${compact.element_count}` };
  }
  const stalePrevented = hasTarget && (execX !== args.x || execY !== args.y);
  appendHistory({
    tool: 'act', action, ok: true, at: new Date().toISOString(),
    resolved_element: resolvedElement, resolution_via: hasTarget ? via : null,
    key: keyPress, submit_key: submitKey,
    stale_coordinates_prevented: stalePrevented, verification, url: compact.url,
  });
  session.lastDom = compact; session.lastScreenshot = afterShot; session.lastUrl = compact.url;
  const recreated = session.recreated === true;
  session.recreated = false;
  // H2: fill replies carry a values-free form_state lens (lengths only).
  let formState = null;
  if (action === 'fill') {
    const lens = await formStateLens(page).catch(() => null);
    if (lens) formState = summarizeFormState(lens);
  }
  return textResult({
    status: 'PASS', action, resolved_element: resolvedElement, resolution_via: hasTarget ? via : null,
    key: keyPress, submit_key: submitKey,
    stale_coordinates_prevented: stalePrevented, session_recreated: recreated, ...compact, verification,
    ...(formState ? { form_state: formState, dom_assist: 'observe' } : {}),
  });
}

function handleEvidence() {
  const shots = [];
  for (const h of session.history) {
    if (h && (h.screenshot || h.url === undefined)) { /* history-driven */ }
    if (h && h.screenshot) shots.push(h.screenshot);
  }
  if (session.lastScreenshot && !shots.includes(session.lastScreenshot)) shots.unshift(session.lastScreenshot);
  return textResult({ screenshots: shots, history: session.history, count: session.history.length, url: session.lastUrl });
}

async function handleReset() {
  const errs = [];
  // R3-T9 P5: each close is time-boxed so a dead browser cannot hang reset.
  const closeSoon = async (obj, kind) => {
    try {
      if (obj && typeof obj.close === 'function') {
        await Promise.race([obj.close(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${kind} close timeout`)), 8000))]);
      }
    } catch (e) { errs.push(e.message); }
  };
  await closeSoon(session.page, 'page');
  await closeSoon(session.context, 'context');
  await closeSoon(session.browser, 'browser');
  dropSessionBrowser();
  session.lastDom = null; session.lastScreenshot = null; session.lastUrl = null;
  session.history = [];
  // Services stay up: session.svcHandle is kept, nothing shut down.
  return textResult({ reset: true, services: 'up', errors: errs });
}

async function getJSON(url, timeoutMs = 5000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function postJSON(url, body, timeoutMs = 120000) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

function compactElements(vdom) {
  return (vdom.elements || []).slice(0, 60).map((el) => ({
    id: el.id,
    type: el.type,
    text: (el.text || '').slice(0, 80),
    center: {
      x: Math.round((el.bbox.x1 + el.bbox.x2) / 2),
      y: Math.round((el.bbox.y1 + el.bbox.y2) / 2),
    },
    conf: typeof el.confidence?.yolo === 'number' ? Number(el.confidence.yolo.toFixed(2)) : null,
  }));
}

// ---------------------------------------------------------------------------
// Tools (schemas are FINAL — R3-T5 builder implements act/evidence/reset)
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'status',
    description: 'Health of local vision services (gateway/yolo/ocr/merge/browser). No browser launched.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'perceive',
    description: 'Capture the persistent headed session (YOLO+OCR+merge, compact visual DOM, SAME shape as the API path + navigated bool). Navigates ONLY when the session is blank, the URL differs, or navigate:true — NEVER re-navigates mid-form (perceiving the same URL preserves fills). Later act calls continue on this same page. Spawns + waits for services automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http(s) URL to perceive' },
        navigate: { type: 'boolean', description: 'force navigation even when the URL is already loaded' },
      },
      required: ['url'],
    },
  },
  {
    name: 'act',
    description: 'Execute ONE grounded action in the persistent session and return the fresh visual DOM. Targets are re-detected live; stale coordinates are never clicked. key presses Enter|Tab|Space on the focused element; fill accepts optional submitKey Enter|Tab. Failures are structured (retryable + suggested_action). Calls time out at 4 minutes, never hang.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['click', 'fill', 'scroll', 'navigate', 'key', 'submit', 'select', 'check', 'uncheck', 'hover', 'dblclick', 'right_click', 'press', 'wait', 'focus', 'clear', 'upload', 'drag', 'snapshot', 'selectOption'] },
        x: { type: ['number', 'null'] },
        y: { type: ['number', 'null'] },
        value: { type: 'string' },
        submitKey: { type: 'string', enum: ['Enter', 'Tab'] },
        target: {
          type: 'object',
          properties: { type: { type: 'string' }, text: { type: 'string' } },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'evidence',
    description: 'Return screenshot paths + step history of the current session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'reset',
    description: 'Close the persistent session (browser + history). Services stay up.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function textResult(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}
function toolError(message, lane) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message, lane }) }], isError: true };
}

async function callTool(name, args = {}) {
  if (name === 'status') {
    const checks = {
      gateway: await getJSON(`${SVC.gateway}/vision/health`),
      yolo: await getJSON(`${SVC.yolo}/health`),
      ocr: await getJSON(`${SVC.ocr}/health`),
      merge: await getJSON(`${SVC.merge}/health`),
      browser: await getJSON(`${SVC.browser}/health`),
    };
    const out = {};
    for (const [k, v] of Object.entries(checks)) out[k] = v ? 'healthy' : 'down';
    return textResult({ services: out, headed_default: VISION_HEADED, server: `${SERVER_NAME}@${SERVER_VERSION}` });
  }
  if (name === 'perceive') {
    const url = args.url;
    if (!url || !/^https?:\/\//.test(url)) return toolError('perceive needs {url} starting with http(s)', 'caller');
    try {
      return await withTimeout(handlePerceive(url, { navigate: args.navigate === true }), 240000, 'perceive');
    } catch (e) {
      return String(e && e.message).startsWith('timeout:') ? timeoutResult('perceive') : toolError(e.message || 'perceive failed', 'local-services');
    }
  }
  if (name === 'act') {
    try {
      return await withTimeout(handleAct(args), 240000, 'act');
    } catch (e) {
      return String(e && e.message).startsWith('timeout:') ? timeoutResult('act') : toolError(e.message || 'act failed', 'local-services');
    }
  }
  if (name === 'evidence') return handleEvidence();
  if (name === 'reset') return handleReset();
  const e = new Error(`Unknown tool: ${name}`);
  e.code = -32601;
  throw e;
}

// ---------------------------------------------------------------------------
// NDJSON JSON-RPC loop
// ---------------------------------------------------------------------------
function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

let buffer = '';
// stdio loop runs only when spawned as the server process; direct require()
// (injected-fake unit tests) must not hold the test event loop open.
if (require.main === module) {
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    handleLine(line).catch((e) => {
      try {
        const id = JSON.parse(line).id ?? null;
        replyError(id, -32603, `Internal error: ${e.message}`);
      } catch { /* unparseable input: nothing to reply to */ }
    });
  }
});
}

/**
 * Pure dispatch (R3-T13): same routing as the stdio loop, but returns the
 * response object instead of writing it. handleLine (stdio) and the HTTP
 * transport both go through here — one routing table, two carriers.
 * Returns undefined for notifications (no reply).
 */
async function dispatchMessage(msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    const asked = params && params.protocolVersion;
    const negotiated = KNOWN_PROTOCOLS.includes(asked) ? asked : KNOWN_PROTOCOLS[KNOWN_PROTOCOLS.length - 1];
    return ok({
      protocolVersion: negotiated,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const result = await callTool(params && params.name, (params && params.arguments) || {});
      return ok(result);
    } catch (e) {
      return fail(e.code || -32603, e.message || 'tool failed');
    }
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) return undefined; // no reply
  return fail(-32601, `Method not found: ${method}`);
}

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; } // ignore non-JSON lines
  const resp = await dispatchMessage(msg);
  if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
}

async function shutdown() {
  try { await shutdownVisionServices(session.svcHandle); } catch { /* best effort */ }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Streamable-HTTP fallback transport (R3-T13, additive).
// Default stays stdio: HTTP starts ONLY with `--transport http` as a spawned
// server process (never on require, so unit tests stay offline-safe).
// POST /mcp accepts a single JSON-RPC {jsonrpc,id,method,params} object and
// returns the reply object. Localhost only; default port 5123.
// ---------------------------------------------------------------------------
function httpTransportRequested(argv) {
  const args = argv || [];
  const i = args.indexOf('--transport');
  if (i >= 0 && args[i + 1] === 'http') return true;
  return args.some((a) => a === '--transport=http');
}
const HTTP_TRANSPORT = httpTransportRequested(process.argv);
const HTTP_PORT = Number(process.env.MCP_HTTP_PORT) || 5123;
const HTTP_BODY_LIMIT = 1024 * 1024;

function startHttpTransport() {
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, server: `${SERVER_NAME}@${SERVER_VERSION}`, transport: 'http' }));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32601, message: 'Use POST /mcp' } }));
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= HTTP_BODY_LIMIT) chunks.push(c);
    });
    req.on('end', async () => {
      if (size > HTTP_BODY_LIMIT) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Body too large' } }));
        return;
      }
      let msg;
      try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: (msg && msg.id) ?? null, error: { code: -32600, message: 'Invalid Request' } }));
        return;
      }
      try {
        const resp = await dispatchMessage(msg);
        // Notifications (no reply) surface as 202 + null body on HTTP.
        if (!resp) {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end('null');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resp));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32603, message: e.message || 'Internal error' } }));
      }
    });
  });
  server.listen(HTTP_PORT, '127.0.0.1', () => {
    process.stderr.write(`[mcp] HTTP transport on http://127.0.0.1:${HTTP_PORT}/mcp\n`);
  });
  return server;
}
if (require.main === module && HTTP_TRANSPORT) {
  startHttpTransport();
}
if (require.main === module) {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { SERVER_NAME, SERVER_VERSION, TOOLS, callTool, session, resolveMcpTarget, toFullElements, dispatchMessage, summarizeFormState, formStateLens, readInputValue };
