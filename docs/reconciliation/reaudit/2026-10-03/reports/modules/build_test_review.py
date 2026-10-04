"""Validate finite test reading/adjudications; does not execute tests or write source."""
import hashlib
import json
from pathlib import Path

BASE = Path('/workspace/scratch/f8f9b9cbce53/reaudit')
OUT = BASE / 'reports/modules'
roster = json.loads((OUT / 'test-review-roster.json').read_text())
notes_path = OUT / 'test-review-notes.json'
notes = json.loads(notes_path.read_text()) if notes_path.exists() else {}
journal = [json.loads(s) for s in (OUT / 'read-journal.jsonl').read_text().splitlines()]
def merge(spans):
    result = []
    for a,b in sorted(spans):
        if result and a <= result[-1][1] + 1: result[-1][1] = max(result[-1][1], b)
        else: result.append([a,b])
    return result

files = []
for item in roster['files']:
    path = item['path']; raw = (BASE / 'source' / path).read_bytes()
    sha = hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    assert sha == item['git_blob_sha'], path
    assert hashlib.sha256(raw).hexdigest() == item['source_sha256'], path
    total = len(raw.decode().splitlines())
    assert item['line_start'] == 1 and item['line_end'] == total
    own_reads = [r for r in journal if r['path'] == path]
    assert all(r['blob_sha'] == sha for r in own_reads)
    ranges = merge([(r['line_start'],r['line_end']) for r in own_reads])
    note = notes.get(path)
    if note:
        assert ranges == [[1,total]], (path,ranges)
        assert all(k in note for k in ('classification','assertions','mocks_or_fixtures','limits')), path
    row = {
        'path': path, 'git_blob_sha': sha, 'source_sha256': item['source_sha256'],
        'head_sha': roster['source_head'], 'total_lines': total,
        'review_status': 'ADJUDICATED_BODY_READ' if note else 'BODY_READ_AWAITING_ADJUDICATION' if ranges == [[1,total]] else 'PENDING_FULL_BODY_READING',
        'ranges_read': ranges,
        'source_url': f"https://github.com/adm01-debug/Zapp_Web_V2/blob/{roster['source_head']}/{path}",
        'executed': False,
        'adjudication': note,
    }
    files.append(row)
done = sum(r['review_status'] == 'ADJUDICATED_BODY_READ' for r in files)
read = sum(r['ranges_read'] == [[1,r['total_lines']]] for r in files)
result = {
    'schema_version': 1, 'source_head':roster['source_head'], 'reviewer':'/root/grill_me_primary_review',
    'status': 'COMPLETE_FINITE_TEST_READING' if done == len(files) else 'IN_PROGRESS',
    'allocation_roster': 'test-review-roster.json',
    'counting_rule': 'Roster é atribuição. Apenas faixas lidas e adjudicação por arquivo contam como concluídas; nenhum resultado de suíte é afirmado.',
    'counts': {'assigned_files':len(files),'assigned_lines':sum(r['total_lines'] for r in files),'full_body_read':read,'adjudicated':done,'pending':len(files)-done,'tests_executed':0},
    'files':files,
}
(OUT / 'test-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
report = ['# Adjudicação do lote final de testes','',f"Fonte `{roster['source_head']}`. **{done}/{len(files)} arquivos adjudicados**, {read} com leitura integral, de {result['counts']['assigned_lines']:,} linhas atribuídas. Nenhuma suíte, navegador, banco ou serviço foi executado.",'','Cada registro informa assertions, mocks/fixtures e limites concretos. Ausência genérica de testes não recebe um finding. O arquivo de roster conserva a fotografia de atribuição e não substitui este estado de leitura.','','| Arquivo | Estado | Contrato avaliado | Limite concreto |','|---|---|---|---|']
for row in files:
    n = row['adjudication'] or {}
    assertions = ' '.join(n.get('assertions',[])).replace('|','\\|')
    limits = ' '.join(n.get('limits',[])).replace('|','\\|')
    report.append(f"| [{row['path']}]({row['source_url']}) | {row['review_status']} | {assertions} | {limits} |")
report += ['','## Prova de cobertura','','Os hashes SHA-256 e git blob de todos os arquivos foram conferidos contra o roster fixado. Cada adjudicação exige faixa integral correspondente no read-journal.jsonl; o script falha se só há inventário. Leitura de testes não equivale a resultado aprovado em execução. As mudanças de status e conteúdo permanecem em test-review-notes.json e no diário de leitura.','']
(OUT / 'test-review.md').write_text('\n'.join(report))
print(json.dumps(result['counts']))
