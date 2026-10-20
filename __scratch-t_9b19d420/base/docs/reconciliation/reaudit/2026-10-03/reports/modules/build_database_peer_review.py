import hashlib,json
from pathlib import Path
from collections import Counter
B=Path('/workspace/scratch/f8f9b9cbce53/reaudit');S=B/'source';O=B/'reports/modules'
head='da307ba5626dce892f0b37cb6762463f55d14a96'
roster=json.loads((B/'reports/database/test-review-roster.json').read_text())
assert roster['source_head']==head
notes=json.loads((O/'database-peer-notes.json').read_text())
journal=[json.loads(x) for x in (O/'database-peer-read-journal.jsonl').read_text().splitlines()]
files=[]
for i in range(104,156):
 e=roster['files'][i];raw=(S/e['path']).read_bytes(); count=len(raw.decode().splitlines());sha=hashlib.sha256(raw).hexdigest();blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
 assert sha==e['source_sha256'] and blob==e['git_blob_sha'] and count==e['line_end']
 assert any(j['index']==i and j['path']==e['path'] and j['line_start']==1 and j['line_end']==count and j['source_sha256']==sha for j in journal)
 assert str(i) in notes
 item={**e,'allocation_index':i,'reviewer':'/root/grill_me_primary_review','review_level':'semantic','review_status':'COMPLETE_FINITE_TEST_READING','ranges_read':[[1,count]],'symbols_read':'Corpo integral: imports, fixtures/mocks/helpers, cada callback de teste e assertion; nenhuma execução de suíte.','adjudication':notes[str(i)],'test_execution':'NOT_RUN','remaining_gaps':[notes[str(i)]['limits']]}
 if i==146:item['shared_read_reference']='reports/modules/test-review.json'
 files.append(item)
assert len(files)==52 and len(notes)==52
out={'schema_version':1,'source_head':head,'reviewer':'/root/grill_me_primary_review','owner':'database','status':'COMPLETE_FINITE_TEST_READING','allocation':'reports/database/test-review-roster.json files[104:156], ordem original preservada','files':files,'summary':{'files_reviewed':52,'source_lines_read':sum(e['line_end'] for e in files),'adjudication_kinds':dict(Counter(e['adjudication']['kind'] for e in files)),'shared_with_modules_original_roster':1,'suites_executed':0,'sql_executed':0,'new_findings':0},'validation':{'all_source_sha256_match_roster':True,'all_git_blob_sha_match_roster':True,'all_ranges_equal_1_to_eof':True,'all_read_journal_entries_present':True,'all_52_have_individual_adjudication':True},'limits':['Leitura semântica de testes não é resultado de execução; nenhuma suíte, banco, rede ou serviço acionado.','Cópias locais 110/113/114 são loci da família GOV003/TC011 do root; contratos textuais explicitamente distintos de controles comportamentais.','Nenhum arquivo de produção ou artefato do dono database foi alterado.','O registro 146 repete arquivo já lido no lote próprio; a união global deve deduplicar por path/hash.']}
(O/'database-peer-test-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
lines=['# Revisão complementar de testes — lote database 104–155','',f'Fonte fixada em `{head}`. Leitura integral de 52 arquivos / {out["summary"]["source_lines_read"]} linhas, com hash SHA-256, blob Git e faixas 1–EOF conferidos. Nenhuma suíte, SQL ou serviço foi executado. A cobertura compartilhada de axe-campanhas deve ser deduplicada na união global.','', 'Os testes que importam helpers ou handlers reais foram separados de réplicas locais, contratos textuais, suporte de mocks e integração condicional. Réplicas locais de normalização e RLS foram comunicadas ao root como evidência da família GOV003/TC011, sem novo ID neste lote.','']
for e in files:
 a=e['adjudication'];lines += [f'## {e["allocation_index"]}. {e["path"]}','',f'Faixa: 1–{e["line_end"]}; blob `{e["git_blob_sha"]}`. Categoria: `{a["kind"]}`.','',a['positive'],'',a['limits'],'']
(O/'database-peer-test-review.md').write_text('\n'.join(lines))
print(json.dumps(out['summary'],ensure_ascii=False));print(json.dumps(out['validation']))
