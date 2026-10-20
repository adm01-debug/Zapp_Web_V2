"""Record root's explicitly delegated final 31 Inbox test file readings."""
from pathlib import Path
import hashlib, json, sys
root=Path(__file__).resolve().parents[1]
out=root/'reports/root'
rp=root/'reports/inbox/test-review-roster.json'
roster=json.loads(rp.read_text())
extra=len(sys.argv)>2 and sys.argv[2]=='extra'
dest=out/('inbox-peer-test-review-extra.json' if extra else 'inbox-peer-test-review.json')
d=json.loads(dest.read_text()) if dest.exists() else {
    'schema_version':1,'source_head':roster['source_head'],'reviewer':'root',
    'allocation_roster':'reports/inbox/test-review-roster.json',
    'allocation_roster_sha256':hashlib.sha256(rp.read_bytes()).hexdigest(),
    'assigned_indices':list(range(80,94) if extra else range(94,125)),'files':[],
    'tests_executed':0,'method':'Full semantic source reading; separate reviewer attribution; no suites, database or provider calls.'}
done={x['roster_index']:x for x in d['files']}
manual_path=out/'manual-review.json';manual=json.loads(manual_path.read_text());mr={x['path']:x for x in manual['files']}
for v in json.loads(Path(sys.argv[1]).read_text()):
    i=v['roster_index'];assert i in d['assigned_indices']
    r=roster['files'][i];p=r['path'];b=(root/'source'/p).read_bytes()
    assert hashlib.sha256(b).hexdigest()==r['source_sha256']
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==r['git_blob_sha']
    assert len(b.splitlines())==r['line_end']
    assert len(v['adjudication'])>=2
    row={**r,**v,'reviewer':'root','review_status':'SEMANTIC_FILE_REVIEW','runtime_executed':False,
         'limits':'Leitura das assertions, mocks e contrato. Não houve execução de suíte, homologação de UI, SQL ou provedor.'}
    done[i]=row
    mr[p]={'path':p,'git_blob_sha':r['git_blob_sha'],'source_sha256':r['source_sha256'],
           'line_start':1,'line_end':r['line_end'],'review_status':'SEMANTIC_FILE_REVIEW',
           'adjudication':' '.join(v['adjudication']),'runtime_executed':False,'evidence':dest.name}
d['files']=[done[i] for i in sorted(done)]
d['reviewed_files']=len(done);d['total_files']=len(d['assigned_indices'])
d['pending_indices']=[i for i in d['assigned_indices'] if i not in done]
d['status']='COMPLETED_REVIEW_PASS' if not d['pending_indices'] else 'IN_PROGRESS'
d['actual_lines_read']=sum(x['line_end'] for x in done.values())
dest.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
manual['files']=list(mr.values());manual_path.write_text(json.dumps(manual,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:d[k] for k in ['status','reviewed_files','total_files','actual_lines_read']}))
