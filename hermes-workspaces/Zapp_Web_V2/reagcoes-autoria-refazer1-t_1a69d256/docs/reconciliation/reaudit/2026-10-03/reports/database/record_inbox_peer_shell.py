"""Record full source reading for Inbox's delegated shell indices 6:12."""
from pathlib import Path
import sys,json,hashlib
OUT=Path(__file__).parent;ROOT=OUT.parents[1]/'source'
roster_path=OUT.parent/'inbox/shell-review-roster.json'
roster=json.loads(roster_path.read_text());i=int(sys.argv[1]);note=sys.argv[2]
assert 6<=i<12;row=roster['files'][i];raw=(ROOT/row['path']).read_bytes()
assert hashlib.sha256(raw).hexdigest()==row['source_sha256']
assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==row['git_blob_sha']
assert len(raw.decode().splitlines())==row['line_end']
p=OUT/'inbox-peer-shell-review.json'
d=json.loads(p.read_text())if p.exists()else{'schema_version':1,'source_head':roster['source_head'],
 'reviewer':'/root/reaudit_database','owner':'inbox','allocation_indices':[6,12],
 'roster_artifact':'../inbox/shell-review-roster.json','roster_sha256':hashlib.sha256(roster_path.read_bytes()).hexdigest(),
 'files':[],'shell_executed':False,'sql_executed':False,'runtime_tested':False}
rows={r['path']:r for r in d['files']}
rows[row['path']]={**row,'roster_index_zero_based':i,'reviewer':'/root/reaudit_database',
 'review_level':'semantic','review_status':'COMPLETED_MANUAL_READING',
 'reviewed_ranges':[[1,row['line_end']]],'review_basis':'Whole-file manual review of shell/embedded SQL/fixtures/assertions/cleanup.',
 'adjudication':note,'tests_executed':False,
 'remaining_gaps':['Nothing executed. Fixture/migration coverage does not establish production deployment or complete application behavior.']}
d['files']=sorted(rows.values(),key=lambda r:r['roster_index_zero_based']);d['read_files']=len(rows)
d['read_lines']=sum(r['line_end']for r in rows.values());d['status']='COMPLETED_MANUAL_READING'if len(rows)==6 else'IN_PROGRESS'
d['validation']={'source_sha256_and_git_blob_match':True,'ranges_match_eof':True,'all_assigned_complete':len(rows)==6}
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'recorded':i,'read_files':d['read_files'],'read_lines':d['read_lines']}))
