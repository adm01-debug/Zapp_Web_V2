"""Persist human adjudications supplied as JSON on stdin after reading the bodies."""
from pathlib import Path
import json, sys, hashlib, datetime, collections, os, subprocess
out = Path(__file__).resolve().parent
root = Path(os.environ.get('SOURCE', os.environ.get('INBOX_SOURCE_ROOT', str(out.parents[1] / 'source')))).resolve()
roster_path = out / 'test-review-roster.json'
roster_bytes = roster_path.read_bytes(); roster = json.loads(roster_bytes)
assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == roster['source_head']
target = out / 'test-review.json'
if target.exists():
    data = json.loads(target.read_text())
    assert data['source_head'] == roster['source_head']
    assert data['roster_sha256'] == hashlib.sha256(roster_bytes).hexdigest()
else:
    data = {'schema_version': 1, 'source_head': roster['source_head'], 'owner': 'inbox', 'status': 'IN_PROGRESS', 'roster': str(roster_path), 'roster_sha256': hashlib.sha256(roster_bytes).hexdigest(), 'tests_executed': False, 'files': []}
    for index, row in enumerate(roster['files'], 1):
        data['files'].append({'index': index, 'path': row['path'], 'source_head': roster['source_head'], 'git_blob_sha': row['git_blob_sha'], 'source_sha256': row['source_sha256'], 'line_count': row['line_end'], 'review_status': 'PENDING_READING', 'reviewed_ranges': [], 'test_execution': 'NOT_EXECUTED'})
updates = json.load(sys.stdin)
for update in updates:
    row = data['files'][update['index'] - 1]
    raw = (root / row['path']).read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == row['git_blob_sha']
    assert hashlib.sha256(raw).hexdigest() == row['source_sha256']
    assert len(raw.decode().splitlines()) == row['line_count']
    assert all(key in update for key in ['proves', 'mocks_and_fixtures', 'limits', 'adjudication'])
    row.update(update)
    row['review_status'] = 'SEMANTIC_REVIEW_COMPLETE'
    row['reviewed_ranges'] = [{'line_start': 1, 'line_end': row['line_count']}]
    row.setdefault('finding_relationships', [])
data['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
for row in data['files']:
    if row['review_status'] == 'SEMANTIC_REVIEW_COMPLETE':
        row.setdefault('reviewer', 'inbox')
        row.setdefault('review_basis', 'DIRECT_SEMANTIC_READING')
data['counts'] = dict(collections.Counter(row['review_status'] for row in data['files']))
data['reviewer_counts'] = dict(collections.Counter(row['reviewer'] for row in data['files'] if row['review_status'] == 'SEMANTIC_REVIEW_COMPLETE'))
data['allocated_files'] = len(data['files'])
data['allocated_lines'] = sum(row['line_count'] for row in data['files'])
data['actual_lines_read'] = sum(row['line_count'] for row in data['files'] if row['review_status'] == 'SEMANTIC_REVIEW_COMPLETE')
data['status'] = 'SEMANTIC_REVIEW_COMPLETE' if all(row['review_status'] == 'SEMANTIC_REVIEW_COMPLETE' for row in data['files']) else 'IN_PROGRESS'
data['method'] = 'Leitura integral dos corpos, assertions, fixtures e mocks; confronto de consumidor quando necessário. Nenhuma suíte, banco, browser, microfone ou serviço executado. Roster/journal isolados não contam como revisão.'
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
report = ['# Revisão dos testes — Inbox e contratos associados', '', f'Status: **{data["status"]}**. Fonte `{data["source_head"]}`. Arquivos adjudicados: **{data["counts"].get("SEMANTIC_REVIEW_COMPLETE", 0)}/{data["allocated_files"]}**; linhas efetivamente lidas: **{data["actual_lines_read"]}/{data["allocated_lines"]}**. Suíte não executada.', '', data['method'], '']
report += ['Autoria das leituras: ' + ', '.join(f'{reviewer}: {count} arquivos' for reviewer, count in data['reviewer_counts'].items()) + '. Cada arquivo é contado uma vez; registros peer são preservados por conteúdo e hash.', '']
for row in data['files']:
    if row['review_status'] != 'SEMANTIC_REVIEW_COMPLETE': continue
    report += [f'## {row["index"]:03d} — {row["path"]}', '', f'Leitura integral 1–{row["line_count"]}. Revisor: `{row["reviewer"]}`. Blob `{row["git_blob_sha"]}`; SHA-256 `{row["source_sha256"]}`.', '', '**Adjudicação.** ' + row['adjudication'], '']
    if row.get('peer_record'):
        report += [f'Revisão peer preservada em `{row["peer_record"]}`, SHA-256 `{row["peer_record_sha256"]}`. As observações específicas de assertions, mocks e limites acima são do revisor indicado; não foram contadas como segunda leitura do Inbox.', '']
        report += ['**Limite de execução:** ' + ' '.join(row['limits']), '']
        continue
    report += ['**O que os asserts demonstram:**', '']
    report += ['- ' + item for item in row['proves']]
    report += ['', '**Mocks/fixtures:**', ''] + ['- ' + item for item in row['mocks_and_fixtures']]
    report += ['', '**Limites:**', ''] + ['- ' + item for item in row['limits']]
    if row['finding_relationships']: report += ['', '**Relação com achados.** ' + '; '.join(row['finding_relationships'])]
    report += ['']
(out / 'test-review.md').write_text('\n'.join(report))
print(json.dumps({'status': data['status'], 'counts': data['counts'], 'actual_lines_read': data['actual_lines_read']}, ensure_ascii=False))
