"""Record human semantic adjudications supplied on stdin after pinned body reading."""
from pathlib import Path
import argparse
import collections
import datetime
import hashlib
import json
import os
import subprocess
import sys

out = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--roster', type=Path, required=True)
parser.add_argument('--target', type=Path, required=True)
parser.add_argument('--start', type=int, required=True)
parser.add_argument('--end', type=int, required=True, help='Exclusive zero-based index.')
args = parser.parse_args()
source = Path(os.environ.get('SOURCE', os.environ.get('INBOX_SOURCE_ROOT', str(out.parents[1] / 'source')))).resolve()
raw_roster = args.roster.read_bytes()
roster = json.loads(raw_roster)
assert subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == roster['source_head']
digest = hashlib.sha256(raw_roster).hexdigest()
assigned = list(range(args.start, args.end))
if args.target.exists():
    data = json.loads(args.target.read_text())
    assert data['allocation_roster_sha256'] == digest and data['assigned_indices'] == assigned
else:
    data = {'schema_version': 1, 'source_head': roster['source_head'], 'reviewer': 'inbox', 'allocation_roster': str(args.roster), 'allocation_roster_sha256': digest, 'assigned_indices': assigned, 'files': [], 'tests_executed': 0, 'method': 'Leitura semântica integral de assertions, fixtures, mocks, script e SQL embutido quando presentes; nenhum arquivo revisado foi importado/executado, e não houve suíte, shell de produto, banco ou serviço.'}
    for index in assigned:
        row = dict(roster['files'][index])
        row.update({'roster_index': index, 'reviewer': 'inbox', 'review_status': 'PENDING_READING', 'runtime_executed': False, 'reviewed_ranges': []})
        data['files'].append(row)
for update in json.load(sys.stdin):
    index = update['index']
    assert index in assigned
    row = data['files'][assigned.index(index)]
    raw = (source / row['path']).read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == row['git_blob_sha']
    assert hashlib.sha256(raw).hexdigest() == row['source_sha256']
    assert len(raw.decode().splitlines()) == row['line_end']
    assert update['adjudication'] and update['limits']
    row.update({key: value for key, value in update.items() if key != 'index'})
    row.update({'review_status': 'SEMANTIC_FILE_REVIEW', 'reviewed_ranges': [{'line_start': 1, 'line_end': row['line_end']}]})
data['reviewed_files'] = sum(row['review_status'] == 'SEMANTIC_FILE_REVIEW' for row in data['files'])
data['total_files'] = len(data['files'])
data['pending_indices'] = [row['roster_index'] for row in data['files'] if row['review_status'] != 'SEMANTIC_FILE_REVIEW']
data['status'] = 'COMPLETED_REVIEW_PASS' if not data['pending_indices'] else 'IN_PROGRESS'
data['actual_lines_read'] = sum(row['line_end'] for row in data['files'] if row['review_status'] == 'SEMANTIC_FILE_REVIEW')
data['reviewer_counts'] = dict(collections.Counter(row['reviewer'] for row in data['files'] if row['review_status'] == 'SEMANTIC_FILE_REVIEW'))
data['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
args.target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
md = ['# Revisão semântica alocada — Inbox', '', f'Status **{data["status"]}**; {data["reviewed_files"]}/{data["total_files"]} arquivos, {data["actual_lines_read"]} linhas. Fonte `{data["source_head"]}`; roster SHA-256 `{digest}`.', '', data['method'], '']
for row in data['files']:
    if row['review_status'] != 'SEMANTIC_FILE_REVIEW': continue
    md += [f'## {row["path"]}', '', f'Índice zero-based {row["roster_index"]}; leitura 1–{row["line_end"]}; revisor {row["reviewer"]}. Blob `{row["git_blob_sha"]}`; SHA-256 `{row["source_sha256"]}`.', '']
    md += row['adjudication'] + ['', '**Limites:** ' + row['limits'], '']
args.target.with_suffix('.md').write_text('\n'.join(md))
print(json.dumps({'target': str(args.target), 'status': data['status'], 'reviewed_files': data['reviewed_files'], 'actual_lines_read': data['actual_lines_read']}))
