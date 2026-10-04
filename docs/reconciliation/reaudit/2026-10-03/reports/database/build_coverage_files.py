"""Expose only manually reviewed spans to the global consolidator."""
from pathlib import Path
import json,hashlib,collections
OUT=Path(__file__).parent
ROOT=OUT.parents[1]/'source'
def read(f):return json.loads((OUT/f).read_text())
spans=collections.defaultdict(dict)
def add(e,basis,owner='database'):
 p=e['path'];lo=e.get('start_line',e.get('line_start'));hi=e.get('end_line',e.get('line_end'))
 assert isinstance(lo,int)and isinstance(hi,int)
 spans[p][(lo,hi,basis,owner)]=True
for r in read('function_review.json')['functions']:
 if r['coverage_level']=='semantic':add(r['candidate_effective_definition'],'function_review.json:'+r['identity'])
d=read('policy_review.json')
for r in d['policies']+d['source_extras']:
 assert r['manual_review']['body_read_in_full']
 for e in r['source_definition_statements']+r['conditional_role_scope_blocks']:add(e,'policy_review.json:'+r['identity'])
for r in read('do_review.json')['do_blocks']:
 assert r['body_read_in_full'];add(r['source'],'do_review.json:'+r['identity'])
for r in read('view_review.json')['views']:
 assert r['definition_and_alter_bodies_read_in_full']
 for e in [r['source_definition']]+r['effective_alter_sequence']:add(e,'view_review.json:'+r['identity'])
for r in read('trigger_review.json')['triggers']:
 assert r['binding_body_read_in_full'];add(r['source_binding'],'trigger_review.json:'+r['identity'])
for r in read('ddl_review.json')['instructions'].values():
 assert r['instruction_body_read_in_full'];add(r['source'],'ddl_review.json:'+','.join(r['manual_review_batches']))
for r in read('../root/routine-acl-review.json')['units']:add(r['source'],'../root/routine-acl-review.json','root')
rows=[]
for path,entries in sorted(spans.items()):
 raw=(ROOT/path).read_bytes();lines=len(raw.decode().splitlines())
 ranges=[]
 for lo,hi,basis,owner in sorted(entries):
  assert 1<=lo<=hi<=lines
  ranges.append({'line_start':lo,'line_end':hi,'review_basis':basis,'reviewer':owner,'unit_semantic_review':True})
 rows.append({'path':path,'review_level':'targeted','source_sha256':hashlib.sha256(raw).hexdigest(),
  'git_blob_sha':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),
  'review_basis':'Manual journals listed per range; complete SQL units, not a whole-file claim.',
  'reviewed_ranges':ranges,'runtime_tested':False,
  'remaining_gaps':['Historical bodies outside these exact spans are not promoted to full-file review. Dynamic SQL was read, never expanded/executed.']})
for artifact in ['test-review.json','shell-review.json']:
 if not(OUT/artifact).exists():continue
 d=read(artifact)
 for r in d['files']:
  if r.get('review_status')=='PENDING_READING':continue
  assert r.get('review_level')=='semantic',r
  rows.append({k:v for k,v in r.items()if k in ['path','line_start','line_end','source_sha256','git_blob_sha','review_level','review_basis','reviewer','review_provenance','reviewed_ranges','tests_executed','remaining_gaps']})
assert len({r['path']for r in rows})==len(rows)
c=read('coverage.json');c['files']=rows
c['files_publication_method']='Explicit manual journals only. SQL range declarations are targeted at file level; tests/shell declare whole-file only after completed reading. Peer authorship retained.'
(OUT/'coverage.json').write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'published_files':len(rows),'sql_targeted_files':len(spans),'semantic_whole_files':len(rows)-len(spans)}))
