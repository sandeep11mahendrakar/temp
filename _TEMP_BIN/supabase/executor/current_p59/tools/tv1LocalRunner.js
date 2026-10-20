'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require(require.resolve('@electric-sql/pglite', { paths: [path.resolve(__dirname, '.tv1-runtime')] }));
const TEAM = ['mobile_a', 'mobile_b', 'run_summary', 'runs', 'web_a', 'web_b'];
const PREFIX = 'ocdb_tv1_20261019_';
const INVENTORY = `WITH team AS (
 SELECT c.relname, c.oid, c.relkind, c.relrowsecurity, c.relacl, c.reloptions,
 pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
 CASE WHEN c.relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(c.oid,true) ELSE '' END AS view_sql,
 COALESCE((SELECT string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text,',' ORDER BY a.attnum)
 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'') AS columns,
 COALESCE((SELECT string_agg(pg_catalog.pg_get_constraintdef(k.oid,true),',' ORDER BY k.conname)
 FROM pg_catalog.pg_constraint k WHERE k.conrelid=c.oid),'') AS constraints,
 COALESCE((SELECT string_agg(pg_catalog.pg_get_indexdef(i.indexrelid),',' ORDER BY i.indexrelid)
 FROM pg_catalog.pg_index i WHERE i.indrelid=c.oid),'') AS indexes
 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f','S')
 AND c.relname NOT IN ('r3_runs','r3_research_eligible','r3_evidence_readback')
) SELECT count(*)::integer AS objects_n,
 COALESCE(jsonb_agg(relname ORDER BY relname),'[]'::jsonb) AS names,
 md5(COALESCE(string_agg(row_to_json(team)::text,E'\n' ORDER BY relname),'')) AS fingerprint FROM team`;

function parseArgs(argv) {
  const out = { selfCheck: false, evidenceRoot: null, expectedBaseline: null, fixtureBaseline: 'zero', remote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-check') out.selfCheck = true;
    else if (arg === '--evidence-root' && argv[i + 1]) out.evidenceRoot = argv[++i];
    else if (arg === '--expected-baseline' && argv[i + 1]) out.expectedBaseline = argv[++i];
    else if (arg === '--fixture-baseline' && argv[i + 1]) out.fixtureBaseline = argv[++i];
    else if (arg === '--remote-url' || arg === '--project') { out.remote = true; if (argv[i + 1]) i += 1; }
    else throw new Error('unknown argument: ' + arg);
  }
  return out;
}
function errorInfo(error) { return { message: String(error.message || error), code: error.code || null, constraint: error.constraint || null }; }
function hash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
async function inventory(db) { return (await db.query(INVENTORY)).rows[0]; }
async function fixtureCount(db) { return Number((await db.query('SELECT count(*) AS n FROM public.r3_runs WHERE left(run_id,$1)=$2', [PREFIX.length, PREFIX])).rows[0].n); }
async function teamRows(db, before) {
  return before.names.includes('runs') ? (await db.query('SELECT id,marker FROM public.runs ORDER BY id')).rows : [];
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function runSelfCheck(evidenceRoot, options = {}) {
  // Named profiles describe disposable LOCAL fixtures, never an approved hosted inventory.
  if (options.remote || options.remoteUrl || options.project) throw new Error('REMOTE_MODE_REJECTED');
  if (!['zero', 'six'].includes(options.expectedBaseline)) throw new Error('explicit expected baseline zero|six required');
  const fixtureBaseline = options.fixtureBaseline || 'zero';
  if (!['zero', 'six'].includes(fixtureBaseline)) throw new Error('fixture baseline zero|six required');
  const allowedFaults = [undefined, 'sql', 'notice', 'rollback', 'close', 'fingerprint', 'rls', 'invoker', 'trigger', 'role', 'collision'];
  if (!allowedFaults.includes(options.testFault)) throw new Error('unknown local test fault');
  if (!evidenceRoot) throw new Error('evidence root required');
  const root = path.resolve(evidenceRoot);
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.mkdirSync(root); // Exclusive evidence directory: never overwrite a prior run.
  const dataDir = path.join(root, 'local-db');
  const companion = fs.readFileSync(path.resolve(__dirname, '../database/r3_companion.sql'), 'utf8');
  let diagnostic = fs.readFileSync(path.resolve(__dirname, '../database/TV1_Diagnostics_R3.sql'), 'utf8');
  const notices = [], results = [], errors = [];
  const result = { started: new Date().toISOString(), mode: 'LOCAL_ISOLATED', expectedBaseline: options.expectedBaseline,
    fixtureBaseline, testFault: options.testFault || null, source_sha256: { migration: hash(companion), diagnostic: hash(diagnostic) },
    runtime: null, baseline: null, postcheck: null, rollback: { attempted: false }, close: { attempted: false }, exit: 1 };
  let db = null, before = null, baselineRows = null, original = null;
  const capture = async (file, sql) => {
    let noticeError = null;
    const statements = await db.exec(sql, { onNotice: n => {
      notices.push({ message: n.message, code: n.code, severity: n.severity });
      // Do not throw across a WASM callback boundary. Fail the runner once exec returns.
      if (options.testFault === 'notice' && n.message === 'INJECT-NOTICE-AFTER-FIXTURES') noticeError = new Error('INJECTED_NOTICE_CAPTURE_FAILURE');
    } });
    results.push({ file, statements });
    if (noticeError) throw noticeError;
    return statements;
  };
  try {
    db = new PGlite(dataDir);
    const version = (await db.query('SELECT version() AS version, current_user AS role')).rows[0];
    const packageFile = path.resolve(__dirname, '.tv1-runtime/node_modules/@electric-sql/pglite/package.json');
    result.runtime = { ...version, pglite: JSON.parse(fs.readFileSync(packageFile, 'utf8')).version };
    await capture('roles', 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; GRANT anon,authenticated,service_role TO CURRENT_USER;');
    if (fixtureBaseline === 'six') {
      await capture('synthetic-team-fixture', `CREATE TABLE public.runs(id integer PRIMARY KEY,marker text NOT NULL);
        INSERT INTO public.runs VALUES(7,'retained');
        CREATE VIEW public.run_summary AS SELECT id,marker FROM public.runs;
        CREATE VIEW public.web_a AS SELECT id,marker FROM public.runs;
        CREATE VIEW public.web_b AS SELECT id,marker FROM public.runs;
        CREATE VIEW public.mobile_a AS SELECT id,marker FROM public.runs;
        CREATE VIEW public.mobile_b AS SELECT id,marker FROM public.runs;`);
    }
    await capture('companion', companion);
    before = await inventory(db);
    result.baseline = before;
    baselineRows = await teamRows(db, before);
    const expectedNames = options.expectedBaseline === 'zero' ? [] : TEAM;
    if (!same(before.names, expectedNames)) throw new Error('PREFLIGHT/BASELINE expected names differ from measured inventory');
    if (before.names.length && !same(baselineRows, [{ id: 7, marker: 'retained' }])) throw new Error('PREFLIGHT/BASELINE fixture rows differ');
    await db.exec('CREATE TEMP VIEW tv1_team_inventory AS ' + INVENTORY);
    await db.exec('CREATE TEMP TABLE tv1_expected_baseline(objects_n integer NOT NULL,fingerprint text NOT NULL);');
    await db.query('INSERT INTO tv1_expected_baseline VALUES($1,$2)', [before.objects_n, before.fingerprint]);
    if (options.testFault === 'fingerprint') await db.exec('CREATE TABLE public.unexpected_drift(id integer);');
    if (options.testFault === 'rls') await db.exec('ALTER TABLE public.r3_runs DISABLE ROW LEVEL SECURITY;');
    if (options.testFault === 'invoker') await db.exec('ALTER VIEW public.r3_evidence_readback SET(security_invoker=false);');
    if (options.testFault === 'trigger') await db.exec('ALTER TABLE public.r3_runs DISABLE TRIGGER r3_runs_append_only;');
    if (options.testFault === 'role') await db.exec('SET ROLE anon;');
    if (options.testFault === 'collision') {
      const values = diagnostic.match(/INSERT INTO public\.r3_runs[\s\S]*?;/);
      if (!values) throw new Error('collision fixture anchor absent');
      await db.exec(values[0]);
    }
    if (['sql', 'rollback', 'notice'].includes(options.testFault)) {
      const anchor = 'DO $final_in_tx$';
      if (diagnostic.split(anchor).length !== 2) throw new Error('failure injection anchor absent or ambiguous');
      const fault = options.testFault === 'notice'
        ? "DO $inject$ BEGIN RAISE NOTICE 'INJECT-NOTICE-AFTER-FIXTURES'; END $inject$;\n"
        : "DO $inject$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM public.r3_runs; RAISE EXCEPTION 'INJECTED_SQL_FAILURE fixtures=%',n; END $inject$;\n";
      diagnostic = diagnostic.replace(anchor, fault + anchor);
    }
    await capture('diagnostic', diagnostic);
    // Missing raw output is a failure, even when SQL itself exits successfully.
    const caseIds = results.flatMap(x => x.statements.flatMap(s => (s.rows || []).map(r => r.case_id))).filter(Boolean);
    for (const required of ['CAT/RLS', 'CAT/VIEWS', 'FINAL-IN-TX', 'POST-ROLLBACK']) {
      if (!caseIds.includes(required)) throw new Error('required SQL result absent: ' + required);
    }
    if (!notices.some(n => n.message.startsWith('POS-INSERT |')) || !notices.some(n => n.message.startsWith('POST-ROLLBACK |'))) {
      throw new Error('required diagnostic notices absent');
    }
    const requiredCases = ['PREFLIGHT/OWNER', 'PREFLIGHT/ROLES', 'PREFLIGHT/TRIGGER', 'PREFLIGHT/BASELINE',
      'CAT/RLS', 'CAT/SECURITY-INVOKER', 'POS-INSERT', 'POS-RETRY', 'NEG-04/HASH-CONFLICT',
      'NEG-05/BAD-SCHEMA', 'NEG-05/BAD-ELIGIBILITY', 'NEG-05/TRIAL-ELIGIBLE', 'NEG-05/MISSING-IDS',
      'NEG-05/SELF-SUPERSEDES', 'NEG-05/TRIAL-PENDING', 'NEG-06', 'NEG-03-OWNER-PREFLIGHT',
      'NEG-03-OWNER-TRIGGER/UPDATE', 'NEG-03-OWNER-TRIGGER/DELETE', 'FINAL-IN-TX', 'POST-ROLLBACK'];
    for (const role of ['NEG-01', 'NEG-02']) {
      for (const action of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ELIGIBLE-VIEW', 'READBACK-VIEW']) requiredCases.push(role + '/' + action);
    }
    requiredCases.push('NEG-03-SERVICE/UPDATE', 'NEG-03-SERVICE/DELETE');
    for (const id of requiredCases) {
      if (!notices.some(n => n.message.startsWith(id + ' |') && n.message.endsWith(' | PASS'))) throw new Error('required case absent: ' + id);
    }
  } catch (error) {
    original = error;
    errors.push({ stage: 'execution', ...errorInfo(error) });
  } finally {
    if (db) {
      result.rollback.attempted = true;
      try {
        if (options.testFault === 'rollback') throw new Error('INJECTED_ROLLBACK_FAILURE');
        await db.exec('ROLLBACK; RESET ROLE;');
        result.rollback.ok = true;
      } catch (error) { result.rollback.ok = false; errors.push({ stage: 'rollback', ...errorInfo(error) }); }
      result.close.attempted = true;
      try {
        await db.close();
        result.close.closed = true;
        if (options.testFault === 'close') throw new Error('INJECTED_CLOSE_FAILURE_AFTER_ACTUAL_CLOSE');
        result.close.ok = true;
      } catch (error) { result.close.ok = false; errors.push({ stage: 'close', ...errorInfo(error) }); }
    }
  }
  // Reopen the same persisted disposable database, not a fresh empty database.
  if (before && result.close.closed) {
    let reopened = null;
    try {
      reopened = new PGlite(dataDir);
      const after = await inventory(reopened);
      const count = await fixtureCount(reopened);
      const rows = await teamRows(reopened, before);
      result.postcheck = { inventory: after, fixture_count: count, same_baseline: same(before, after),
        same_team_rows: same(baselineRows, rows), fresh_connection: true };
      if (!same(before, after) || count !== 0 || !same(baselineRows, rows)) throw new Error('FRESH_POSTCHECK baseline/rows/fixtures differ');
    } catch (error) { errors.push({ stage: 'fresh-postcheck', ...errorInfo(error) }); }
    finally {
      if (reopened) {
        try { await reopened.close(); result.postcheck_closed = true; }
        catch (error) { errors.push({ stage: 'postcheck-close', ...errorInfo(error) }); }
      }
    }
  }
  result.ended = new Date().toISOString();
  result.errors = errors;
  result.cases = notices.map(n => ({ case_id: n.message.split(' | ')[0],
    expected_state: (n.message.match(/expected=(\d{5})/) || [])[1] || null,
    actual_state: (n.message.match(/actual=(\d{5})/) || [])[1] || null,
    constraint: (n.message.match(/constraint=([^|]*)/) || [])[1]?.trim() || null,
    pass: n.message.endsWith(' | PASS') }));
  result.noticeCount = notices.length;
  result.exit = errors.length ? 1 : 0;
  for (const [name, data] of [['run.json', result], ['notices.json', notices], ['results.json', results]]) {
    fs.writeFileSync(path.join(root, name), JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  }
  if (errors.length) {
    const failure = original || new Error(errors[0].message);
    failure.evidence = result;
    throw failure;
  }
  return result;
}
async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.remote) throw new Error('REMOTE_MODE_REJECTED no remote execution allowed');
    if (!args.selfCheck) throw new Error('usage: --self-check --expected-baseline zero|six [--fixture-baseline zero|six] --evidence-root <fresh-dir>');
    const result = await runSelfCheck(args.evidenceRoot, args);
    console.log('TV1_SELF_CHECK PASS exit=' + result.exit);
  } catch (error) { console.error('TV1_SELF_CHECK_FAIL ' + error.message); process.exitCode = 1; }
}
module.exports = { parseArgs, runSelfCheck };
if (require.main === module) main();
