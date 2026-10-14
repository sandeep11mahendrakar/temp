'use strict';

// J2 runAuto: offline tests (dry IO, mock LLM). No browser, no network.

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs, buildRunner, MAX_LOOPS, LLM_CALL_CAP } = require('../runAuto');

test('J2 runAuto: parses url/goal/components/--model with caps', () => {
  const c = parseArgs(['https://x.test', 'my goal', '--components=planner,memory,bogus', '--model=mock', '--max-loops=9', '--cap=5']);
  assert.equal(c.url, 'https://x.test');
  assert.equal(c.goal, 'my goal');
  assert.deepEqual(c.components, ['planner', 'memory']);
  assert.equal(c.model, 'mock');
  assert.equal(c.maxLoops, MAX_LOOPS);
  assert.equal(c.cap, 5);
  assert.equal(LLM_CALL_CAP, 40);
  assert.throws(() => parseArgs(['only-url']), /usage/);
});

test('J2 runAuto: dry build runs loops<=3, mock LLM counted, report built', async () => {
  const out = await buildRunner({ url: 'https://x.test', goal: 'g', maxLoops: 9, cap: 40, runId: 'dry-t' });
  assert.ok(out.loops.loops <= 3 && out.loops.loops >= 1);
  assert.equal(out.config.counters.llmCalls <= 3, true);
  assert.equal(out.report.schema, 1);
  assert.equal(out.report.cost.api_calls, 0);
});
