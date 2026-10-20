"""Record explicit adjudications after whole-file reading of the fixed Bash roster."""
from pathlib import Path
import hashlib, json, sys

root = Path(__file__).resolve().parents[1]
out = root / 'reports/root'
roster = json.loads((out / 'shell-review-roster.json').read_text())
incoming = json.loads(Path(sys.argv[1]).read_text())
dest = out / 'shell-review.json'
data = json.loads(dest.read_text()) if dest.exists() else {
    'schema_version': 1, 'source_head': roster['source_head'], 'owner': 'root', 'files': []}
done = {row['roster_index']: row for row in data['files']}
manual_path = out / 'manual-review.json'
manual = json.loads(manual_path.read_text())
manual_rows = {row['path']: row for row in manual['files']}
for review in incoming:
    idx = review['roster_index']
    row = roster['files'][idx]
    raw = (root / 'source' / row['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == row['source_sha256']
    assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == row['git_blob_sha']
    assert len(raw.splitlines()) == row['line_end']
    assert len(review['adjudication']) >= 2
    recorded = {**row, **review, 'review_status': 'SEMANTIC_FILE_REVIEW',
                'reviewed_ranges': [[1, row['line_end']]], 'runtime_executed': False,
                'limits': 'Leitura integral de Bash, SQL embutido, fixtures, assertivas e limpeza. Nenhum Docker, psql, migration ou serviço foi executado neste passe.'}
    done[idx] = recorded
    manual_rows[row['path']] = {
        'path': row['path'], 'git_blob_sha': row['git_blob_sha'], 'source_sha256': row['source_sha256'],
        'line_start': 1, 'line_end': row['line_end'], 'review_status': 'SEMANTIC_FILE_REVIEW',
        'adjudication': ' '.join(review['adjudication']), 'runtime_executed': False,
        'evidence': 'shell-review.json'}
data['files'] = [done[idx] for idx in sorted(done)]
data['reviewed_files'] = len(done)
data['total_files'] = len(roster['files'])
data['reviewed_lines'] = sum(row['line_end'] for row in data['files'])
data['pending_roster_indices'] = [idx for idx in range(data['total_files']) if idx not in done]
data['status'] = 'COMPLETED_FINITE_SHELL_READING' if not data['pending_roster_indices'] else 'IN_PROGRESS'
dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
manual['files'] = list(manual_rows.values())
manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2) + '\n')
lines = ['# Bash — revisão transversal do root', '',
         f"Fonte: `{data['source_head']}`. Estado: {data['status']}; {data['reviewed_files']}/{data['total_files']} arquivos; {data['reviewed_lines']} linhas.", '',
         'A leitura não equivale à execução dos testes. Controles efetivos e limites de cada prova são preservados.', '']
for row in data['files']:
    url = f"https://github.com/adm01-debug/Zapp_Web_V2/blob/{data['source_head']}/{row['path']}#L1-L{row['line_end']}"
    lines.extend([f"## [{row['path']}]({url})", '', ' '.join(row['adjudication']), ''])
(out / 'shell-review.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'reviewed': data['reviewed_files'], 'total': data['total_files'], 'lines': data['reviewed_lines']}))
