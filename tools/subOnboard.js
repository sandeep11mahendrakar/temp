'use strict';

// Read-only navigation. Current board/intercom records remain authoritative.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { parseTranscript } = require('./intercomInbox');

const root = path.resolve(__dirname, '..');
const sensitive = /AIza|sb_secret_|service_role|eyJ|password|credential|api.?key/i;
function token(value) {
  const text = String(value ?? 'NOT_RECORDED');
  return /^[A-Za-z0-9_.:@/-]{1,64}$/.test(text) && !sensitive.test(text) ? text : 'REDACTED';
}
function options(args) {
  const result = { limit: 6 };
  for (const arg of args) {
    if (arg === '--help') return { help: true };
    if (/^--limit=([1-9]|1[0-9]|20)$/.test(arg)) result.limit = Number(arg.slice(8));
    else if (/^--task=[A-Za-z0-9_.-]{1,80}$/.test(arg)) result.task = arg.slice(7);
    else throw new Error('Unsupported argument. Use --help.');
  }
  return result;
}
function load(relative) {
  const file = path.join(root, relative);
  const stat = fs.lstatSync(file);
  const canonical = fs.realpathSync(file);
  if (!stat.isFile() || !canonical.startsWith(fs.realpathSync(root) + path.sep)) {
    throw new Error('Required coordination input is not a contained regular file.');
  }
  const bytes = fs.readFileSync(canonical);
  return { relative, text: bytes.toString('utf8'), hash: crypto.createHash('sha256').update(bytes).digest('hex') };
}
function main(args) {
  const opt = options(args);
  if (opt.help) {
    console.log('node tools/subOnboard.js [--task=TASK-ID] [--limit=1..20]');
    console.log('READ_ONLY | no sends, writes, claims, tests, credentials, network or live actions');
    return;
  }
  const board = load('docs/TASK_BOARD.md');
  const intercom = load('docs/INTERCOM.md');
  const inbox = parseTranscript(intercom.text, opt.task ? { task: opt.task } : {});
  const ist = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date());
  console.log(`SUB_BOOT | IST=${ist} IST | mode=READ_ONLY | authority=NOT_GRANTED_BY_SCRIPT`);
  console.log('READ | AGENTS.md;CODEX_PROJECT_MEMORY.md;.agents/skills/project-submaster/SKILL.md');
  console.log('READ | .agents/skills/project-taskboard/SKILL.md;.agents/skills/project-intercom/SKILL.md');
  console.log('READ | .agents/skills/caveman/SKILL.md;docs/SUB_COORDINATION_ONBOARDING.md');
  for (const item of [board, intercom]) {
    console.log(`INPUT | file=${item.relative} | sha256=${item.hash} | lines=${item.text.split(/\r?\n/).length}`);
  }
  try {
    const dirty = execFileSync('git', ['status', '--short', '--untracked-files=normal'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    }).trim();
    console.log(`WORKTREE | status_entries=${dirty ? dirty.split(/\r?\n/).length : 0} | inspect_git_status_before_edit=YES`);
  } catch { console.log('WORKTREE | status=UNAVAILABLE | do_not_edit_until_checked=YES'); }
  console.log(`INBOX | pending=${inbox.pending.length} | warnings=${inbox.warnings.length} | legacy=${inbox.legacy.length}`);
  for (const item of inbox.pending.slice(-opt.limit)) {
    console.log(`PENDING | task=${token(item.task)} | id=${token(item.id)} | state=${token(item.status)} | next=${token(item.expectedRole)} | intercom_line=${item.line}`);
  }
  for (const issue of inbox.warnings.slice(-opt.limit)) {
    console.log(`WARNING | intercom_line=${Number.isInteger(issue.line) ? issue.line : 'NOT_RECORDED'} | inspect_source=YES`);
  }
  console.log('NEXT | Read board top/current task region and Intercom last40 plus cited pending/warning lines.');
  console.log('LIMIT | Missing inbox entry does not prove completion. Legacy/unparseable messages require manual review.');
  console.log('GATES | Verify owners/locks/HOLDER/runtime and existing human approvals in live records; never infer from this output.');
  console.log('ROUTE | Worker repairs; independent AUD reviews; SUB integrates matching revision; OWNER decides reserved gates.');
  console.log('DM | Only actionable blocker/decision/final verdict; no ACK/progress/heartbeat or reply to silence.');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch { console.error('SUB_BOOT_REFUSED | invalid argument or unreadable coordination input; use --help and inspect local records'); process.exitCode = 1; }
}

module.exports = { main };
