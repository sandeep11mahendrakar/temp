'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];

function parseOwnerRef(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  let value;
  try {
    const parsed = JSON.parse(trimmed);
    value = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed.project_ref
      : null;
  } catch {
    const match = trimmed.match(/^project_ref\s*=\s*([A-Za-z0-9_-]+)$/);
    value = match ? match[1] : null;
  }
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function loadOwnerRef(filePath) {
  if (!filePath) return { ok: false, reason: 'owner target input missing' };
  const resolved = path.resolve(ROOT, filePath);
  const relative = path.relative(ROOT, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    return { ok: false, reason: 'owner target input must be local to the project' };
  }
  let canonical;
  try {
    const realRoot = fs.realpathSync(ROOT);
    canonical = fs.realpathSync(resolved);
    if (!isWithin(realRoot, canonical)) return { ok: false, reason: 'owner target input escapes project root' };
    const stat = fs.lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) return { ok: false, reason: 'owner target input must be a regular file' };
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relative], { cwd: ROOT, stdio: 'ignore' });
    return { ok: false, reason: 'owner target input must be untracked' };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { ok: false, reason: 'owner target input missing' };
    if (error && typeof error.status === 'number' && error.status !== 0) {
      // git ls-files exits nonzero for an existing untracked path.
    } else {
      return { ok: false, reason: 'owner target input unreadable' };
    }
  }
  try {
    const ownerRef = parseOwnerRef(fs.readFileSync(canonical, 'utf8'));
    return ownerRef ? { ok: true, ownerRef } : { ok: false, reason: 'owner target ref missing or malformed' };
  } catch {
    return { ok: false, reason: 'owner target input unreadable' };
  }
}

function envSummary(env = process.env) {
  return REQUIRED_ENV.map((name) => {
    const value = env[name];
    return { name, present: typeof value === 'string' && value.length > 0, length: typeof value === 'string' ? value.length : 0 };
  });
}

function evaluate({ env = process.env, ownerRef = null, targetRef = null } = {}) {
  const variables = envSummary(env);
  const targetStatus = !ownerRef || !/^[A-Za-z0-9_-]+$/.test(ownerRef)
    ? 'STOP(owner-ref-missing)'
    : !targetRef || !/^[A-Za-z0-9_-]+$/.test(targetRef)
      ? 'STOP(target-ref-missing)'
      : ownerRef === targetRef ? 'MATCH' : 'STOP(ref-mismatch)';
  const envOk = variables.every((item) => item.present);
  const ok = envOk && targetStatus === 'MATCH';
  return {
    ok,
    decision: ok ? 'READY_CONFIG_ONLY' : 'STOP',
    targetStatus,
    variables,
    reachability: 'SKIPPED(no network)',
  };
}

function format(result) {
  const envLines = result.variables.map((item) =>
    `env ${item.name}=${item.present ? 'present' : 'absent'} length=${item.length}`);
  return [
    ...envLines,
    `target=${result.targetStatus}`,
    `reachability=${result.reachability}`,
    `decision=${result.decision}`,
  ].join('\n');
}

function main(argv, dependencies = {}) {
  let targetFile = null;
  let targetRef = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--owner-target-file') targetFile = argv[++i] || null;
    else if (argv[i] === '--target-ref') targetRef = argv[++i] || null;
    else if (argv[i] === '--help') {
      console.log('usage: node tools/credPreflight.js --owner-target-file <untracked-local-file> --target-ref <ref>');
      return 0;
    } else throw new Error('unknown or incomplete argument');
  }
  const ownerLoader = dependencies.loadOwnerRef || loadOwnerRef;
  const owner = ownerLoader(targetFile);
  const result = evaluate({ env: dependencies.env || process.env, ownerRef: owner.ok ? owner.ownerRef : null, targetRef });
  if (!owner.ok) result.targetStatus = `STOP(${owner.reason.replace(/[^A-Za-z0-9 -]/g, '')})`;
  console.log(format(result));
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch { console.error('CRED-PREFLIGHT-ERROR invalid invocation'); process.exitCode = 1; }
}

module.exports = { REQUIRED_ENV, parseOwnerRef, isWithin, loadOwnerRef, envSummary, evaluate, format, main };
