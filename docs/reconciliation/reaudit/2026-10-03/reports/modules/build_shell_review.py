from pathlib import Path
import json,hashlib
B=Path('/workspace/scratch/f8f9b9cbce53/reaudit');O=B/'reports/modules';S=B/'source'
r=json.loads((O/'shell-review-roster.json').read_text());notes=json.loads((O/'shell-review-notes.json').read_text());journal=[json.loads(l) for l in (O/'read-journal.jsonl').read_text().splitlines()]
rows=[]
for i,e in enumerate(r['files']):
 raw=(S/e['path']).read_bytes(); count=len(raw.decode().splitlines());sha=hashlib.sha256(raw).hexdigest();blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
 assert sha==e['source_sha256'] and blob==e['git_blob_sha'] and count==e['line_end']
 covered=set()
 for j in journal:
  if j['path']==e['path']:
   assert j['blob_sha']==blob
   covered.update(range(j['line_start'],j['line_end']+1))
 assert set(range(1,count+1)).issubset(covered)
 rows.append({**e,'review_level':'semantic','ranges_read':[[1,count]],'reviewer':'/root/grill_me_primary_review','status':'ADJUDICATED_BODY_READ','adjudication':notes[str(i)],'execution':'NOT_RUN','added_after_initial_inventory':True,'inventory_addition_reason':'Saldo shell identificado pelo gate de linguagens, fora do AST e do roster anterior de testes TypeScript.'})
assert len(rows)==13 and sum(x['line_end'] for x in rows)==3608
helper='scripts/db-audit/pg-cron-concorrencia.py';raw=(S/helper).read_bytes()
obj={'schema_version':1,'source_head':r['source_head'],'reviewer':'/root/grill_me_primary_review','status':'COMPLETE_FINITE_SHELL_READING','counts':{'assigned_files':13,'assigned_lines':3608,'adjudicated':13,'pending':0,'scripts_executed':0,'sql_executed':0},'files':rows,'additional_dependency_read':{'path':helper,'line_start':1,'line_end':85,'git_blob_sha':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),'source_sha256':hashlib.sha256(raw).hexdigest(),'adjudication':'Calcula/imprime concorrência de uma fase, retorna 0 se existem slots. Não compara fases; modela 2/setembro e não usa dow. Limite do teste shell registrado no arquivo correspondente.'},'validation':{'all_sha256_and_git_blob_match_roster':True,'all_ranges_1_to_eof_read':True,'all_files_have_individual_adjudication':True},'limits':['Não houve execução de shell, Docker, PostgreSQL, SQL ou suíte nesta revisão; somente leitura.','Harnesses de migrations reais com schemas reduzidos foram distinguidos de simples réplicas de lógica em testes TypeScript.','O contexto de cada migration histórica não equivale à composição do schema final.','Nenhum novo ID criado; limites concretos comunicados ao root para família GOV003 e cross-reference de DB013.']}
(O/'shell-review.json').write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
md=['# Leitura de scripts shell — módulos','',f'Fonte `{r["source_head"]}`. Lote de 13 arquivos / 3.608 linhas concluído. Hashes SHA-256, blobs Git e faixas 1–EOF conferidos. Nenhum script, Docker, SQL ou serviço foi executado.','', 'Leitura adicional: pg-cron-concorrencia.py, 1–85. Confirma cálculo de uma fase, sem comparação entre antes e depois.','']
for e in rows:
 a=e['adjudication'];md += [f'## {e["path"]}','',f'Faixa 1–{e["line_end"]}; blob `{e["git_blob_sha"]}`.','',a['positive'],'',a['limits'],'',a['runner'],'']
(O/'shell-review.md').write_text('\n'.join(md))
print(json.dumps(obj['counts']))
