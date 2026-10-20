import zipfile,io,json,re,hashlib,collections,sys
from pathlib import Path
root=Path(__file__).resolve().parent
repo=root.parents[3]
def sha(b):return hashlib.sha256(b).hexdigest()
z=zipfile.ZipFile(repo/'docs/evidence/db5-executor/ocdb-r5-windows-4b1ae4e36151/OCDB_R5_WINDOWS_EVIDENCE_FOR_AUD.zip')
outer_sha=sha(Path(z.filename).read_bytes())
assert outer_sha=='4b1ae4e36151afd601e72411f2e65135cc9dcbb4ab197915e21ee8a4b60b7c5f'
assert z.testzip() is None
checks=[]
for ln in z.read('SHA256SUMS.txt').decode().splitlines():
 h,n=ln.split(None,1);assert sha(z.read(n.strip()))==h;checks.append(n.strip())
q=zipfile.ZipFile(io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith('.zip')))))
assert q.testzip() is None
def raw(s):return q.read(next(n for n in q.namelist() if n.endswith(s))).decode().replace('\r','')
def js(s):return json.loads(raw(s))
b=zipfile.ZipFile(root/'OC_DB_R5_ONE_GO_WINDOWS.zip');assert b.testzip() is None
source_bytes=b.read('OC_DB_P59_EXECUTOR_FROZEN_R3_AUD_REVIEW.zip')
assert sha(source_bytes)=='cae1405f07c68467914c2297443199c704a3e5df7d6f987244603fa85d5f5c01'
s=zipfile.ZipFile(io.BytesIO(source_bytes));assert s.testzip() is None
entries=[]
for ln in s.read('FILE_SHA256_MANIFEST.txt').decode().splitlines():
 h,size,name=ln.split(None,2);data=s.read(name)
 assert len(data)==int(size) and sha(data)==h
 entries.append((name,h))
assert len(entries)==37 and len(set(n for n,h in entries))==37
assert set(s.namelist())=={n for n,h in entries}|{'FILE_SHA256_MANIFEST.txt','FROZEN_PACKAGE_METADATA.json'}
aggregate=sha('\n'.join(sorted(n+'|'+h for n,h in entries)).encode())
summary=js('SUMMARY.json');assert aggregate==summary['input_integrity']['aggregate_sha256']
patch=summary['local_fake_adapter_patch']
assert sha(s.read('tests/fake_adapter.py'))==patch['original_sha256']
assert sha(b.read('patches/fake_adapter.py'))==patch['replacement_sha256']
assert sha(b.read('patches/test_local_adapter_patch_r5.py'))==patch['native_test_sha256']
helper=sha(b.read('OC_DB_R3_WINDOWS_OFFLINE_EVIDENCE_R5.py'))
assert helper==js('DRIVER_METADATA.json')['r5_helper_sha256']
u=raw('python_unittest.stderr.sanitized.txt')
unit_ok=sum(bool(re.match(r'^test_.* \.\.\. ok$',ln)) for ln in u.splitlines())
assert unit_ok==48 and u.strip().endswith('OK')
assert re.search(r'^test_real_windows_spawn_close_before_and_during_poll.* \.\.\. ok$',u,re.M)
t=raw('p59_real_local_tests.stdout.sanitized.txt')
assert len(re.findall(r'^\u2714',t,re.M))==16 and 'pass 16' in t and 'fail 0' in t
assert len(summary['steps'])==12 and all(st['exit_code']==0 for st in summary['steps'])
neg=js('neg05_real_local_pglite.stdout.sanitized.txt')
assert len(neg['results'])==6 and len({c['case_id'] for c in neg['results']})==6
assert all(c['actual_sqlstate']==c['expected_sqlstate']=='23514' and c['actual_constraint']==c['expected_constraint'] and c['pass'] is True for c in neg['results'])
assert neg['fixture_count_after_rollback']==0 and neg['baseline_preserved'] is True
profiles={}
for p in ['zero','six']:
 r=js('p59_'+p+'_run.json');n=js('p59_'+p+'_notices.json');res=js('p59_'+p+'_results.json')
 counts=collections.Counter(c['case_id'] for c in r['cases'])
 assert len(r['cases'])==len(n)==r['noticeCount']==36 and len(counts)==35
 assert {k:v for k,v in counts.items() if v>1}=={'CAT/SECURITY-INVOKER':2}
 assert all(c['pass'] is True and notice['message'].endswith(' | PASS') and c['case_id']==notice['message'].split(' | ')[0] for c,notice in zip(r['cases'],n))
 assert all(c['expected_state']==c['actual_state'] for c in r['cases'])
 assert r['exit']==0 and r['errors']==[] and r['rollback']['ok'] is True and r['close']['ok'] is True and r['postcheck_closed'] is True
 assert r['postcheck']['fixture_count']==0 and r['postcheck']['fresh_connection'] is True and r['postcheck']['same_team_rows'] is True
 assert r['baseline']==r['postcheck']['inventory'] and r['baseline']['objects_n']==(0 if p=='zero' else 6)
 for key,file in [('migration','current_p59/database/r3_companion.sql'),('diagnostic','current_p59/database/TV1_Diagnostics_R3.sql')]:assert sha(s.read(file))==r['source_sha256'][key]
 rows=[row for group in res for st in group['statements'] for row in st.get('rows',[])]
 assert any(row.get('case_id')=='CAT/RLS' and row.get('rls_on') is True for row in rows)
 assert {row['relname'] for row in rows if row.get('case_id')=='CAT/VIEWS' and 'security_invoker=true' in row.get('reloptions',[])}=={'r3_evidence_readback','r3_research_eligible'}
 profiles[p]={'events':36,'unique_ids':35,'notices':36,'statements':sum(len(g['statements']) for g in res),'baseline_objects':r['baseline']['objects_n'],'rollback_close_fresh_reopen':True}
print(json.dumps({'scope':'INDEPENDENT_ARCHIVE_RECOMPUTATION_NOT_RUNTIME_RERUN','outer_sha256':outer_sha,'outer_checksums':len(checks),'crc_archives_pass':4,'companion_sha256':sha(Path(b.filename).read_bytes()),'source_manifest_files':len(entries),'source_aggregate':aggregate,'helper_sha256':helper,'current_driver_sha256':sha(b.read('RUN_ALL_OFFLINE_R5.ps1')),'historical_driver_hash':'NOT_RECORDED','patch_hashes_match':True,'supplied_windows_tests_ok':unit_ok,'supplied_native_pipe_case_ok':True,'supplied_js_tests_pass':16,'supplied_steps_exit0':12,'supplied_neg05_exact':6,'profiles':profiles,'packaged_scripts_executed':False},indent=2))
