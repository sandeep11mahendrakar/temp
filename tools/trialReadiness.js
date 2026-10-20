'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { evaluate: evaluateCreds } = require('./credPreflight');

const NOT_RECORDED = 'NOT_RECORDED';

function exists(file) { try { return fs.statSync(file).isFile(); } catch { return false; } }

function checkPrereq(name, value, evidence) {
  if (value === true) return { name, status: 'READY', reason: 'accepted', evidence };
  if (value === false) return { name, status: 'BLOCKED', reason: 'not accepted or failed', evidence };
  return { name, status: 'NOT_RECORDED', reason: 'missing evidence', evidence: evidence || NOT_RECORDED };
}

function evaluate(input = {}) {
  const root = path.resolve(input.root || process.cwd());
  const preflight = typeof input.preflight === 'object' && input.preflight ? input.preflight : evaluateCreds({ env: input.env || {}, ownerRef: input.ownerRef || null, targetRef: input.targetRef || null });
  const executorExists = exists(path.join(root, 'vision', 'runVision.js'));
  const prerequisites = [
    checkPrereq('P-4.1', input.p4_1, 'offline report path'),
    checkPrereq('P-1.1', input.p1_1, 'archive/schema path'),
    checkPrereq('T-2.pre', input.t2_pre, 'retained readback path'),
  ];
  const h3 = input.h3 === true ? 'READY' : input.h3 === false ? 'BLOCKED' : 'NOT_RECORDED';
  const subRelease = input.subRelease === true ? 'READY' : input.subRelease === false ? 'BLOCKED' : 'NOT_RECORDED';
  const executor = executorExists ? 'READY' : 'BLOCKED';
  const localReady = prerequisites.every((p) => p.status === 'READY') && h3 === 'READY' && subRelease === 'READY' && executor === 'READY' && preflight.ok === true;
  const uploadReady = localReady && input.db5Tv1 === true && input.h8 === true;

  const targets = [
    { name: 'saucedemo', command: executorExists ? "Push-Location vision; $env:EXPLORE_MAX_STATES='10'; node runVision.js --explore https://www.saucedemo.com/ --goal \"Clean login-to-checkout trial; stop after one run.\"; Pop-Location" : 'BLOCKED: vision/runVision.js missing' },
    { name: 'zoo-captcha', command: executorExists ? "Push-Location vision; $env:EXPLORE_MAX_STATES='10'; node runVision.js --explore http://127.0.0.1:5010/batch4-captcha --goal \"Detect CAPTCHA; if detected, record BLOCKED and stop.\"; Pop-Location" : 'BLOCKED: vision/runVision.js missing' },
    { name: 'zoo-iframe', command: executorExists ? "Push-Location vision; $env:EXPLORE_MAX_STATES='10'; node runVision.js --explore http://127.0.0.1:5010/iframe --goal \"Probe iframe path; report partial honestly if inaccessible.\"; Pop-Location" : 'BLOCKED: vision/runVision.js missing' },
  ];

  return {
    local: localReady ? 'READY' : 'BLOCKED',
    upload: uploadReady ? 'READY' : 'BLOCKED',
    prerequisites,
    h3,
    subRelease,
    executor,
    preflight,
    targets,
    staleHolder: input.staleHolder || NOT_RECORDED,
  };
}

function format(result) {
  const lines = [];
  lines.push(`local=${result.local} upload=${result.upload}`);
  for (const p of result.prerequisites) lines.push(`${p.name}=${p.status} (${p.reason})`);
  lines.push(`h3=${result.h3} subRelease=${result.subRelease} executor=${result.executor}`);
  lines.push(`preflight=${result.preflight.ok ? 'READY' : 'BLOCKED'}`);
  lines.push(`staleHolder=${result.staleHolder}`);
  for (const t of result.targets) lines.push(`target ${t.name}: ${t.command}`);
  return lines.join('\n');
}

module.exports = { evaluate, format, exists };
if (require.main === module) {
  try {
    const result = evaluate({});
    console.log(format(result));
    process.exitCode = result.local === 'READY' ? 0 : 1;
  } catch (e) { console.error('TRIAL-READINESS-ERROR'); process.exitCode = 1; }
}
