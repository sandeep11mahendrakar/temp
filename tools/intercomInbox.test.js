'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { parseTranscript } = require('./intercomInbox');

function envelope({ id, from, to, kind, task = 'COORD-OPS-1', reply_to, revision, action, evidence, ist = '2026-10-19 08:00 IST' }) {
  return Object.entries({ id, from, to, kind, task, reply_to, revision, action, evidence, IST: ist })
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join('|');
}

function request(id = 'REQ-1', revision = 'sha256:abc', task = 'COORD-OPS-1') {
  return envelope({ id, from: 'WORKER:W4', to: 'AUD:AUD', kind: 'VERIFY_REQUEST', task, reply_to: 'CLAIM-1', revision, evidence: 'paths=tools/a.js;POS+NEG' });
}

function ack(id = 'ACK-1', replyTo = 'REQ-1', revision = 'sha256:abc', task = 'COORD-OPS-1') {
  return envelope({ id, from: 'AUD:AUD', to: 'WORKER:W4', kind: 'ACK', task, reply_to: replyTo, revision, action: 'received' });
}

function verdict(id = 'VER-1', replyTo = 'REQ-1', revision = 'sha256:abc', action = 'ACCEPT', task = 'COORD-OPS-1') {
  return envelope({ id, from: 'AUD:AUD', to: 'SUB:SUB', kind: 'VERDICT', task, reply_to: replyTo, revision, action, evidence: 'raw-exit=0;controls=pass' });
}

function correction(id = 'CORR-1', replyTo = 'VER-1', revision = 'sha256:abc', action = 'ACCEPT_SUPERSEDES', task = 'COORD-OPS-1') {
  return envelope({ id, from: 'AUD:AUD', to: 'SUB:SUB', kind: 'CORR', task, reply_to: replyTo, revision, action, evidence: 'corrected verdict=ACCEPT' });
}

function integrated(id = 'INT-1', replyTo = 'VER-1', revision = 'sha256:abc', action = 'DONE', task = 'COORD-OPS-1') {
  return envelope({ id, from: 'SUB:SUB', to: 'WORKER:W4', kind: 'INTEGRATED', task, reply_to: replyTo, revision, action, evidence: 'INTERCOM line 20' });
}

function withdraw(id = 'WD-1', replyTo = 'REQ-1', revision = 'sha256:abc', from = 'WORKER:W4', task = 'COORD-OPS-1') {
  return envelope({ id, from, to: 'AUD:AUD', kind: 'WITHDRAW', task, reply_to: replyTo, revision, action: 'WITHDRAW', evidence: 'evidence revision changed' });
}

function fullChain(verdictAction = 'ACCEPT', integrationAction = verdictAction === 'ACCEPT' ? 'DONE' : 'HOLD') {
  return [request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', verdictAction), integrated('INT-1', 'VER-1', 'sha256:abc', integrationAction)].join('\n');
}

test('request stays pending and routes to AUD', () => {
  const result = parseTranscript(request());
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].status, 'REQUESTED');
  assert.equal(result.pending[0].expectedRole, 'AUD');
  assert.equal(result.pending[0].line, 1);
});

test('ACK records receipt but does not close the request', () => {
  const result = parseTranscript([request(), ack()].join('\n'));
  assert.equal(result.pending[0].status, 'ACKED');
  assert.equal(result.pending[0].expectedRole, 'AUD');
  assert.equal(result.resolved.length, 0);
});

test('only ordered ACK, verdict, and SUB integration resolve the exchange', () => {
  const result = parseTranscript(fullChain());
  assert.equal(result.pending.length, 0);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].verdict, 'ACCEPT');
  assert.equal(result.resolved[0].integrationAction, 'DONE');
});

test('REJECT or UNVERIFIABLE plus HOLD closes only the exchange, not the task', () => {
  for (const action of ['REJECT', 'UNVERIFIABLE']) {
    const result = parseTranscript(fullChain(action, 'HOLD'));
    assert.equal(result.resolved[0].verdict, action);
    assert.equal(result.resolved[0].integrationAction, 'HOLD');
  }
});

test('valid AUD correction supersedes the prior verdict but waits for addressed SUB integration', () => {
  const input = [request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'), correction(), 'B-sub: integrated from prose only'].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].status, 'VERDICTED');
  assert.equal(result.pending[0].expectedRole, 'SUB');
  assert.equal(result.pending[0].verdict, 'ACCEPT');
  assert.equal(result.pending[0].correctionId, 'CORR-1');
  assert.equal(result.resolved.length, 0, 'prose cannot stand in for INTEGRATED');
});

test('addressed integration to a valid correction resolves using its superseding verdict', () => {
  const input = [request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'), correction(), integrated('INT-CORR', 'CORR-1')].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending.length, 0);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.resolved[0].verdict, 'ACCEPT');
  assert.equal(result.resolved[0].correctionId, 'CORR-1');
  assert.equal(result.resolved[0].integrationAction, 'DONE');
});

test('lowercase accept_supersedes is normalized to ACCEPT in the effective verdict', () => {
  const lower = correction().replace('action=ACCEPT_SUPERSEDES', 'action=accept_supersedes');
  const input = [request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'), lower, integrated('INT-CORR', 'CORR-1')].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending.length, 0);
  assert.equal(result.resolved[0].verdict, 'ACCEPT');
  assert.equal(result.resolved[0].correctionId, 'CORR-1');
});

test('invalid correction sender, recipient, task, revision, action, evidence, or reply cannot supersede', () => {
  const cases = [
    [correction().replace('from=AUD:AUD', 'from=WORKER:W4'), 'wrong_correction_sender'],
    [correction().replace('to=SUB:SUB', 'to=AUD:AUD'), 'wrong_correction_recipient'],
    [correction().replace('task=COORD-OPS-1', 'task=DB-3'), 'task_mismatch'],
    [correction().replace('revision=sha256:abc', 'revision=sha256:old'), 'stale_revision'],
    [correction().replace('action=ACCEPT_SUPERSEDES', 'action=ACCEPT'), 'invalid_correction_action'],
    [correction().replace('|evidence=corrected verdict=ACCEPT', ''), 'missing_evidence'],
    [correction().replace('reply_to=VER-1', 'reply_to=UNKNOWN'), 'orphan_correction']
  ];
  for (const [bad, warning] of cases) {
    const result = parseTranscript([request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'), bad].join('\n'));
    assert.equal(result.pending.length, 1, warning);
    assert.equal(result.pending[0].verdict, 'UNVERIFIABLE', warning);
    assert.equal(result.resolved.length, 0, warning);
    assert.ok(result.warnings.some((item) => item.code === warning), warning);
  }
});

test('conflicting corrections remain unresolved and flag a correction conflict', () => {
  const result = parseTranscript([request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'), correction('CORR-1'), correction('CORR-2'), integrated('INT-OLD', 'VER-1')].join('\n'));
  assert.equal(result.pending[0].status, 'VERDICT_CONFLICT');
  assert.equal(result.pending[0].verdict, undefined);
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'conflicting_corrections'));
});

test('integration of the superseded verdict cannot resolve the corrected request', () => {
  const result = parseTranscript([request(), ack(), verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'), correction(), integrated('INT-OLD', 'VER-1')].join('\n'));
  assert.equal(result.pending[0].verdict, 'ACCEPT');
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'integration_targets_superseded_verdict'));
});

test('recipient and task filters select pending work by its current action owner', () => {
  const input = [request(), ack(), verdict()].join('\n');
  assert.equal(parseTranscript(input, { to: 'AUD', task: 'COORD-OPS-1' }).pending.length, 0);
  const sub = parseTranscript(input, { to: 'SUB', task: 'COORD-OPS-1' });
  assert.equal(sub.pending.length, 1);
  assert.equal(sub.pending[0].status, 'VERDICTED');
  assert.equal(parseTranscript(input, { task: 'DB-2' }).pending.length, 0);
});

test('wrong ACK recipient cannot acknowledge a request', () => {
  const wrong = ack('ACK-X');
  const input = [request(), wrong.replace('to=WORKER:W4', 'to=WORKER:W3')].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending[0].status, 'REQUESTED');
  assert.ok(result.warnings.some((item) => item.code === 'wrong_ack_recipient'));
});

test('stale evidence revision cannot deliver a verdict or integration', () => {
  const input = [request(), ack(), verdict('VER-X', 'REQ-1', 'sha256:old'), integrated('INT-X', 'VER-X')].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending[0].status, 'ACKED');
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'stale_revision'));
});

test('verdict without an earlier valid ACK remains unresolved', () => {
  const result = parseTranscript([request(), verdict()].join('\n'));
  assert.equal(result.pending[0].status, 'REQUESTED');
  assert.ok(result.warnings.some((item) => item.code === 'verdict_without_prior_ack'));
});

test('conflicting duplicate IDs are flagged and cannot resolve a chain', () => {
  const input = [request(), request().replace('revision=sha256:abc', 'revision=sha256:other'), ack(), verdict(), integrated()].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending.length, 0);
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'duplicate_id_conflict'));
});

test('identical retransmission is idempotent', () => {
  const result = parseTranscript([request(), request()].join('\n'));
  assert.equal(result.pending.length, 1);
  assert.equal(result.summary.requests, 1);
});

test('request owner can explicitly withdraw an unacknowledged stale revision', () => {
  const input = [request(), withdraw(), request('REQ-2', 'sha256:new')].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.resolved[0].status, 'WITHDRAWN');
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].id, 'REQ-2');
  assert.equal(result.pending[0].status, 'REQUESTED');
});

test('another worker cannot withdraw a request', () => {
  const result = parseTranscript([request(), withdraw('WD-X', 'REQ-1', 'sha256:abc', 'WORKER:W3')].join('\n'));
  assert.equal(result.pending[0].status, 'REQUESTED');
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'wrong_withdraw_sender'));
});

test('request cannot be withdrawn after review has been acknowledged', () => {
  const result = parseTranscript([request(), ack(), withdraw()].join('\n'));
  assert.equal(result.pending[0].status, 'ACKED');
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'withdraw_after_review_started'));
});

test('generic routed messages may name a role without an individual', () => {
  const line = 'id=CLAIM-W4|from=WORKER:W4|to=SUB|cc=MASTER|kind=CLAIM|task=COORD-OPS-1|IST=2026-10-19 08:41 IST';
  const result = parseTranscript(line);
  assert.equal(result.warnings.length, 0);
});

test('legacy requests anywhere in the full transcript stay manual-review warnings', () => {
  const old = 'Q-19/10/2026 00:18-W1->AUD: inspect this legacy request';
  const transcript = [old, ...Array.from({ length: 100 }, (_, i) => `ordinary history ${i}`), 'B-19/10/2026: resolved already'].join('\n');
  const result = parseTranscript(transcript, { to: 'AUD' });
  assert.equal(result.legacy.length, 1);
  assert.equal(result.legacy[0].line, 1);
  assert.equal(result.legacy[0].status, 'LEGACY_UNRESOLVED');
  assert.equal(parseTranscript(transcript, { task: 'COORD-OPS-1' }).legacy.length, 0, 'legacy task is unknown and cannot match a task filter');
});

test('unrouted legacy request remains visible without recipient filter', () => {
  const result = parseTranscript('PING-19/10/2026: needs human review');
  assert.equal(result.legacy[0].recipient, null);
  assert.equal(result.legacy[0].status, 'LEGACY_UNRESOLVED');
  assert.equal(parseTranscript('PING-19/10/2026: needs human review', { to: 'AUD' }).legacy.length, 0);
});

test('malformed addressed envelope is reported without closing a request', () => {
  const malformed = 'id=ACK-X|from=AUD:AUD|to=WORKER:W4|kind=ACK|task=COORD-OPS-1|reply_to=REQ-1|revision=sha256:abc|action=received|IST=now|action=duplicate';
  const result = parseTranscript([request(), malformed].join('\n'));
  assert.equal(result.pending[0].status, 'REQUESTED');
  assert.ok(result.warnings.some((item) => item.code === 'duplicate_field'));
});

test('multiple independent verdicts are ambiguous and do not resolve', () => {
  const input = [request(), ack(), verdict('VER-1'), verdict('VER-2')].join('\n');
  const result = parseTranscript(input);
  assert.equal(result.pending[0].status, 'VERDICT_CONFLICT');
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'multiple_verdicts'));
});

test('wrong verdict role and wrong reply target cannot advance review', () => {
  const wrongRole = verdict().replace('from=AUD:AUD', 'from=WORKER:W4');
  const wrongReply = verdict('VER-X', 'MISSING-REQ');
  const result = parseTranscript([request(), ack(), wrongRole, wrongReply].join('\n'));
  assert.equal(result.pending[0].status, 'ACKED');
  assert.equal(result.resolved.length, 0);
  assert.ok(result.warnings.some((item) => item.code === 'wrong_verdict_sender'));
  assert.ok(result.warnings.some((item) => item.code === 'orphan_reply'));
});

test('verdict without evidence stays unresolved', () => {
  const missing = verdict().replace('|evidence=raw-exit=0;controls=pass', '');
  const result = parseTranscript([request(), ack(), missing].join('\n'));
  assert.equal(result.pending[0].status, 'ACKED');
  assert.ok(result.warnings.some((item) => item.code === 'missing_evidence'));
});

test('literal evidence text is data and is never executed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intercom-inbox-'));
  const marker = path.join(dir, 'executed');
  const hostileText = `literal-$((write ${marker}))`;
  const input = request().replace('paths=tools/a.js;POS+NEG', hostileText);
  parseTranscript(input);
  assert.equal(fs.existsSync(marker), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI reads transcript, filters results, and leaves input bytes unchanged', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intercom-inbox-cli-'));
  const file = path.join(dir, 'transcript.txt');
  const before = ['# synthetic-transcript=coord-ops-1-v1', request(), ack()].join('\n');
  fs.writeFileSync(file, before, 'utf8');
  const originalHash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const run = spawnSync(process.execPath, [path.join(__dirname, 'intercomInbox.js'), `--file=${file}`, '--to=AUD', '--task=COORD-OPS-1'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.pending[0].status, 'ACKED');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), originalHash);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI refuses environment-file inputs before reading them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intercom-inbox-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, 'sensitive=value', 'utf8');
  const run = spawnSync(process.execPath, [path.join(__dirname, 'intercomInbox.js'), `--file=${file}`], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /refusing environment-file input/);
  assert.equal(run.stdout, '');
  fs.rmSync(dir, { recursive: true, force: true });
});

const FIXTURE = path.join(__dirname, 'fixtures', 'intercom-inbox', 'synthetic-20261019-v1.txt');

test('CLI replays the versioned synthetic fixture with addressed lifecycle states', () => {
  const before = crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex');
  const run = spawnSync(process.execPath, [path.join(__dirname, 'intercomInbox.js'), `--file=${FIXTURE}`], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.deepEqual(output.summary, { requests: 7, pending: 5, resolved: 1, legacy: 2, warnings: 5 });
  const states = Object.fromEntries(output.pending.map((item) => [item.id, `${item.status}/${item.expectedRole}`]));
  assert.deepEqual(states, { 'VR-2': 'REQUESTED/AUD', 'VR-3': 'ACKED/AUD', 'VR-4': 'VERDICTED/SUB', 'VR-5': 'ACKED/AUD', 'VR-8': 'REQUESTED/AUD' });
  assert.equal(output.pending.find((item) => item.id === 'VR-4').verdict, 'REJECT');
  assert.equal(output.resolved[0].id, 'VR-1');
  assert.equal(output.resolved[0].verdict, 'ACCEPT');
  assert.equal(output.resolved[0].integrationAction, 'DONE');
  assert.deepEqual(output.legacy.map((item) => item.line), [21, 22]);
  const codes = output.warnings.map((item) => item.code);
  for (const code of ['duplicate_id_conflict', 'stale_revision', 'missing_evidence', 'legacy_routed_manual_review', 'legacy_unrouted_manual_review']) {
    assert.ok(codes.includes(code), `missing warning ${code}`);
  }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(FIXTURE)).digest('hex'), before, 'fixture bytes unchanged');
});

test('CLI applies a corrected verdict from a versioned synthetic transcript and requires integration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intercom-inbox-corr-'));
  const file = path.join(dir, 'synthetic-coord-ops-2-v1.txt');
  const transcript = [
    '# synthetic-transcript=coord-ops-2-corr-v1',
    request(),
    ack(),
    verdict('VER-1', 'REQ-1', 'sha256:abc', 'UNVERIFIABLE'),
    correction(),
    integrated('INT-CORR', 'CORR-1')
  ].join('\n');
  fs.writeFileSync(file, transcript, 'utf8');
  const run = spawnSync(process.execPath, [path.join(__dirname, 'intercomInbox.js'), `--file=${file}`, '--to=SUB', '--task=COORD-OPS-1'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.deepEqual(output.summary, { requests: 1, pending: 0, resolved: 1, legacy: 0, warnings: 0 });
  assert.equal(output.resolved[0].verdict, 'ACCEPT');
  assert.equal(output.resolved[0].correctionId, 'CORR-1');
  assert.equal(output.resolved[0].integrationAction, 'DONE');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI --input and --recipient aliases match --file and --to', () => {
  const viaFile = spawnSync(process.execPath, [path.join(__dirname, 'intercomInbox.js'), `--file=${FIXTURE}`, '--to=AUD'], { encoding: 'utf8' });
  const viaAlias = spawnSync(process.execPath, [path.join(__dirname, 'intercomInbox.js'), `--input=${FIXTURE}`, '--recipient=AUD'], { encoding: 'utf8' });
  assert.equal(viaFile.status, 0, viaFile.stderr);
  assert.equal(viaAlias.status, 0, viaAlias.stderr);
  assert.deepEqual(JSON.parse(viaAlias.stdout), JSON.parse(viaFile.stdout));
  const output = JSON.parse(viaAlias.stdout);
  assert.deepEqual(output.pending.map((item) => item.id), ['VR-2', 'VR-3', 'VR-5', 'VR-8']);
  assert.deepEqual(output.legacy.map((item) => item.line), [21]);
});

test('addressed request above a long unrelated tail is still found on full replay', () => {
  const buried = request('REQ-BURIED');
  const transcript = [buried, ...Array.from({ length: 500 }, (_, i) => `ordinary history ${i}`)].join('\n');
  const result = parseTranscript(transcript, { to: 'AUD' });
  assert.equal(result.pending.length, 1);
  assert.equal(result.pending[0].line, 1);
  assert.equal(result.pending[0].status, 'REQUESTED');
});
