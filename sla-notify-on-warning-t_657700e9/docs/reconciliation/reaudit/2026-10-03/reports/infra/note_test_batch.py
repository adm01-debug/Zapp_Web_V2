import json,pathlib,hashlib
P=pathlib.Path('/workspace/scratch/f8f9b9cbce53/reaudit/reports/infra/test-review.json')
S=pathlib.Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
def record(notes,batch):
 d=json.loads(P.read_text())
 for path,note in notes.items():
  rows=[r for r in d['files'] if r['path']==path or pathlib.Path(r['path']).name==path];assert len(rows)==1,path
  r=rows[0];assert hashlib.sha256((S/r['path']).read_bytes()).hexdigest()==r['source_sha256']
  r.update(review_status='READ_COMPLETE',reviewed_ranges=[[1,r['line_end']]],assessment=note,execution='NOT_EXECUTED',batch=batch)
 d['completed_files']=sum(r['review_status']!='PENDING_READING' for r in d['files']);P.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print('JOURNAL',d['completed_files'])
def read(paths):
 for path in paths:
  print('\nFILE',path)
  for i,l in enumerate((S/path).read_text().splitlines(),1):print(f'{i}: {l}')
