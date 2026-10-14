'use strict';

/**
 * report.js — B7-full v2 report pipeline (full implementation, NEW file).
 *
 * Complements the frozen B7 v1 primitives (reportSchema.js — DO NOT TOUCH):
 * v1 builds/validates/renders; v2 COLLECTS live loop outputs into a schema1
 * report and persists it to backup storage:
 *   loopController history -> summarizeLoops [{n,delta,covered}]
 *   executor results + oracle shapes -> caseFromResult
 *     [{id,verdict,weak_steps,app_outcome,evidence}]
 *   buildLoopReport(...) -> schema1 report (via reportSchema.buildReport)
 *   writeReportFile(report, backupPath) -> atomic tmp+rename, returns path
 * Only node:fs/path + reportSchema (read-only reuse). No network, no LLM.
 */

const fs = require('node:fs');
const path = require('node:path');

const { buildReport, indexRow, checkReport } = require('./reportSchema');

function summarizeLoops(histories) {
  if (!Array.isArray(histories)) return [];
  return histories
    .filter((h) => h && typeof h === 'object' && Number.isFinite(h.loop))
    .map((h) => ({
      n: h.loop,
      delta: Array.isArray(h.delta) ? h.delta.slice() : (h.delta === null || h.delta === undefined ? null : []),
      covered: Boolean(h.covered),
    }));
}

function caseFromResult(tcId, execResult, oracle) {
  const r = (execResult && typeof execResult === 'object') ? execResult : {};
  const o = (oracle && typeof oracle === 'object') ? oracle : {};
  return {
    id: String(tcId || (r && r.id) || ''),
    verdict: String(r.verdict || r.status || 'UNKNOWN'),
    weak_steps: Number.isFinite(r.weak_steps) ? r.weak_steps : 0,
    app_outcome: typeof o.app_outcome === 'string' ? o.app_outcome
      : (typeof r.app_outcome === 'string' ? r.app_outcome : 'n/a'),
    evidence: String((r.steps_executed ? `steps:${r.steps_executed.length}` : '') || (o.snip300 ? `snip:${o.snip300.slice(0, 40)}` : '') || ''),
  };
}

function buildLoopReport(input) {
  const src = (input && typeof input === 'object' ? input : {});
  const cases = Array.isArray(src.results)
    ? src.results.map((r) => caseFromResult(r && r.tcId, r && r.exec, r && r.oracle))
    : [];
  return buildReport({
    runId: src.runId,
    ts: src.ts,
    source: src.source || 'vision-loopB-v2',
    loops: summarizeLoops(src.histories),
    cases,
    cost: src.cost,
    storagePaths: src.storagePaths,
  });
}

function writeReportFile(report, backupPath) {
  const violations = checkReport(report);
  if (violations.length) {
    throw new Error(`refusing to persist invalid report: ${violations.join('; ')}`);
  }
  const dir = path.dirname(path.resolve(backupPath));
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${backupPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2), 'utf8');
  fs.renameSync(tmp, backupPath);
  return { path: backupPath, row: indexRow(report) };
}

module.exports = {
  summarizeLoops,
  caseFromResult,
  buildLoopReport,
  writeReportFile,
};
