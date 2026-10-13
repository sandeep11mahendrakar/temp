'use strict';

// T3: input-fragment filter. 2 stacked real fields + 4 fragments -> exactly 2.

const test = require('node:test');
const assert = require('node:assert/strict');

const { filterInputs } = require('../src/inputFilter');

const mk = (id, type, x1, y1, x2, y2, conf = 0.8, text = '') => ({
  id,
  type,
  text,
  bbox: { x1, y1, x2, y2 },
  confidence: { yolo: conf },
});

test('2 stacked fields + 4 fragments collapse to exactly the 2 real fields', () => {
  const user = mk('elem-0', 'text_input', 100, 100, 300, 130, 0.9); // w200 h30
  const pass = mk('elem-1', 'text_input', 100, 150, 300, 180, 0.88); // stacked below
  const els = [
    user,
    pass,
    // Fragment 1: near-duplicate of user box, lower conf -> NMS drop.
    mk('elem-2', 'text_input', 102, 102, 298, 128, 0.5),
    // Fragment 2: small box 85% inside pass box -> containment drop.
    mk('elem-3', 'text_input', 120, 154, 200, 176, 0.6),
    // Fragment 3: same row as user, narrower, x-overlapping -> row-rule drop.
    mk('elem-4', 'text_input', 110, 104, 190, 126, 0.55),
    // Fragment 4: tiny sliver -> small-box drop.
    mk('elem-5', 'text_input', 400, 400, 430, 410, 0.7),
  ];
  const { elements, removed } = filterInputs(els);
  assert.equal(elements.length, 2);
  assert.deepEqual(elements.map((e) => e.id), ['elem-0', 'elem-1']);
  assert.equal(removed, 4);
});

test('a single small input stays (never empties)', () => {
  const els = [mk('elem-0', 'text_input', 10, 10, 60, 18, 0.7)];
  const { elements, removed } = filterInputs(els);
  assert.equal(elements.length, 1);
  assert.equal(removed, 0);
});

test('non-input elements pass through untouched even inside input regions', () => {
  const els = [
    mk('elem-0', 'text_input', 100, 100, 300, 130, 0.9),
    mk('elem-1', 'button', 100, 100, 300, 130, 0.95, 'Login'),
    mk('elem-2', 'link', 102, 102, 298, 128, 0.9, 'hint'),
  ];
  const { elements, removed } = filterInputs(els);
  assert.equal(elements.length, 3);
  assert.equal(removed, 0);
});

test('order is preserved and empty input returns empty', () => {
  const { elements, removed } = filterInputs([]);
  assert.deepEqual(elements, []);
  assert.equal(removed, 0);
});
