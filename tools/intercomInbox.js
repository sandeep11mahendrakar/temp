'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/;
const ROLE_RE = /^[A-Z][A-Z0-9_-]*(?::[A-Za-z0-9_.-]{1,64})?$/;
const CHAIN_KINDS = new Set(['VERIFY_REQUEST', 'ACK', 'VERDICT', 'CORR', 'INTEGRATED']);
const ARG_ALIASES = { file: 'file', input: 'file', to: 'to', recipient: 'to', task: 'task' };

function roleOf(value) {
  return typeof value === 'string' ? value.split(':', 1)[0] : '';
}

function parseEnvelope(line, lineNumber) {
  const fields = Object.create(null);
  const problems = [];
  for (const part of line.split('|')) {
    const eq = part.indexOf('=');
    if (eq < 1) {
      problems.push('malformed_field');
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key) || !value) {
      problems.push('malformed_field');
      continue;
    }
    if (Object.hasOwn(fields, key)) {
      problems.push('duplicate_field');
      continue;
    }
    fields[key] = value;
  }
  if (fields.id && !ID_RE.test(fields.id)) problems.push('invalid_id');
  if (fields.from && !ROLE_RE.test(fields.from)) problems.push('invalid_from');
  if (fields.to && !ROLE_RE.test(fields.to)) problems.push('invalid_to');
  if (fields.task && !ID_RE.test(fields.task)) problems.push('invalid_task');
  if (fields.revision && fields.revision.length > 200) problems.push('revision_too_long');
  if (fields.evidence && fields.evidence.length > 1000) problems.push('evidence_too_long');
  if (fields.cc && fields.cc.split(',').some((recipient) => !ROLE_RE.test(recipient.trim()))) problems.push('invalid_cc');
  if (CHAIN_KINDS.has(fields.kind)) {
    if (fields.from && !fields.from.includes(':')) problems.push('unnamed_from');
    if (fields.to && !fields.to.includes(':')) problems.push('unnamed_to');
  }
  return { line: lineNumber, raw: line, fields, problems };
}

function addIssue(issues, line, code, id) {
  issues.push({ line, code, ...(id ? { id } : {}) });
}

function parseLegacy(line, lineNumber) {
  if (!/^(?:Q-|PING-)/.test(line)) return null;
  const match = line.match(/->([A-Z][A-Z0-9_-]*(?::[A-Za-z0-9_.-]+)?)(?:\b|:)/);
  return {
    line: lineNumber,
    recipient: match ? match[1] : null,
    expectedRole: match ? roleOf(match[1]) : null,
    status: 'LEGACY_UNRESOLVED',
    code: match ? 'legacy_routed_manual_review' : 'legacy_unrouted_manual_review'
  };
}

function parseTranscript(text, filters = {}) {
  const issues = [];
  const unique = new Map();
  const conflicted = new Set();
  const legacy = [];
  const lines = String(text).split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;
    if (line.startsWith('id=')) {
      const item = parseEnvelope(line, lineNumber);
      const id = item.fields.id;
      if (!id) {
        for (const code of item.problems.length ? item.problems : ['missing_id']) addIssue(issues, lineNumber, code);
        continue;
      }
      if (unique.has(id)) {
        if (unique.get(id).raw === line) continue;
        conflicted.add(id);
        addIssue(issues, lineNumber, 'duplicate_id_conflict', id);
        continue;
      }
      unique.set(id, item);
      for (const code of item.problems) addIssue(issues, lineNumber, code, id);
      continue;
    }
    const old = parseLegacy(line, lineNumber);
    if (old) {
      legacy.push(old);
      addIssue(issues, lineNumber, old.code);
    }
  }

  const records = [...unique.values()].filter((item) => !conflicted.has(item.fields.id));
  const requests = records.filter((item) => item.fields.kind === 'VERIFY_REQUEST');
  const events = records.filter((item) => ['ACK', 'VERDICT', 'CORR', 'INTEGRATED', 'WITHDRAW'].includes(item.fields.kind));
  const requestIds = new Set(requests.map((item) => item.fields.id));
  const verdictIds = new Set(records.filter((item) => item.fields.kind === 'VERDICT').map((item) => item.fields.id));
  const correctionIds = new Set(records.filter((item) => item.fields.kind === 'CORR').map((item) => item.fields.id));
  for (const event of events) {
    const kind = event.fields.kind;
    if (['ACK', 'VERDICT', 'WITHDRAW'].includes(kind) && !requestIds.has(event.fields.reply_to)) {
      addIssue(issues, event.line, 'orphan_reply', event.fields.id);
    }
    if (kind === 'CORR' && !verdictIds.has(event.fields.reply_to)) {
      addIssue(issues, event.line, 'orphan_correction', event.fields.id);
    }
    if (kind === 'INTEGRATED' && !verdictIds.has(event.fields.reply_to) && !correctionIds.has(event.fields.reply_to)) {
      addIssue(issues, event.line, 'orphan_integration', event.fields.id);
    }
  }

  function structurallyValid(item, required) {
    if (item.problems.length) return false;
    const fields = item.fields;
    const common = ['id', 'from', 'to', 'kind', 'task', 'ist'];
    const missing = [...common, ...required].filter((key) => !fields[key]);
    if (missing.length) {
      addIssue(issues, item.line, `missing_${missing.join('_')}`, fields.id);
      return false;
    }
    return true;
  }

  function sameTask(event, request) {
    if (event.fields.task !== request.fields.task) {
      addIssue(issues, event.line, 'task_mismatch', event.fields.id);
      return false;
    }
    return true;
  }

  function sameRevision(event, request) {
    if (event.fields.revision !== request.fields.revision) {
      addIssue(issues, event.line, 'stale_revision', event.fields.id);
      return false;
    }
    return true;
  }

  const pending = [];
  const resolved = [];
  for (const request of requests) {
    const f = request.fields;
    if (!structurallyValid(request, ['reply_to', 'revision', 'evidence'])) continue;
    if (roleOf(f.to) !== 'AUD' || !['WORKER', 'SUB'].includes(roleOf(f.from))) {
      addIssue(issues, request.line, 'invalid_request_route', f.id);
      continue;
    }

    const chainIssues = [];
    const matching = events.filter((event) => event.fields.reply_to === f.id);
    const withdraws = [];
    for (const event of matching.filter((item) => item.fields.kind === 'WITHDRAW')) {
      const e = event.fields;
      if (!structurallyValid(event, ['reply_to', 'revision', 'action', 'evidence'])) continue;
      let ok = true;
      if (e.from !== f.from || roleOf(e.from) !== roleOf(f.from)) { addIssue(issues, event.line, 'wrong_withdraw_sender', e.id); ok = false; }
      if (e.to !== f.to) { addIssue(issues, event.line, 'wrong_withdraw_recipient', e.id); ok = false; }
      if (e.action.toUpperCase() !== 'WITHDRAW') { addIssue(issues, event.line, 'invalid_withdraw_action', e.id); ok = false; }
      if (event.line <= request.line) { addIssue(issues, event.line, 'withdraw_before_request', e.id); ok = false; }
      if (!sameTask(event, request) || !sameRevision(event, request)) ok = false;
      if (ok) withdraws.push(event);
    }
    const reviewStarted = matching.some((event) => ['ACK', 'VERDICT'].includes(event.fields.kind) && event.line > request.line);
    if (withdraws.length === 1 && !reviewStarted) {
      resolved.push({ id: f.id, task: f.task, from: f.from, to: f.to, revision: f.revision, line: request.line, status: 'WITHDRAWN', withdrawLine: withdraws[0].line });
      continue;
    }
    if (withdraws.length > 1) addIssue(issues, withdraws[1].line, 'multiple_withdrawals', f.id);
    if (withdraws.length && reviewStarted) addIssue(issues, withdraws[0].line, 'withdraw_after_review_started', f.id);
    const acks = [];
    for (const event of matching.filter((item) => item.fields.kind === 'ACK')) {
      const e = event.fields;
      if (!structurallyValid(event, ['reply_to', 'revision', 'action'])) continue;
      let ok = true;
      if (roleOf(e.from) !== 'AUD') { addIssue(issues, event.line, 'wrong_ack_sender', e.id); ok = false; }
      if (roleOf(e.to) !== roleOf(f.from) || e.to !== f.from) { addIssue(issues, event.line, 'wrong_ack_recipient', e.id); ok = false; }
      if (e.action.toLowerCase() !== 'received') { addIssue(issues, event.line, 'invalid_ack_action', e.id); ok = false; }
      if (event.line <= request.line) { addIssue(issues, event.line, 'ack_before_request', e.id); ok = false; }
      if (!sameTask(event, request) || !sameRevision(event, request)) ok = false;
      if (ok) acks.push(event);
    }

    const verdicts = [];
    for (const event of matching.filter((item) => item.fields.kind === 'VERDICT')) {
      const e = event.fields;
      if (!structurallyValid(event, ['reply_to', 'revision', 'action', 'evidence'])) continue;
      let ok = true;
      if (roleOf(e.from) !== 'AUD') { addIssue(issues, event.line, 'wrong_verdict_sender', e.id); ok = false; }
      if (roleOf(e.to) !== 'SUB') { addIssue(issues, event.line, 'wrong_verdict_recipient', e.id); ok = false; }
      if (!['ACCEPT', 'REJECT', 'UNVERIFIABLE'].includes(e.action.toUpperCase())) { addIssue(issues, event.line, 'invalid_verdict_action', e.id); ok = false; }
      if (event.line <= request.line) { addIssue(issues, event.line, 'verdict_before_request', e.id); ok = false; }
      if (!sameTask(event, request) || !sameRevision(event, request)) ok = false;
      const priorAck = acks.some((ack) => ack.line < event.line);
      if (!priorAck) { addIssue(issues, event.line, 'verdict_without_prior_ack', e.id); ok = false; }
      if (ok) verdicts.push(event);
    }

    let chosenVerdict = null;
    if (verdicts.length === 1) chosenVerdict = verdicts[0];
    if (verdicts.length > 1) {
      addIssue(issues, verdicts[1].line, 'multiple_verdicts', f.id);
      chainIssues.push('multiple_verdicts');
    }

    let correctedVerdict = null;
    let correctionConflict = false;
    if (chosenVerdict) {
      const corrections = [];
      for (const event of events.filter((item) => item.fields.kind === 'CORR' && item.fields.reply_to === chosenVerdict.fields.id)) {
        const e = event.fields;
        if (!structurallyValid(event, ['reply_to', 'revision', 'action', 'evidence'])) continue;
        let ok = true;
        if (roleOf(e.from) !== 'AUD') { addIssue(issues, event.line, 'wrong_correction_sender', e.id); ok = false; }
        if (roleOf(e.to) !== 'SUB') { addIssue(issues, event.line, 'wrong_correction_recipient', e.id); ok = false; }
        if (e.action.toUpperCase() !== 'ACCEPT_SUPERSEDES') { addIssue(issues, event.line, 'invalid_correction_action', e.id); ok = false; }
        if (event.line <= chosenVerdict.line) { addIssue(issues, event.line, 'correction_before_verdict', e.id); ok = false; }
        if (!sameTask(event, request) || !sameRevision(event, request)) ok = false;
        if (ok) corrections.push(event);
      }
      if (corrections.length === 1) correctedVerdict = corrections[0];
      if (corrections.length > 1) {
        addIssue(issues, corrections[1].line, 'conflicting_corrections', f.id);
        correctionConflict = true;
      }
    }
    const reportedVerdict = correctedVerdict ?? chosenVerdict;
    const effectiveVerdict = correctionConflict ? null : reportedVerdict;
    if (correctedVerdict) {
      for (const event of events.filter((item) => item.fields.kind === 'INTEGRATED' && item.fields.reply_to === chosenVerdict.fields.id)) {
        addIssue(issues, event.line, 'integration_targets_superseded_verdict', event.fields.id);
      }
    }

    const integrations = [];
    if (effectiveVerdict) {
      for (const event of events.filter((item) => item.fields.kind === 'INTEGRATED' && item.fields.reply_to === effectiveVerdict.fields.id)) {
        const e = event.fields;
        if (!structurallyValid(event, ['reply_to', 'revision', 'action', 'evidence'])) continue;
        let ok = true;
        if (roleOf(e.from) !== 'SUB') { addIssue(issues, event.line, 'wrong_integration_sender', e.id); ok = false; }
        if (e.to !== f.from) { addIssue(issues, event.line, 'wrong_integration_recipient', e.id); ok = false; }
        if (!['DONE', 'HOLD', 'REPAIR'].includes(e.action.toUpperCase())) { addIssue(issues, event.line, 'invalid_integration_action', e.id); ok = false; }
        if (event.line <= effectiveVerdict.line) { addIssue(issues, event.line, 'integration_before_verdict', e.id); ok = false; }
        if (!sameTask(event, request) || !sameRevision(event, request)) ok = false;
        if (ok) integrations.push(event);
      }
    }

    const common = {
      id: f.id,
      task: f.task,
      from: f.from,
      to: f.to,
      revision: f.revision,
      line: request.line,
      evidencePresent: Boolean(f.evidence)
    };
    const effectiveAction = reportedVerdict?.fields.kind === 'CORR'
      ? reportedVerdict.fields.action.toUpperCase().slice(0, -'_SUPERSEDES'.length)
      : reportedVerdict?.fields.action.toUpperCase();
    if (integrations.length === 1) {
      const integrated = integrations[0];
      resolved.push({ ...common, status: 'INTEGRATED', integrationAction: integrated.fields.action.toUpperCase(), integrationLine: integrated.line, verdict: effectiveAction, ...(correctedVerdict ? { correctionId: correctedVerdict.fields.id } : {}) });
      continue;
    }
    if (integrations.length > 1) {
      addIssue(issues, integrations[1].line, 'multiple_integrations', f.id);
      chainIssues.push('multiple_integrations');
    }
    const acked = acks.some((ack) => !chosenVerdict || ack.line < chosenVerdict.line);
    const state = verdicts.length > 1 || correctionConflict ? 'VERDICT_CONFLICT' : chosenVerdict ? 'VERDICTED' : acked ? 'ACKED' : 'REQUESTED';
    pending.push({
      ...common,
      status: state,
      expectedRole: ['VERDICTED', 'VERDICT_CONFLICT'].includes(state) ? 'SUB' : 'AUD',
      lastLine: chosenVerdict?.line ?? (acked ? Math.max(...acks.map((ack) => ack.line)) : request.line),
      ...(effectiveVerdict ? { verdict: effectiveAction } : {}),
      ...(correctedVerdict ? { correctionId: correctedVerdict.fields.id } : {}),
      issues: chainIssues
    });
  }

  const toRole = filters.to ? String(filters.to).toUpperCase().split(':', 1)[0] : null;
  const taskFilter = filters.task ? String(filters.task) : null;
  const selectedPending = pending.filter((item) => (!toRole || item.expectedRole === toRole) && (!taskFilter || item.task === taskFilter));
  const selectedResolved = resolved.filter((item) => (!toRole || item.expectedRole === toRole || toRole === 'SUB') && (!taskFilter || item.task === taskFilter));
  const selectedLegacy = legacy.filter((item) => (!toRole || (item.expectedRole && item.expectedRole === toRole)) && (!taskFilter || item.task === taskFilter));
  return {
    pending: selectedPending,
    resolved: selectedResolved,
    legacy: selectedLegacy,
    warnings: issues,
    summary: { requests: requests.length, pending: selectedPending.length, resolved: selectedResolved.length, legacy: selectedLegacy.length, warnings: issues.length }
  };
}

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z]+)=(.+)$/);
    if (!match || !Object.hasOwn(ARG_ALIASES, match[1])) throw new Error(`invalid argument: ${arg}`);
    const key = ARG_ALIASES[match[1]];
    if (Object.hasOwn(options, key)) throw new Error(`duplicate argument: --${key}`);
    options[key] = match[2];
  }
  if (!options.file) throw new Error('required argument: --file=PATH (alias --input=PATH)');
  return options;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const base = path.basename(options.file).toLowerCase();
    if (base === '.env' || base.startsWith('.env.')) throw new Error('refusing environment-file input');
    const transcript = fs.readFileSync(options.file, 'utf8');
    process.stdout.write(`${JSON.stringify(parseTranscript(transcript, options), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`intercomInbox: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { parseTranscript, parseArgs, roleOf };
