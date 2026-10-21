from pathlib import Path
import ast,json,hashlib,sys
repo=Path.cwd();base=repo/'_TEMP_BIN/supabase/evidence/AUD_R6_01a15a1a';r=repo/'_TEMP_BIN/supabase/executor/revisions/R6_OFFLINE_CANDIDATE'
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('ascii')
m=json.loads((r/'SHA256_MANIFEST.json').read_bytes())
actual={p.relative_to(r).as_posix():sha(p.read_bytes()) for p in r.rglob('*') if p.is_file() and p.name!='SHA256_MANIFEST.json'}
assert actual==m['files'] and len(actual)==39
agg=sha('\n'.join(p+'|'+actual[p] for p in sorted(actual)).encode('ascii'))
assert agg==m['aggregate_sha256']=='23f126a0c3b718f3f58f629a5a27036d2ff42876c1f30b0845cb3c352cf003db'
policy=ast.parse((r/'src/policy.py').read_bytes());paths={}
for n in policy.body:
 if isinstance(n,ast.Assign) and isinstance(n.targets[0],ast.Name) and n.targets[0].id in ['SOURCE_PATHS','DATA_PATHS']:paths[n.targets[0].id]=ast.literal_eval(n.value)
mods={Path(p).stem:p for p in paths['SOURCE_PATHS']};edges={}
for p in paths['SOURCE_PATHS']:
 names=set()
 for n in ast.walk(ast.parse((r/p).read_bytes())):
  if isinstance(n,ast.Import):names.update(a.name for a in n.names)
  if isinstance(n,ast.ImportFrom):names.add(n.module)
 edges[p]=sorted(mods[n] for n in names if n in mods)
files={p:sha((r/p).read_bytes()) for p in paths['SOURCE_PATHS']+paths['DATA_PATHS']}
digest=sha(b'OCDB-R6-CLOSURE-V1\n'+canonical({'files':files,'imports':edges}))
assert digest=='72c69c31e687a7d28f75873c87137c28b603950c97c210f5846c259061e5ef51'
assert {'sha256':digest,'files':files,'imports':edges}==json.loads((r/'evidence/ARTIFACT_INVENTORY.json').read_bytes())
seen=set()
def visit(p):
 if p in seen:return
 seen.add(p)
 for q in edges[p]:visit(q)
visit('entry.py');assert seen==set(paths['SOURCE_PATHS'])
py=list(r.rglob('*.py'))
for p in py:ast.parse(p.read_bytes())
hist=json.loads((repo/'_TEMP_BIN/supabase/SOURCE_MANIFEST.json').read_bytes())['files']
assert len(hist)==82
assert all(sha((repo/'_TEMP_BIN/supabase'/f['path']).read_bytes())==f['sha256'] for f in hist)
plan=json.loads((r/'data/case_plan.json').read_bytes())['cases']
norm=[dict(id=c['id'],role=c['role'],sql=c['sql'],params=c['params'],kind=c['kind'],expected=c['expected'],sqlstate=c['expected_sqlstate'],constraint=c['expected_constraint'],after_rollback=c['after_rollback']) for c in plan]
assert sha(canonical(norm))=='037215b0a2cb5e8df50e99e7bd56c1c015883f04bf0c964a22b62c37789ff2e2'
assert len(plan)==35 and len([c for c in plan if c['id'].startswith('NEG-05/')])==6
lock=json.loads((r/'dependency.lock.json').read_bytes())
print(json.dumps({'command':'python -I -B '+str(Path(__file__).relative_to(repo)),'manifest_files':len(actual),'aggregate':agg,'artifact_digest':digest,'source_modules':len(seen),'bound_files':len(files),'ast_files':len(py),'historical_matches':len(hist),'plan_cases':len(plan),'neg05_cases':6,'dependency_file_counts':{k:len(v['files']) for k,v in lock['distributions'].items()},'runtime_files':len(lock['runtime_files']),'exit':0},indent=2))
