"""Import the six allocated Database shell reviews; source is never executed."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

out = Path(__file__).resolve().parent
source = Path(os.environ.get('SOURCE', os.environ.get('INBOX_SOURCE_ROOT', str(out.parents[1] / 'source')))).resolve()
roster_raw = (out / 'shell-review-roster.json').read_bytes()
roster = json.loads(roster_raw)
head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
assert head == roster['source_head']
peer_path = Path(sys.argv[1]).resolve()
peer_raw = peer_path.read_bytes()
peer = json.loads(peer_raw)
assert peer['source_head'] == head
assert peer['roster_sha256'] == hashlib.sha256(roster_raw).hexdigest()
assert peer['status'].startswith('COMPLETED'), peer['status']
assert not peer['shell_executed'] and not peer['sql_executed'] and not peer['runtime_tested']
rows = peer['files']
assert len(rows) == 6
assert {r['roster_index_zero_based'] for r in rows} == set(range(6, 12))
updates = []
peer_sha = hashlib.sha256(peer_raw).hexdigest()
copy_relative = Path('peer-evidence') / peer_path.name
for row in rows:
    index = row['roster_index_zero_based']
    allocated = roster['files'][index]
    assert row['reviewer'] == '/root/reaudit_database'
    assert row['review_level'] == 'semantic' and row['review_status'] == 'COMPLETED_MANUAL_READING'
    assert row['path'] == allocated['path'] and row['line_start'] == 1
    raw = (source / row['path']).read_bytes()
    assert row['line_end'] == allocated['line_end'] == len(raw.decode().splitlines())
    assert row['reviewed_ranges'] == [[1, row['line_end']]]
    assert row['source_sha256'] == allocated['source_sha256'] == hashlib.sha256(raw).hexdigest()
    assert row['git_blob_sha'] == allocated['git_blob_sha'] == hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert row['adjudication'].strip() and not row['tests_executed'] and row['remaining_gaps']
    updates.append({'index': index, 'reviewer': 'database', 'review_basis': 'PEER_SEMANTIC_REVIEW', 'peer_record': str(copy_relative), 'peer_record_sha256': peer_sha, 'peer_row': row, 'adjudication': [row['adjudication']], 'limits': ' '.join(row['remaining_gaps'])})
current = json.loads((out / 'shell-review.json').read_text())
for row in updates:
    existing = current['files'][row['index']]
    assert existing['review_status'] == 'PENDING_READING' or existing.get('review_basis') == 'PEER_SEMANTIC_REVIEW'
# Preserve a byte-identical peer record only after all six source pins pass.
(out / copy_relative).write_bytes(peer_raw)
subprocess.run([sys.executable, str(out / 'record_allocated_reviews.py'), '--roster', str(out / 'shell-review-roster.json'), '--target', str(out / 'shell-review.json'), '--start', '0', '--end', '12'], input=json.dumps(updates), text=True, check=True)
print(json.dumps({'peer_files_imported': 6, 'peer_sha256': peer_sha, 'all_pins_checked': True}))
