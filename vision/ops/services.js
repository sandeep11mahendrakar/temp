'use strict';

// vision/ops/services.js — single-terminal vision service runner (zero deps).
//
// Problem it kills: starting the stack used to pop FIVE console windows
// (node app.js / python detect.py / python ocr.py / node merge.js /
// node browser.js). This runner starts everything HIDDEN (windowsHide, no
// shell) and shows all five in ONE terminal table: running or not.
//
//   node vision/ops/services.js up       boot all 5 hidden + status table
//   node vision/ops/services.js up --watch   same + live table (Ctrl+C ends watch only)
//   node vision/ops/services.js status   one-shot table, no changes
//   node vision/ops/services.js down     kill ONLY pids this runner started
//   node vision/ops/services.js logs [svc]  tail service log(s)
//
// PID file + logs live under vision/storage/outputs (gitignored).
// Never touches foreign processes: down verifies cmdline before killing.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const VISION = path.join(__dirname, '..');
const OUT = path.join(VISION, 'storage', 'outputs');
const PIDFILE = path.join(OUT, 'ops_pids.json');

const SVCS = [
  { name: 'browser', cmd: 'node', args: ['browser.js'], cwd: ['services', 'browser-service'], port: 5004, health: 'http://127.0.0.1:5004/health' },
  { name: 'merge', cmd: 'node', args: ['merge.js'], cwd: ['services', 'merge-service'], port: 5003, health: 'http://127.0.0.1:5003/health' },
  { name: 'ocr', cmd: 'python', args: ['ocr.py'], cwd: ['services', 'ocr-service'], port: 5002, health: 'http://127.0.0.1:5002/health' },
  { name: 'yolo', cmd: 'python', args: ['detect.py'], cwd: ['services', 'yolo-service'], port: 5001, health: 'http://127.0.0.1:5001/health' },
  { name: 'gateway', cmd: 'node', args: ['app.js'], cwd: ['gateway'], port: 5000, health: 'http://127.0.0.1:5000/vision/health' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(url, ms = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: ms }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function table(withPid) {
  const pids = readPids();
  const rows = [];
  for (const s of SVCS) {
    const up = await probe(s.health);
    const rec = pids.find((p) => p.service === s.name);
    rows.push({ service: s.name, port: s.port, status: up ? 'UP' : 'DOWN', pid: withPid && rec ? rec.pid : (rec ? rec.pid : '-') });
  }
  return rows;
}

function printTable(rows) {
  const w = (v, n) => String(v).padEnd(n);
  console.log(`\n  ${w('service', 10)} ${w('port', 6)} ${w('status', 8)} ${w('pid', 8)}`);
  for (const r of rows) console.log(`  ${w(r.service, 10)} ${w(r.port, 6)} ${w(r.status, 8)} ${w(r.pid, 8)}`);
  console.log('');
}

function readPids() {
  try { return JSON.parse(fs.readFileSync(PIDFILE, 'utf8')).pids || []; }
  catch (_) { return []; }
}

function writePids(pids) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(PIDFILE, JSON.stringify({ by: 'ops/services.js', ts: new Date().toISOString(), pids }, null, 2));
}

async function cmdUp(watch) {
  const pids = readPids();
  const t0 = Date.now();
  for (const s of SVCS) {
    if (await probe(s.health)) { console.log(`- ${s.name}:${s.port} already UP (foreign, left alone)`); continue; }
    const log = path.join(OUT, `ops_${s.name}.log`);
    // HIDDEN spawn: no shell (no cmd window), windowsHide (no console
    // window), detached+unref (survives this terminal closing).
    const fh = fs.openSync(log, 'a');
    const child = spawn(s.cmd, s.args, {
      cwd: path.join(VISION, ...s.cwd), stdio: ['ignore', fh, fh],
      shell: false, windowsHide: true, detached: true,
    });
    child.unref();
    try { fs.closeSync(fh); } catch (_) {}
    console.log(`- ${s.name}:${s.port} started hidden pid=${child.pid} (log ops_${s.name}.log)`);
    const rec = pids.find((p) => p.service === s.name);
    if (rec) rec.pid = child.pid; else pids.push({ service: s.name, pid: child.pid });
    writePids(pids);
  }
  const deadline = Date.now() + 240000;
  let ok = false;
  while (Date.now() < deadline) {
    process.stdout.write('.');
    if (await probe('http://127.0.0.1:5000/vision/health')) { ok = true; break; }
    await sleep(3000);
  }
  console.log(`\nready in ${((Date.now() - t0) / 1000).toFixed(1)}s gateway=${ok ? 'UP' : 'NOT-UP'}`);
  printTable(await table(true));
  if (!ok) { console.error('BOOT incomplete: see logs via: node vision/ops/services.js logs'); process.exitCode = 2; return; }
  if (watch) {
    console.log('watching (Ctrl+C ends watch only, services keep running)...');
    for (;;) {
      await sleep(5000);
      const rows = await table(true);
      const up = rows.filter((r) => r.status === 'UP').length;
      process.stdout.write(`\r[${new Date().toISOString().slice(11, 19)}] ${up}/5 UP   `);
    }
  }
}

async function cmdStatus() {
  printTable(await table(true));
}

async function cmdDown() {
  const { execSync } = require('node:child_process');
  const pids = readPids();
  const expected = { browser: 'browser.js', merge: 'merge.js', ocr: 'ocr.py', yolo: 'detect.py', gateway: 'app.js' };
  let killed = 0;
  for (const p of pids) {
    let cmd = '';
    try {
      cmd = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId = ${p.pid}\\").CommandLine"`, { encoding: 'utf8', timeout: 15000 });
    } catch (_) { console.log(`- ${p.service} pid=${p.pid} already gone`); continue; }
    if (cmd && cmd.includes(expected[p.service])) {
      try { execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: 'ignore' }); killed += 1; console.log(`- ${p.service} pid=${p.pid} KILLED`); }
      catch (_) { console.log(`- ${p.service} pid=${p.pid} kill failed (left alone)`); }
    } else {
      console.log(`- ${p.service} pid=${p.pid} NOT OURS (cmdline mismatch, left alone)`);
    }
  }
  writePids([]);
  console.log(`down: ${killed} killed, pid file cleared`);
  printTable(await table(false));
}

async function cmdLogs(svc, n = 15) {
  const names = svc ? [svc] : SVCS.map((s) => s.name);
  for (const name of names) {
    const file = path.join(OUT, `ops_${name}.log`);
    console.log(`--- ${name} (${file}) ---`);
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
      console.log(lines.slice(-n).join('\n') || '(empty)');
    } catch (_) { console.log('(no log file)'); }
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'up') return cmdUp(process.argv.includes('--watch'));
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'down') return cmdDown();
  if (cmd === 'logs') {
    const nArg = process.argv.find((a) => /^-n\d+$/.test(a));
    return cmdLogs(SVCS.some((s) => s.name === arg) ? arg : null, nArg ? Number(nArg.slice(2)) : 15);
  }
  console.log('usage: node vision/ops/services.js <up [--watch] | status | down | logs [svc]>');
  process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error('SERVICES-FAIL ' + e.message); process.exit(1); });
module.exports = { SVCS };
