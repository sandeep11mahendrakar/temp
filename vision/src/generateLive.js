'use strict';

// GL1 (D37) — LIVE generate-conformance driver (W1 lane). This is the live
// wiring behind `runAuto --brain=api --generate=on`: for each zoo page it
// captures a coord-free vdom, runs brainGenerate on the gemini api transport,
// executes the generated TCs through the real executor CLI, and scores them
// with the GL0-frozen rule (generateMatch). LIVE: api_calls > 0; the caller
// holds the serial HOLDER. Playwright + the zoo server are required lazily so
// merely requiring this module never opens a browser.

const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawn } = require('node:child_process');
const { brainGenerate, compactVdom } = require('./brain');
const { geminiGenerate, resolveGeminiKey } = require('./brain');
const { scoreGenerated, matchRule } = require('./generateMatch');

const VISION = path.join(__dirname, '..');
const OUT = path.join(VISION, 'storage', 'outputs');
const PAGES = [
  'form-validate', 'select-check-radio', 'hover-menu',
  'dialogs', 'login-6users', 'paginate-sort-filter-search',
];
const GEN_CAP = 15;

// ---- pure helpers (offline-tested) ----------------------------------------
function perCallRow({ page, model, usage, finishReason, error } = {}) {
  const u = usage || {};
  const row = {
    page: page || null,
    model: model || null,
    promptTokenCount: Number.isFinite(u.promptTokenCount) ? u.promptTokenCount : null,
    candidatesTokenCount: Number.isFinite(u.candidatesTokenCount) ? u.candidatesTokenCount : null,
    thoughtsTokenCount: Number.isFinite(u.thoughtsTokenCount) ? u.thoughtsTokenCount : null,
    finishReason: finishReason || null,
  };
  if (typeof error === 'string' && error) row.error = error;
  return row;
}

// AUTONOMOUS(generate) iff blind-Y AND >=1 schema-valid generated set AND zero
// handshake/pre-authored. Anything else is downgraded (never upgraded).
function autonomyGenerateLabel({ blind = false, schemaValidSets = 0, handshake = false, preAuthored = false } = {}) {
  if (preAuthored || handshake) return 'ASSISTED(generate)';
  if (blind === true && schemaValidSets >= 1) return 'AUTONOMOUS(generate)';
  return 'AUTONOMY_NONBLIND(generate)';
}

function causeClassOf({ parseFail, status, oracleVerdict, unresolved, generated, auth } = {}) {
  if (auth) return 'auth-invalid';
  if (parseFail) return 'parse-fail';
  if (!generated) return 'no-generation';
  if (status === 'ERROR' || unresolved) return 'exec-unresolved';
  if (status !== 'PASS') return 'exec-fail';
  if (oracleVerdict && oracleVerdict !== 'PASS') return 'oracle-unsat';
  return null;
}

// ---- live driver -----------------------------------------------------------
function bootZoo(port) {
  const proc = spawn('node', [path.join('zoo', 'serve.js'), String(port)], { cwd: VISION });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { try { proc.kill(); } catch (_) {} reject(new Error('zoo serve did not print READY')); }, 15000);
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += String(d);
      const m = /READY (\d+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve({ proc, port: Number(m[1]) }); }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('exit', (c) => { clearTimeout(timer); reject(new Error(`zoo serve exited ${c}: ${buf.slice(0, 200)}`)); });
  });
}

async function capturePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const sel = 'button,a,input,select,textarea,h1,h2,[role="button"]';
    const elements = Array.from(document.querySelectorAll(sel)).map((el, i) => {
      const tag = el.tagName;
      let type = 'text';
      if (tag === 'INPUT') {
        const t = String(el.type || 'text').toLowerCase();
        type = t === 'checkbox' ? 'checkbox' : t === 'radio' ? 'radio' : t === 'password' ? 'password_input' : 'text_input';
      } else if (tag === 'SELECT') type = 'select';
      else if (tag === 'A') type = 'link';
      else if (tag === 'BUTTON') type = 'button';
      const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 80);
      return { id: el.id || ('anon' + i), type, text };
    }).filter((e) => e.text || e.type !== 'text');
    return { elements, bodyText: (document.body ? document.body.innerText : '').slice(0, 2000) };
  });
}

function truthOf(slug) {
  const f = path.join(VISION, 'zoo', 'truth', `${slug}.truth.json`);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; }
}

async function runGenerateLive(opts = {}) {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const pages = Array.isArray(o.pages) && o.pages.length ? o.pages : PAGES;
  const model = o.model || 'gemini-3.5-flash-lite';
  const cap = Number.isFinite(o.cap) ? o.cap : GEN_CAP;
  const port = Number.isFinite(o.port) ? o.port : 5010;
  const key = resolveGeminiKey(o); // throws if absent; never logged

  const boot = (typeof o.bootZoo === 'function') ? o.bootZoo : bootZoo;
  const { proc, port: p } = await boot(port);
  const base = `http://127.0.0.1:${p}`;
  const browserFactory = (typeof o.browserFactory === 'function') ? o.browserFactory : async () => {
    const pw = require(path.join(VISION, 'node_modules', 'playwright'));
    return pw.chromium.launch({ headless: true });
  };
  let browser = null;
  browser = await browserFactory();
  const calls = [];
  let usedCalls = 0;
  let blocked = null;
  const pageRows = [];
  try {
    const genImpl = (typeof o.geminiGenerate === 'function') ? o.geminiGenerate : geminiGenerate;
  const bpage = await browser.newPage();
    for (const slug of pages) {
      const truth = truthOf(slug);
      let cap0 = null;
      let gen = { tcs: [], parseFail: false, dropped: 0 };
      try {
        cap0 = await capturePage(bpage, `${base}/${slug}`);
        gen = await brainGenerate({
          archetypeScore: 0.0, // force generation (no archetype owns the page)
          elements: cap0.elements,
          goal: `zoo ${slug}`,
          cap,
          usedCalls,
          llmCall: async (prompt) => {
            usedCalls += 1;
            try {
              const out = await genImpl({ key, model, thinking: 'omit' }, prompt);
              calls.push(perCallRow({ page: slug, model, usage: out.usage, finishReason: out.finishReason }));
              return out.text;
            } catch (e) {
              const em = String((e && e.message) || e);
              calls.push(perCallRow({ page: slug, model, usage: null, finishReason: 'ERROR', error: em.slice(0, 200) }));
              throw e;
            }
          },
        });
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/401|invalid.*api.*key|unauthorized|API key not valid/i.test(msg)) { pageRows.push({ slug, blocked: 'invalid-key', error: msg.slice(0, 120) }); blocked = 'invalid-key'; break; }
        if (/429|quota/i.test(msg)) { blocked = 'quota'; break; }
        if (/LLM_CALL_CAP/.test(msg)) { blocked = 'cap'; break; }
        pageRows.push({ slug, blocked: 'error', error: msg.slice(0, 120) });
        continue;
      }
      // match generated TCs to the truth (page-scoped) for oracle judging.
      const tcs = gen.tcs || [];
      const matched = tcs.map((tc) => (truth && matchRule(tc, truth)) ? tc.id : null);
      const caseFile = path.join(OUT, `gl1_case_${slug}.json`);
      const repFile = path.join(OUT, `gl1_rep_${slug}.json`);
      const cases = tcs.map((tc) => {
        const hit = truth && matchRule(tc, truth);
        return {
          id: tc.id,
          objective: tc.objective,
          ...(hit ? { expected_text: truth.expected.expect, oracle: { kind: truth.expected.kind, expect: truth.expected.expect } } : {}),
          steps: tc.steps,
        };
      });
      fs.writeFileSync(caseFile, JSON.stringify(cases), 'utf8');
      if (cases.length) {
        try { fs.unlinkSync(repFile); } catch (_) { /* no stale report */ }
        try {
          execSync(`node src/executeTests.js "${caseFile}" ${base}/${slug} "${repFile}"`, {
            cwd: VISION, timeout: 180000, stdio: 'pipe',
            env: { ...process.env, VISION_HEADED: 'false' },
          });
        } catch (_) { /* rep lands FAIL/ERROR */ }
      }
      let rep = null;
      try { rep = JSON.parse(fs.readFileSync(repFile, 'utf8')); } catch (_) { rep = null; }
      const results = {};
      const rows = [];
      for (const r of (rep && rep.results) || []) {
        const steps = Array.isArray(r.steps_executed) ? r.steps_executed : (r.steps || []);
        const domAssist = (steps || []).filter((s) => s && typeof s.dom_assist === 'string' && s.dom_assist).length;
        const resolvedVia = (steps || []).some((s) => s && /^shadow-pierce|dom_reindex|domsnap/.test(String(s.resolution_via || '')));
        results[r.id] = { status: r.status, oracle: r.oracle };
        rows.push({
          id: r.id,
          tc_source: 'generated',
          verdict: r.status || 'UNKNOWN',
          app_outcome: (r.oracle && r.oracle.app_outcome) || 'n/a',
          weak: String(r.status || '').includes('WEAK') || resolvedVia,
          dom_assist: domAssist,
        });
        if (!r.id) continue;
        const idx = tcs.findIndex((t) => t.id === r.id);
        if (idx >= 0) rows[rows.length - 1]._matched = !!matched[idx];
      }
      const control = {};
      for (const tc of tcs) {
        const txt = (cap0 && cap0.bodyText) || '';
        if (truth && matchRule(tc, truth)) {
          const exp = String(truth.expected.expect || '').toLowerCase();
          const present = exp && txt.toLowerCase().includes(exp);
          control[tc.id] = present ? { oracle: { verdict: 'PASS' } } : { oracle: { verdict: 'FAIL' } };
        } else {
          control[tc.id] = { oracle: { verdict: 'FAIL' } };
        }
      }
      const score = scoreGenerated({ page: slug, generated: tcs, truths: truth ? [truth] : [], results, control });
      const causes = rows.filter((r) => r.verdict !== 'PASS').map((r) => ({ id: r.id, cause: causeClassOf({ status: r.verdict, oracleVerdict: results[r.id] && results[r.id].oracle && results[r.id].oracle.verdict, generated: tcs.length }) }));
      pageRows.push({
        slug,
        generated: tcs.length,
        dropped: gen.dropped,
        parseFail: !!gen.parseFail,
        schema_validity: score.schema_validity,
        truth_coverage: score.truth_coverage,
        exec_valid: score.exec_valid,
        oracle_pass_vs_truth: score.oracle_pass_vs_truth,
        false_pass: score.false_pass,
        rows,
        causes,
      });
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { proc.kill(); } catch (_) {}
  }
  const schemaValidSets = pageRows.filter((p) => p.generated > 0 && p.schema_validity === 1).length;
  const agg = {
    pages: pageRows.length,
    truth_coverage: pageRows.length ? pageRows.reduce((s, p) => s + p.truth_coverage, 0) / pageRows.length : 0,
    schema_validity: pageRows.length ? pageRows.reduce((s, p) => s + (p.schema_validity || 0), 0) / pageRows.length : 0,
    false_pass: pageRows.reduce((s, p) => s + (p.false_pass || 0), 0),
  };
  return {
    mode: 'api', model, cap, usedCalls, blocked,
    calls,
    pages: pageRows,
    aggregate: agg,
    // api+browser run: perception/tools present => blind NOT Y (never upgraded).
    autonomy_label: autonomyGenerateLabel({ blind: false, schemaValidSets, handshake: false, preAuthored: false }),
  };
}

module.exports = {
  PAGES,
  GEN_CAP,
  perCallRow,
  autonomyGenerateLabel,
  causeClassOf,
  capturePage,
  runGenerateLive,
};
