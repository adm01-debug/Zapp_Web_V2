"""Append explicit human/model adjudications after reading a finite source roster."""
from pathlib import Path
import hashlib, json, sys
root=Path(__file__).resolve().parents[1]
out=root/'reports/root'
roster=json.loads((out/'test-review-roster.json').read_text())
incoming=json.loads(Path(sys.argv[1]).read_text())
dest=out/'test-review.json'
d=json.loads(dest.read_text()) if dest.exists() else {'schema_version':1,'source_head':roster['source_head'],'files':[]}
done={x['roster_index']:x for x in d['files']}
manual_path=out/'manual-review.json';manual=json.loads(manual_path.read_text())
mr={x['path']:x for x in manual['files']}
for review in incoming:
    idx=review['roster_index'];r=roster['files'][idx];p=r['path'];b=(root/'source'/p).read_bytes()
    assert hashlib.sha256(b).hexdigest()==r['source_sha256']
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==r['git_blob_sha']
    assert len(b.splitlines())==r['line_end']
    assert isinstance(review['adjudication'],list) and len(review['adjudication'])>=2
    row={**r,**review,'review_status':'SEMANTIC_FILE_REVIEW','runtime_executed':False,
         'limits':'Leitura semântica de assertions, fixtures/mocks e contratos. A suíte não foi executada neste passe; nenhuma homologação de UI, banco ou provedor é inferida.'}
    done[idx]=row
    mr[p]={'path':p,'git_blob_sha':r['git_blob_sha'],'source_sha256':r['source_sha256'],
           'line_start':1,'line_end':r['line_end'],'review_status':'SEMANTIC_FILE_REVIEW',
           'adjudication':' '.join(review['adjudication']),'runtime_executed':False,'evidence':'test-review.json'}
d['files']=[done[i] for i in sorted(done)]
d['reviewed_files']=len(done);d['total_files']=len(roster['files'])
d['pending_roster_indices']=[i for i in range(d['total_files']) if i not in done]
d['status']='COMPLETED_REVIEW_PASS' if not d['pending_roster_indices'] else 'IN_PROGRESS'
dest.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
manual['files']=list(mr.values());manual_path.write_text(json.dumps(manual,ensure_ascii=False,indent=2)+'\n')
lines=['# Testes — revisão transversal do root','',f"Fonte: `{d['source_head']}`. Estado: {d['status']}; {d['reviewed_files']}/{d['total_files']} arquivos.",'',
       'O registro distingue o contrato que cada teste exercita de seus limites. Leitura e existência de assertivas não equivalem a execução aprovada.','']
for x in d['files']:
    url=f"https://github.com/adm01-debug/Zapp_Web_V2/blob/{d['source_head']}/{x['path']}#L1-L{x['line_end']}"
    lines += [f"## [{x['path']}]({url})",'',' '.join(x['adjudication']),'']
(out/'test-review.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'reviewed':d['reviewed_files'],'total':d['total_files'],'pending':len(d['pending_roster_indices'])}))
