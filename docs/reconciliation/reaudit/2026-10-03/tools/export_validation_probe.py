"""Run the pinned export validator with a local fake node; no database or network."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, tempfile

root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--source',default=str(root/'source'))
p.add_argument('--integrity',default=str(root/'source-integrity.json'))
p.add_argument('--out',default=str(root/'reports/root/export-validation-probe-results.json'))
args=p.parse_args()
source=Path(args.source).resolve()
integrity=json.loads(Path(args.integrity).read_text())
path='supabase-export/validate_destino.sh'
raw=(source/path).read_bytes()
blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
pin=next(f for f in integrity['files'] if f['path']==path)
assert blob==pin['git_blob_sha']
assert subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()==integrity['head_sha']
stub='''#!/usr/bin/env python3
import json,os,pathlib,sys
mode=os.environ['AUDIT_EXPORT_STUB_MODE']
with open(os.environ['AUDIT_EXPORT_STUB_TRACE'],'a') as trace:trace.write('node invoked\\n')
if mode=='connection_error':
 print('psql: simulated connection failure',file=sys.stderr)
 sys.exit(42)
if '-o' in sys.argv:
 out=pathlib.Path(sys.argv[sys.argv.index('-o')+1])
 out.write_text(json.dumps({'timestamp':'synthetic','metrics':[{'name':'tables','actual':1,'expected':1,'status':'OK'}]}))
elif mode=='metric_failure':
 print('│ tables │ ❌ FAIL │')
else:
 print('│ tables │ ✅ OK │')
'''
cases=[]
for mode,expected in [('connection_error',0),('metric_failure',1),('success',0)]:
 with tempfile.TemporaryDirectory(prefix='reaudit-export-') as tmp:
  tmp=Path(tmp);node=tmp/'node';node.write_text(stub);node.chmod(0o755)
  env=dict(os.environ)
  for key in ('BASH_ENV','ENV','SHELLOPTS','BASHOPTS'):env.pop(key,None)
  env.update(PATH=str(tmp)+os.pathsep+env.get('PATH',''),
   DESTINO_URL='postgresql://audit-invalid.example/no-database',
   EXPORT_LOG_CSV=str(tmp/'validation.csv'),EXPORT_LOG_JSON=str(tmp/'validation.json'),
   AUDIT_EXPORT_STUB_MODE=mode,AUDIT_EXPORT_STUB_TRACE=str(tmp/'trace'))
  p=subprocess.run(['bash','--noprofile','--norc',str(source/path)],cwd=source,env=env,text=True,capture_output=True,timeout=15)
  trace=(tmp/'trace').read_text().splitlines()
  assert p.returncode==expected,(mode,p.returncode,p.stdout,p.stderr)
  if mode=='connection_error':
   assert 'simulated connection failure' in p.stdout and 'Destino validado com sucesso' in p.stdout
   assert not (tmp/'validation.json').exists()
  if mode=='metric_failure':assert 'Validação FALHOU' in p.stdout
  if mode=='success':assert (tmp/'validation.csv').exists()
  cases.append({'id':{'connection_error':'ROOT-EXPORT-P01','metric_failure':'ROOT-EXPORT-C01','success':'ROOT-EXPORT-C02'}[mode],
   'kind':'PRIMARY_REPRODUCTION' if mode=='connection_error' else 'BEHAVIOR_CONTROL',
   'mode':mode,'observed_exit_code':p.returncode,'fake_node_invocations':len(trace),
   'announces_success':'Destino validado com sucesso' in p.stdout,
   'json_exists':(tmp/'validation.json').exists(),'csv_exists':(tmp/'validation.csv').exists(),
   'stdout':p.stdout,'stderr':p.stderr,'pass':True})
assert (source/path).read_bytes()==raw
out={'schema_version':1,'source_head':integrity['head_sha'],'runner':'tools/export_validation_probe.py',
 'source_pins':[{'path':path,'git_blob_sha':blob,'sha256':hashlib.sha256(raw).hexdigest(),'line_start':1,'line_end':95}],
 'primary_reproductions':1,'behavior_controls':2,'cases':cases,
 'limits':['Exact Bash file executed with fake node on PATH. No psql, database or network call occurred.',
  'All JSON/CSV outputs and fake executables were confined to a temporary directory, removed after observation.',
  'Success control writes a synthetic result; it does not validate the SQL metrics themselves.',
  'No product file changed; import.sh was inspected only, not executed.']}
dest=Path(args.out)
dest.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'source_head':integrity['head_sha'],'primary_reproductions':1,'behavior_controls':2,'passed':3}))
