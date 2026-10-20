"""Persist a per-file manual adjudication after full source reading."""
from pathlib import Path
import sys,json,hashlib
OUT=Path(__file__).parent
ROOT=OUT.parents[1]/'source'
roster=json.loads((OUT/'test-review-roster.json').read_text())
position=int(sys.argv[1]);note=sys.argv[2]
assert 1<=position<=16,'Final own allocated range is indices 0:16 only'
row=roster['files'][position-1]
raw=(ROOT/row['path']).read_bytes()
assert hashlib.sha256(raw).hexdigest()==row['source_sha256']
assert len(raw.decode().splitlines())==row['line_end']
path=OUT/'test-own-review.json'
data=json.loads(path.read_text())if path.exists()else{
 'schema_version':1,'source_head':roster['source_head'],'reviewer':'database',
 'allocation_indices':[0,16],'review_mode':'Whole-file manual reading; tests not executed.',
 'files':{},'runtime_tested':False}
data['files'][row['path']]={**row,'roster_index':position-1,'reviewer':'database',
 'review_status':'COMPLETED_MANUAL_READING','coverage_level':'semantic',
 'whole_file_read':True,'tests_executed':False,'assessment':note}
data['read_file_count']=len(data['files'])
data['read_line_count']=sum(r['line_end']for r in data['files'].values())
data['allocation_indices']=[0,16]
data['status']='COMPLETED_MANUAL_READING'if len(data['files'])==16 else'IN_PROGRESS'
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'recorded':position,'own_read_files':data['read_file_count'],'own_read_lines':data['read_line_count']},ensure_ascii=False))
