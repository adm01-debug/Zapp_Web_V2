"""Integrate completed manual peer records; never run tests or promote pending rows."""
from pathlib import Path
import json,hashlib,collections
OUT=Path(__file__).parent
ROOT=OUT.parents[1]/'source'
roster=json.loads((OUT/'test-review-roster.json').read_text())
HEAD=roster['source_head']
allocations=[('database','test-own-review.json',0,16),
 ('inbox','../inbox/database-peer-test-review.json',16,27),
 ('database','test-tail-review.json',27,32),
 ('providers','../providers/database-peer-test-review.json',32,52),
 ('auth','../auth/database-peer-test-review.json',52,104),
 ('modules','../modules/database-peer-test-review.json',104,156)]
read={};artifacts=[]
for owner,artifact,start,end in allocations:
 p=OUT/artifact
 if not p.exists():continue
 raw=p.read_bytes();d=json.loads(raw)
 assert d['source_head']==HEAD
 rows=d['files'].values()if isinstance(d['files'],dict)else d['files']
 allowed={r['path']:i for i,r in enumerate(roster['files'])if start<=i<end}
 accepted=0
 for r in rows:
  status=r.get('review_status','').upper()
  if 'PENDING' in status or not any(x in status for x in ['COMPLETE','SEMANTIC']):continue
  if r['path']not in allowed:
   assert owner=='inbox'and r['path']in{z['path']for z in roster['files'][27:32]},(owner,r['path'])
   continue
  i=allowed[r['path']];base=roster['files'][i];data=(ROOT/r['path']).read_bytes()
  assert hashlib.sha256(data).hexdigest()==r['source_sha256']==base['source_sha256']
  assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==r['git_blob_sha']==base['git_blob_sha']
  lines=len(data.decode().splitlines());assert lines==base['line_end']
  ranges=r.get('reviewed_ranges',r.get('ranges_read',[[r.get('line_start'),r.get('line_end')]]))
  ranges=[[x.get('line_start',x.get('start_line')),x.get('line_end',x.get('end_line'))]if isinstance(x,dict)else x for x in ranges]
  assert ranges==[[1,lines]],(r['path'],ranges)
  assert r.get('tests_executed',0)in[False,0]
  assert r['path']not in read
  read[r['path']]={**base,'roster_index':i,'reviewer':r.get('reviewer',owner),
   'review_status':'COMPLETED_MANUAL_READING','review_level':'semantic',
   'review_provenance':'own_semantic'if owner=='database'else'peer_semantic',
   'review_basis':artifact,'reviewed_ranges':ranges,'tests_executed':False,
   'manual_adjudication':r}
  accepted+=1
 artifacts.append({'owner':owner,'artifact':artifact,'artifact_sha256':hashlib.sha256(raw).hexdigest(),
  'allocation_indices':[start,end],'completed_files':accepted})
files=sorted(read.values(),key=lambda r:r['roster_index'])
result={'schema_version':1,'source_head':HEAD,'status':'COMPLETED_MANUAL_READING'if len(files)==156 else'IN_PROGRESS',
 'roster':'test-review-roster.json','roster_sha256':hashlib.sha256((OUT/'test-review-roster.json').read_bytes()).hexdigest(),
 'allocated_files':156,'allocated_lines':sum(r['line_end']for r in roster['files']),
 'read_files':len(files),'read_lines':sum(r['line_end']for r in files),
 'counts_by_review_provenance':dict(collections.Counter(r['review_provenance']for r in files)),
 'counts_by_reviewer':dict(collections.Counter(r['reviewer']for r in files)),
 'pending_paths':[r['path']for r in roster['files']if r['path']not in read],
 'review_artifacts':artifacts,'files':files,'runtime_tested':False,'suites_executed':0,
 'limits':['Per-file assertions, fixtures/mocks and limits were manually reviewed by the attributed owner.',
  'No suite, SQL, service or PostgreSQL was executed. Reading is not passing acceptance.',
  'Cross-area overlaps remain a single path in this roster; global consolidation must deduplicate paths.',
  'Pending allocations are never promoted to semantic coverage.']}
(OUT/'test-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
md=['# Revisão finita de testes atribuídos à frente de banco','',
 f"Fonte `{HEAD}`. {len(files)}/156 arquivos e {result['read_lines']}/14463 linhas lidos integralmente. Nenhuma suíte, SQL, PostgreSQL ou serviço foi executado.",'',
 'Cada arquivo mantém o registro original de quem leu assertions, fixtures/mocks, contratos e limites. Autoria peer não foi convertida em leitura própria. A cobertura global deve deduplicar por path, inclusive axe-campanhas já presente no roster modules.','',
 '| Revisor | Intervalo original [início,fim) | Arquivos concluídos | Prova |','|---|---|---:|---|']
for a in artifacts:md.append(f"| {a['owner']} | {a['allocation_indices']} | {a['completed_files']} | `{a['artifact']}` |")
md += ['', 'O JSON contém, por arquivo, o hash Git e SHA-256, a faixa1–EOF e a adjudicação original. A presença de um teste ou a leitura dele não atesta que passe, cubra a cadeia SQL vigente ou opere sob papéis reais.']
if result['pending_paths']:md += ['', 'Pendentes:', '']+['- `'+p+'`'for p in result['pending_paths']]
(OUT/'test-review.md').write_text('\n'.join(md)+'\n')
print(json.dumps({k:result[k]for k in ['status','read_files','read_lines','allocated_files','allocated_lines']}))
