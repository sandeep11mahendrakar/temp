'use strict';
// Isolated LOCAL PGlite only; no DSN/HTTP/hosted provider/API; never install dependencies.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ROOT = path.resolve(__dirname,'..');
let PGlite;
try {
  const pinned = path.join(ROOT,'current_p59/tools/.tv1-runtime');
  PGlite = require(require.resolve('@electric-sql/pglite',{paths:[pinned]})).PGlite;
} catch (_) {
  console.log('SKIPPED_LOCAL_PGLITE_MISSING_PINNED_PACKAGE');
  process.exitCode = 77;
}
function fail(code){throw new Error(code);}
function paramSql(sql) {let i=0;return sql.replace(/%s/g,()=>'$'+(++i));}
function digest(v) {return require('node:crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex');}
async function run() {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT,'EXECUTABLE_CASE_PLAN.json'),'utf8'));
  const cases = plan.cases;
  const neg = cases.filter(c=>c.id.startsWith('NEG-05/'));
  if(neg.length!==6 || new Set(neg.map(c=>c.params[0])).size!==6) fail('SIX_UNIQUE_CASES_REQUIRED');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocdb-neg05-local-'));
  let db, reopened,transaction=false,baseline,logs=[];
  try {
    db=new PGlite(temp);
    await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN; GRANT anon,authenticated,service_role TO CURRENT_USER;');
    const migration=fs.readFileSync(path.join(ROOT,'current_p59/database/r3_companion.sql'),'utf8');
    await db.exec(migration); // ISOLATED disposable PGlite ONLY
    const baselineRes=await db.query("SELECT count(*)::integer AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND left(c.relname,3)<>'r3_' AND c.relkind IN ('r','p','v','m','f','S')");
    baseline=baselineRes.rows[0].n;
    await db.exec('BEGIN');transaction=true;
    await db.exec('SET LOCAL ROLE service_role');
    const pos=cases.find(c=>c.id==='POS-INSERT');
    const ins=await db.query(paramSql(pos.sql),pos.params);
    if(ins.rows.length!==4)fail('FOUR_FIXTURES_NOT_INSERTED');
    for(let i=0;i<neg.length;i++) {
      const c=neg[i];
      await db.exec('SAVEPOINT neg05_case');
      let observed=null;
      try { await db.query(paramSql(c.sql),c.params);observed={code:'00000',constraint:null}; }
      catch(e) {observed={code:e.code||e.sqlstate||null,constraint:e.constraint||null};}
      await db.exec('ROLLBACK TO SAVEPOINT neg05_case');
      await db.exec('RELEASE SAVEPOINT neg05_case');
      const pass=observed.code==='23514' && observed.constraint===c.expected_constraint;
      logs.push({case_id:c.id,expected_sqlstate:'23514',expected_constraint:c.expected_constraint,actual_sqlstate:observed.code,actual_constraint:observed.constraint,pass});
      if(!pass)fail('CASE_EXPECTATION_FAILED:'+c.id);
    }
    const before=await db.query("SELECT count(*)::integer AS n FROM public.r3_runs WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_'");
    if(before.rows[0].n!==4)fail('UNEXPECTED_INSERT_PERSISTENCE');
    await db.exec('RESET ROLE; ROLLBACK');transaction=false;
    await db.close();db=null;
    reopened=new PGlite(temp);
    const after=await reopened.query("SELECT count(*)::integer AS n FROM public.r3_runs WHERE left(run_id,length('ocdb_tv1_20261019_'))='ocdb_tv1_20261019_'");
    const baselineAfter=await reopened.query("SELECT count(*)::integer AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND left(c.relname,3)<>'r3_' AND c.relkind IN ('r','p','v','m','f','S')");
    const ok=after.rows[0].n===0 && baselineAfter.rows[0].n===baseline;
    console.log(JSON.stringify({mode:'ISOLATED_LOCAL_PGLITE_ONLY',results:logs,fixture_count_after_rollback:after.rows[0].n,baseline_preserved:baselineAfter.rows[0].n===baseline,pass:ok && logs.every(x=>x.pass)},null,2));
    if(!ok)fail('POST_ROLLBACK_FAILURE');
  } finally {
    if(transaction && db)try{await db.exec('ROLLBACK');}catch(_){}
    if(db)try{await db.close();}catch(_){}
    if(reopened)try{await reopened.close();}catch(_){}
    fs.rmSync(temp,{recursive:true,force:true});
  }
}
if(PGlite) run().catch(e=>{console.error('LOCAL_PGLITE_TEST_FAIL:'+e.message);process.exitCode=1});
