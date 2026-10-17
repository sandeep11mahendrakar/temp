'use strict';

// vision/zoo/conformance.js — G2z zoo conformance (classify-only, DO-NOT-fix).
// Loads vision/zoo/truth/*.truth.json (16), drives each TC through the REAL
// executor CLI (node src/executeTests.js — the file W3 froze is never edited,
// runTestCase is not imported) with SEEDED steps and DOM-seeded perception:
// vision YOLO weights are absent, so <runId>_visual_dom.json is built from
// the live DOM (conf.yolo=0.5, disclosed) and every strength is read from
// the executor's own result.oracle/verification_strength — never invented.
// Headed serial run. Writes results JSON; prints per-TC + per-class tables.
// Pure helpers (actionClass, aggregateRows, expectHit) are unit-tested
// no-browser in vision/test/zoo.conformance.test.js.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const ZOO = __dirname;
const TRUTH_DIR = path.join(ZOO, 'truth');
const OUT = path.join(ROOT, 'vision', 'storage', 'outputs');
const FIXTURE = path.join(ZOO, 'fixtures', 'zoo-sample.txt');

const CLASS_OF = {
  click: 'pointer', hover: 'pointer', dblclick: 'pointer', right_click: 'pointer', drag: 'pointer',
  fill: 'value', select: 'value', check: 'value', uncheck: 'value', clear: 'value', upload: 'value', selectOption: 'value',
  press: 'key', wait: 'key', focus: 'key', submit: 'key', key: 'key',
  navigate: 'nav',
  scroll: 'system', snapshot: 'system', done: 'system', 'read-text': 'system',
};

function actionClass(action) {
  return CLASS_OF[String(action)] || 'other';
}

function expectHit(expect, text) {
  try { return new RegExp(String(expect).slice(0, 120), 'i').test(String(text)); }
  catch (_) { return String(text).toLowerCase().includes(String(expect).slice(0, 120).toLowerCase()); }
}

// Pure: aggregate per-TC rows into per-class {tcs, pass, pass_rate}.
function aggregateRows(rows) {
  const byClass = {};
  for (const r of rows) {
    const c = r.action_class || 'other';
    byClass[c] = byClass[c] || { action_class: c, tcs: 0, pass: 0 };
    byClass[c].tcs += 1;
    if (r.verdict === 'PASS') byClass[c].pass += 1;
  }
  return Object.values(byClass).map((a) => ({ ...a, pass_rate: a.tcs ? Number((a.pass / a.tcs).toFixed(3)) : 0 }));
}

function loadTruths() {
  return fs.readdirSync(TRUTH_DIR).filter((f) => f.endsWith('.truth.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(TRUTH_DIR, f), 'utf8')));
}

// Seed query shared by the seeder: visible actionable elements with labels.
const SEED_JS = `(() => {
  const out = [];
  const els = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"]')];
  const mapType = (el) => {
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'INPUT') {
      const t = String(el.getAttribute('type') || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radiobox';
      if (t === 'file') return 'file';
      if (t === 'password') return 'password';
      return 'text_input';
    }
    return ({ BUTTON: 'button', A: 'link', SELECT: 'select', TEXTAREA: 'text_input' })[tag] || 'button';
  };
  const labelOf = (el) => {
    const id = el.getAttribute('id');
    if (id) { const lb = document.querySelector('label[for="' + id + '"]'); if (lb && lb.innerText.trim()) return lb.innerText.trim(); }
    if (el.innerText && el.innerText.trim()) return el.innerText.trim().slice(0, 80);
    return el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('id') || el.tagName;
  };
  let i = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) continue;
    i += 1;
    out.push({ key: (el.getAttribute('id') ? '#' + el.getAttribute('id') : null), type: mapType(el), text: labelOf(el),
      x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height });
  }
  return out;
})()`;

// Containers (W3 ENTRY-8): the seed pool above covers only native controls, so
// drag sources/targets that are plain <div>s (#drag-src / #drop-zone) are
// absent. This SECOND index captures non-control elements (by id / draggable)
// for DRAG-STEP resolution ONLY; the main pool (els/vdom/byKey) is unchanged
// => zero regression for the other 15 TCs.
const CONTAINERS_JS = `(() => {
  const MAIN = new Set(['BUTTON','A','INPUT','SELECT','TEXTAREA']);
  const out = [];
  for (const el of document.querySelectorAll('[id],[draggable="true"]')) {
    if (MAIN.has(el.tagName.toUpperCase())) continue;
    if (el.getAttribute('role') === 'button') continue;
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) continue;
    const t = (el.innerText || el.textContent || '').trim().slice(0, 80);
    if (!t) continue;
    out.push({ key: el.getAttribute('id') ? '#' + el.getAttribute('id') : null, type: 'container', text: t,
      x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y + r.height });
  }
  return out;
})()`;

// Seed one page: query DOM (headless), write <runId>_visual_dom.json,
// return selector-keyed centers+labels for step translation.
async function seedPage(pw, base, slug, runId) {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(800);
    const els = await page.evaluate(SEED_JS);
    const vdom = {
      source_url: `${base}/${slug}`,
      element_count: els.length,
      screenshots: { initial: null },
      raw: { ocr_words_found: null },
      elements: els.map((e, i) => ({
        id: `dom${i + 1}`, type: e.type, text: e.text, confidence: { yolo: 0.5 },
        bbox: { x1: Math.round(e.x1), y1: Math.round(e.y1), x2: Math.round(e.x2), y2: Math.round(e.y2) },
        synth: null,
      })),
    };
    fs.writeFileSync(path.join(OUT, `${runId}_visual_dom.json`), JSON.stringify(vdom));
    const byKey = {};
    for (const e of els) if (e.key) byKey[e.key] = e;
    let containers = [];
    try { containers = await page.evaluate(CONTAINERS_JS); } catch (_) { containers = []; }
    return { byKey, containers };
  } finally { await browser.close().catch(() => {}); }
}

function translateSteps(truth, byKey, containers) {
  const steps = [];
  const notes = [];
  const pool = Object.values(byKey || {});
  const cont = Array.isArray(containers) ? containers : [];
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  // DRAG-ONLY container fallback (main pool untouched => no regression).
  const resolveInContainers = (t) => {
    if (!t || typeof t !== 'object' || !t.text) return null;
    const want = norm(t.text);
    const hit = cont.find((e) => { const et = norm(e.text); return et && (et.includes(want) || want.includes(et)); });
    if (!hit) return null;
    return { type: t.type || 'container', text: hit.text, x: Math.round((hit.x1 + hit.x2) / 2), y: Math.round((hit.y1 + hit.y2) / 2), via: 'container' };
  };
  // F-S per-contract: resolve a {type,text} target (or legacy '#selector')
  // to a DOM center for needCoords actions + pool text_match.
  const resolve = (t) => {
    if (t && typeof t === 'object' && t.text) {
      const want = norm(t.text);
      const hit = pool.find((e) => { const et = norm(e.text); return et && (et.includes(want) || want.includes(et)); });
      if (hit) return { type: t.type || hit.type, text: hit.text, x: Math.round((hit.x1 + hit.x2) / 2), y: Math.round((hit.y1 + hit.y2) / 2), via: 'text' };
      return { type: t.type || 'input', text: t.text, via: 'target-only' };
    }
    const sel = String(t || '');
    const hit = (byKey || {})[sel];
    if (!hit) return null;
    return { type: hit.type, text: hit.text, x: Math.round((hit.x1 + hit.x2) / 2), y: Math.round((hit.y1 + hit.y2) / 2), via: 'selector' };
  };
  for (const s of truth.steps) {
    if (s.action === 'read-text') { notes.push('read-text-dropped:observe-only'); continue; }
    if (s.target && typeof s.target === 'object' && s.target.text && String(s.target.text).includes('>>>')) {
      steps.push({ action: s.action, target: { type: 'input', text: 'shadow-user' }, value: s.value });
      notes.push('shadow:target-unresolvable');
      continue;
    }
    let r = resolve(s.target);
    if (s.action === 'drag' && (!r || r.x === undefined)) { const rc = resolveInContainers(s.target); if (rc) r = rc; }
    if (!r) { steps.push({ action: s.action, target: { type: 'input', text: String(s.target).replace(/^#/, '') }, value: s.value }); notes.push(`unseeded:${s.target}`); continue; }
    const st = { action: s.action, target: { type: r.type, text: r.text }, value: s.value };
    if (r.x !== undefined) { st.x = r.x; st.y = r.y; }
    if (r.via === 'target-only') notes.push(`target-only:${s.target && s.target.text ? s.target.text : s.target}`);
    if (s.action === 'drag') {
      // D1 (W3) added native drag destinations. Forward the destination
      // natively: to{x,y} coords (D1 priority #1) when resolvable, else
      // to{type,text} for D1 to resolve against its pool. Container index
      // (CONTAINERS_JS) covers div sources/targets the main pool misses.
      // Legacy value "x2,y2" kept as back-compat fallback.
      let to = (s.to && typeof s.to === 'object' && s.to.text) ? resolve(s.to) : null;
      if (to && to.x === undefined) { const tc = resolveInContainers(s.to); if (tc) to = tc; }
      if (to && to.x !== undefined) { st.to = { x: to.x, y: to.y }; st.value = `${to.x},${to.y}`; st.translated = 'drag-to->x2y2'; }
      else if (s.to && typeof s.to === 'object' && s.to.text) { st.to = { type: s.to.type, text: s.to.text }; st.translated = 'drag-to->native-text'; }
      else { st.translated = 'drag-untranslated:executor-needs-x2y2'; }
    }
    if (s.action === 'upload') { st.value = FIXTURE; st.translated = 'upload-value->fixture-abs-path'; }
    steps.push(st);
  }
  return { steps, notes };
}

function classifyResult(truth, rep, notes) {
  const r = rep && rep.results && rep.results[0];
  const row = {
    tc_id: truth.tc_id,
    action_class: actionClass(truth.steps[0] && truth.steps[0].action),
    verdict: 'FAIL', app_outcome: (r && r.oracle && r.oracle.app_outcome) || 'n/a',
    verification_strength: (r && r.verification_strength) || 'NONE',
    failure_cause: null,
  };
  if (!r) { row.failure_cause = 'no-rep:cli-error'; return row; }
  if (r.status === 'ERROR') { row.failure_cause = `executor-error:${String(r.failure_reason || '').slice(0, 80)}`; return row; }
  if (r.status !== 'PASS') { row.failure_cause = `executor:${String(r.failure_reason || r.status).slice(0, 80)}`; return row; }
  const ov = r.oracle && r.oracle.verdict;
  if (ov === 'PASS') { row.verdict = 'PASS'; return row; }
  if (ov === 'OBSERVED') { row.failure_cause = `oracle-observed:${(r.oracle.snip300 || '').slice(0, 60)}`; return row; }
  row.failure_cause = `oracle-miss:${truth.expected.expect.slice(0, 60)}`;
  return row;
}

async function main() {
  const variantArg = (process.argv.find((a) => a.startsWith('--variant=')) || '').split('=')[1] || null;
  const variantDir = variantArg === 'real' ? path.join(ROOT, 'vision', 'zoo-variant-real') : null;
  const resultsName = variantArg === 'real' ? 'g2z_results_real.json' : 'g2z_results.json';
  if (variantArg && !variantDir) throw new Error(`unknown variant ${variantArg}`);
  const pw = require('../node_modules/playwright');
  const truths = loadTruths();
  if (truths.length !== 16) throw new Error(`G2z needs 16 truth files, found ${truths.length}`);
  const { server, port } = await new Promise((resolve, reject) => {
    // Zoo runs in its OWN process: the executor CLI below blocks on
    // execSync, which would starve an in-process server (single-threaded
    // event loop) and time out every page.goto. No new windows: plain
    // headless HTTP server process, killed in finally.
    const { spawn } = require('node:child_process');
    const zooProc = spawn('node', [path.join(ZOO, 'serve.js'), '5010'], { cwd: ROOT, env: { ...process.env, ...(variantDir ? { ZOO_ROOT: variantDir } : {}) } });
    const timer = setTimeout(() => { try { zooProc.kill(); } catch (_) {} reject(new Error('zoo serve.js did not print READY')); }, 15000);
    let buf = '';
    zooProc.stdout.on('data', (d) => {
      buf += String(d);
      const m = /READY (\d+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve({ server: zooProc, port: Number(m[1]) }); }
    });
    zooProc.on('error', (e) => { clearTimeout(timer); reject(e); });
    zooProc.on('exit', (c) => { clearTimeout(timer); reject(new Error(`zoo serve.js exited ${c}: ${buf.slice(0, 200)}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const rows = [];
  try {
    for (const truth of truths) {
      const slug = truth.tc_id.replace(/^zoo-/, '');
      const ts = Date.now();
      const runId = `run_${ts}`;
      let byKey = {};
      let containers = [];
      try { const seeded = await seedPage(pw, base, slug, runId); byKey = seeded.byKey; containers = seeded.containers; }
      catch (e) {
        rows.push({ tc_id: truth.tc_id, action_class: actionClass(truth.steps[0] && truth.steps[0].action), verdict: 'PENDING', app_outcome: 'n/a', verification_strength: 'NONE', failure_cause: `page-2x:seed-failed:${String(e.message).slice(0, 60)}` });
        continue;
      }
      const { steps, notes } = translateSteps(truth, byKey, containers);
      const caseFile = path.join(OUT, `g2z_${slug}_${runId}.json`);
      const repFile = path.join(OUT, `g2z_rep_${slug}_${runId}.json`);
      fs.writeFileSync(caseFile, JSON.stringify([{ id: truth.tc_id, objective: `G2z ${truth.tc_id} (seeded, no brain)`, expected_text: truth.expected.expect, steps }]));
      try {
        // Headless CLI: zero browser windows (boss directive: single
        // terminal only). VISION_HEADED=false also drops slowMo to 0.
        execSync(`node src/executeTests.js "${caseFile}" ${base}/${slug} "${repFile}"`, {
          cwd: path.join(ROOT, 'vision'), timeout: 300000, stdio: 'pipe',
          env: { ...process.env, VISION_HEADED: 'false' },
        });
      } catch (e) { /* rep lands FAIL/ERROR; classify from whatever exists */ }
      let rep = null;
      try { rep = JSON.parse(fs.readFileSync(repFile, 'utf8')); } catch (_) { /* no rep */ }
      const row = classifyResult(truth, rep, notes);
      row.notes = notes;
      rows.push(row);
      console.log(`${row.tc_id}: ${row.verdict} [${row.action_class}] strength=${row.verification_strength} cause=${row.failure_cause || '-'}`);
    }
  } finally { try { server.kill(); } catch (_) {} }
  const agg = aggregateRows(rows);
  const pass = rows.filter((r) => r.verdict === 'PASS').length;
  const out = {
    ts: new Date().toISOString(), api_calls: 0, autonomy: 'ASSISTED', brain: 'none-seeded-steps',
    seeded_perception: 'dom-derived visual_dom (conf.yolo=0.5, disclosed); vision weights absent',
    pass: `${pass}/${rows.length}`, rows, per_class: agg,
    note: 'classify-only: no page/truth/executor file was modified by this run',
  };
  const outPath = path.join(OUT, resultsName);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`G2Z ${pass}/${rows.length} results=${outPath}`);
  return out;
}

if (require.main === module) {
  if (process.argv.includes('--control')) {
    controlMain().then(() => process.exit(0)).catch((e) => { console.error('CONTROL-FAIL ' + e.message); process.exit(1); });
  } else {
    main().then(() => process.exit(0)).catch((e) => { console.error('G2Z-FAIL ' + e.message); process.exit(1); });
  }
}

// C1 control run: skip-action observe-only. Loads each truth page, performs
// ZERO actions, checks the expect against the untouched page text.
// Expectation: NOT-pass all 16 (a control PASS means the truth expect is
// satisfiable without acting => zoo-truth/oracle-fix required, reported
// never silent-fixed here).
async function controlMain() {
  const zoo = require('./server');
  const pw = require('../node_modules/playwright');
  const truths = loadTruths();
  const { server, port } = await new Promise((resolve, reject) => {
    const { spawn } = require('node:child_process');
    const zooProc = spawn('node', [path.join(ZOO, 'serve.js'), '5010'], { cwd: ROOT });
    const timer = setTimeout(() => { try { zooProc.kill(); } catch (_) {} reject(new Error('zoo serve.js did not print READY')); }, 15000);
    let buf = '';
    zooProc.stdout.on('data', (d) => {
      buf += String(d);
      const m = /READY (\d+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve({ server: zooProc, port: Number(m[1]) }); }
    });
    zooProc.on('error', (e) => { clearTimeout(timer); reject(e); });
    zooProc.on('exit', (c) => { clearTimeout(timer); reject(new Error(`zoo serve.js exited ${c}`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const browser = await pw.chromium.launch({ headless: true });
  const rows = [];
  try {
    const page = await browser.newPage();
    for (const truth of truths) {
      const slug = truth.tc_id.replace(/^zoo-/, '');
      let text = '';
      try {
        await page.goto(`${base}/${slug}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(600);
        text = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 2000) : ''));
      } catch (e) { rows.push({ tc_id: truth.tc_id, control_result: 'LOAD-FAIL' }); continue; }
      rows.push({ tc_id: truth.tc_id, control_result: expectHit(truth.expected.expect, text) ? 'PASS' : 'NOT-pass' });
    }
  } finally { await browser.close().catch(() => {}); try { server.kill(); } catch (_) {} }
  const pass = rows.filter((r) => r.control_result === 'PASS').length;
  console.log(`CONTROL ${rows.length - pass}/${rows.length} NOT-pass (expect 16/16)`);
  for (const r of rows) console.log(`${r.tc_id}: control_result=${r.control_result}`);
  if (pass > 0) console.log('CONTROL-PASS-FOUND => zoo-truth/oracle-fix required for: ' + rows.filter((r) => r.control_result === 'PASS').map((r) => r.tc_id).join(' '));
  return rows;
}

module.exports = { actionClass, aggregateRows, expectHit, loadTruths, CLASS_OF, translateSteps };
