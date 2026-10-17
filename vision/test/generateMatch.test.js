'use strict';

// GL0 (D37) — OFFLINE match-rule + metrics + mock-brain dry-run on pinned
// zoo-vdom fixtures. Pure: no browser, no network, no LLM (llmCall is mocked).
// Freezes the yardstick BEFORE the GL1 live run (no post-hoc tuning).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { actionClass, textOverlap, matchRule, scoreGenerated, MATCH_OVERLAP, targetTextOf } = require('../src/generateMatch');
const { brainGenerate } = require('../src/brain');

const FIX_DIR = path.join(__dirname, 'fixtures', 'zoo-vdom');
const TRUTH_DIR = path.join(__dirname, '..', 'zoo', 'truth');
const PAGES = [
  'form-validate', 'select-check-radio', 'hover-menu',
  'dialogs', 'login-6users', 'paginate-sort-filter-search',
];

const fixture = (p) => JSON.parse(fs.readFileSync(path.join(FIX_DIR, `${p}.json`), 'utf8'));
const truth = (p) => JSON.parse(fs.readFileSync(path.join(TRUTH_DIR, `${p}.truth.json`), 'utf8'));

// Mock brain: one generated TC per interactive pinned element (visible text).
const ACT = { button: 'click', link: 'click', text_input: 'fill', password_input: 'fill', select: 'select', checkbox: 'check', radio: 'check' };
function mockTcs(page, fixtureDoc) {
  return fixtureDoc.elements
    .filter((e) => ACT[e.type])
    .map((e) => ({
      id: `${page}-${e.id}`,
      objective: `exercise ${e.text}`,
      steps: [{ action: ACT[e.type], target: { type: e.type, text: e.text }, value: e.type === 'button' || e.type === 'link' || e.type === 'checkbox' || e.type === 'radio' ? '' : 'x' }],
    }));
}

async function withGenerate(on, fn) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'GENERATE');
  const prev = process.env.GENERATE;
  if (on) process.env.GENERATE = 'on'; else delete process.env.GENERATE;
  try { return await fn(); } finally { if (had) process.env.GENERATE = prev; else delete process.env.GENERATE; }
}

// 1. fixtures pinned: 6 files, shape, non-empty elements.
test('GL0 fixtures: 6 pinned zoo-vdom files parse with id/type/text', () => {
  const files = fs.readdirSync(FIX_DIR).filter((f) => f.endsWith('.json')).sort();
  assert.equal(files.length, 6);
  for (const p of PAGES) {
    const d = fixture(p);
    assert.equal(d.page, `zoo-${p}`);
    assert.equal(d.elements.length, d.element_count);
    assert.ok(d.elements.every((e) => e.id && e.type && typeof e.text === 'string'));
  }
});

// 2. rule units: action class, overlap, page-scoped mismatch.
test('GL0 rule units: actionClass + textOverlap + cross-page mismatch', () => {
  assert.equal(actionClass('click'), 'pointer');
  assert.equal(actionClass('fill'), 'value');
  assert.equal(actionClass('scroll'), 'system');
  assert.equal(MATCH_OVERLAP, 0.5);
  assert.equal(textOverlap('Name', '#f-name'), 1);          // containment
  assert.equal(textOverlap('Show alert', '#alert-btn'), 0.5); // token share
  assert.equal(textOverlap('Search', '#q'), 0);             // genuine miss
  const formTc = mockTcs('form-validate', fixture('form-validate'))[0];
  assert.equal(matchRule(formTc, truth('form-validate')), true);
  assert.equal(matchRule(formTc, truth('select-check-radio')), false); // page-scoped
});

// 3. dry-run: mock-brain over all 6 pages => coverage 1.0, schema 1.0, false_pass 0.
test('GL0 dry-run: mock-brain covers all 6 truths; schema+coverage 1.0; control 0', async () => {
  await withGenerate(true, async () => {
    const rows = [];
    for (const p of PAGES) {
      const fx = fixture(p);
      const r = await brainGenerate({
        archetypeScore: 0.1,
        elements: fx.elements,
        goal: `zoo ${p}`,
        llmCall: async () => JSON.stringify({ tcs: mockTcs(p, fx) }),
      });
      assert.equal(r.triggered, true, p);
      assert.equal(r.dropped, 0, p);
      const results = {};
      const control = {};
      for (const tc of r.tcs) {
        results[tc.id] = { status: 'PASS', oracle: { verdict: 'PASS' } };
        control[tc.id] = { status: 'FAIL', oracle: { verdict: 'FAIL' } };
      }
      rows.push(scoreGenerated({ page: fx.page, generated: r.tcs, truths: [truth(p)], results, control }));
    }
    assert.equal(rows.length, 6);
    for (const row of rows) {
      assert.equal(row.schema_validity, 1, row.page);
      assert.equal(row.truth_coverage, 1, row.page);
      assert.equal(row.exec_valid, 1, row.page);
      assert.equal(row.oracle_pass_vs_truth, 1, row.page);
      assert.equal(row.false_pass, 0, row.page);
    }
    const agg = {
      truth_coverage: rows.reduce((s, r) => s + r.truth_coverage, 0) / rows.length,
      schema_validity: rows.reduce((s, r) => s + r.schema_validity, 0) / rows.length,
      false_pass: rows.reduce((s, r) => s + r.false_pass, 0),
    };
    assert.deepEqual(agg, { truth_coverage: 1, schema_validity: 1, false_pass: 0 });
  });
});

// 4. CONTROL: a trivially-satisfiable PASS under the zero-action control is a
//    false_pass — the metric must detect it (no silent false-positive).
test('GL0 CONTROL: zero-action PASS counts as false_pass', async () => {
  await withGenerate(true, async () => {
    const fx = fixture('paginate-sort-filter-search');
    const r = await brainGenerate({ archetypeScore: 0.1, elements: fx.elements, llmCall: async () => JSON.stringify({ tcs: mockTcs('paginate-sort-filter-search', fx) }) });
    const bogus = { id: 'ctl-bogus', objective: 'trivially true', steps: [{ action: 'click', target: { type: 'button', text: 'Next' } }] };
    const generated = [...r.tcs, bogus];
    const results = Object.fromEntries(generated.map((t) => [t.id, { status: 'PASS', oracle: { verdict: 'PASS' } }]));
    const control = { ...Object.fromEntries(r.tcs.map((t) => [t.id, { status: 'FAIL', oracle: { verdict: 'FAIL' } }])), [bogus.id]: { status: 'PASS', oracle: { verdict: 'PASS' } } };
    const row = scoreGenerated({ page: fx.page, generated, truths: [truth('paginate-sort-filter-search')], results, control });
    assert.equal(row.false_pass, 1);
    assert.equal(row.truth_coverage, 1);
  });
});

// 5. schema control: an invalid generated TC lowers schema_validity, not coverage.
test('GL0 CONTROL: invalid shapes lower schema_validity only', () => {
  const row = scoreGenerated({
    page: 'x',
    generated: [{ id: 'ok', objective: 'o', steps: [{ action: 'click', target: { type: 'button', text: 'Next' } }] }, { nope: 1 }],
    truths: [],
    results: {},
    control: {},
  });
  assert.equal(row.schema_validity, 0.5);
  assert.equal(row.truth_coverage, 0);
  assert.equal(row.false_pass, 0);
});

// GL0 audit (independent) regression tests:
test('GL0 audit: type is not mixed into target text (no false match by control type)', () => {
  assert.equal(targetTextOf({ target: { type: 'button', text: 'Next' } }), 'Next');
  assert.equal(targetTextOf({ target: { type: 'button', text: '' } }), '');
  // unrelated controls sharing only a type token no longer match on type
  assert.equal(textOverlap('Next', 'Submit'), 0);
});

test('GL0 audit: matchRule requires per-pair action-class compatibility', () => {
  const gen = { id: 'g', steps: [{ action: 'click', target: { type: 'button', text: 'Go' } }] };
  const truth = { tc_id: 't', steps: [{ action: 'scroll', target: { type: 'button', text: 'Go' } }] };
  assert.equal(matchRule(gen, truth), false);
  // compatible class + matching text still matches
  const gen2 = { id: 'g2', steps: [{ action: 'click', target: { type: 'button', text: 'Go' } }] };
  const truth2 = { tc_id: 't2', steps: [{ action: 'click', target: { type: 'button', text: 'Go' } }] };
  assert.equal(matchRule(gen2, truth2), true);
});

test('GL0 audit: unknown actions do not default to the system class', () => {
  assert.equal(actionClass('foo'), null);
  assert.equal(actionClass(''), null);
  assert.equal(actionClass(null), null);
  assert.equal(actionClass('scroll'), 'system');
  assert.equal(actionClass('click'), 'pointer');
});
