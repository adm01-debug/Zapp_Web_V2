"""Import completed peer adjudications with immutable provenance; never executes tests."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

out = Path(__file__).resolve().parent
source = Path(os.environ.get('SOURCE', os.environ.get('INBOX_SOURCE_ROOT', str(out.parents[1] / 'source')))).resolve()
roster_bytes = (out / 'test-review-roster.json').read_bytes()
roster = json.loads(roster_bytes)
head = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
assert head == roster['source_head'], 'source HEAD mismatch'
inputs = [Path(arg).resolve() for arg in sys.argv[1:]]
assert inputs, 'Pass the completed peer JSON records as arguments.'
updates = []
copies = []
seen = set()
for peer_path in inputs:
    raw_peer = peer_path.read_bytes()
    peer = json.loads(raw_peer)
    assert peer['source_head'] == head
    assert peer['allocation_roster_sha256'] == hashlib.sha256(roster_bytes).hexdigest()
    assert peer['status'] == 'COMPLETED_REVIEW_PASS' and not peer['tests_executed']
    assert not peer['pending_indices']
    assert len(peer['files']) == peer['reviewed_files'] == peer['total_files']
    assert sum(row['line_end'] for row in peer['files']) == peer['actual_lines_read']
    peer_sha = hashlib.sha256(raw_peer).hexdigest()
    copy_relative = Path('peer-evidence') / peer_path.name
    copies.append((out / copy_relative, raw_peer))
    for row in peer['files']:
        index = row['roster_index']
        assert index not in seen, ('duplicate peer index', index)
        seen.add(index)
        allocated = roster['files'][index]
        assert row['review_status'] == 'SEMANTIC_FILE_REVIEW' and not row['runtime_executed']
        assert row['reviewer'] == peer['reviewer'] == 'root'
        assert row['path'] == allocated['path']
        assert row['line_start'] == 1 and row['line_end'] == allocated['line_end']
        content = (source / row['path']).read_bytes()
        blob = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
        digest = hashlib.sha256(content).hexdigest()
        assert blob == row['git_blob_sha'] == allocated['git_blob_sha'], row['path']
        assert digest == row['source_sha256'] == allocated['source_sha256'], row['path']
        assert len(content.decode().splitlines()) == row['line_end']
        assert row['adjudication'] and all(isinstance(item, str) and item.strip() for item in row['adjudication'])
        updates.append({
            'index': index + 1,
            'reviewer': row['reviewer'],
            'review_basis': 'PEER_SEMANTIC_REVIEW',
            'peer_record': str(copy_relative),
            'peer_record_sha256': peer_sha,
            'peer_roster_index': index,
            'peer_adjudication': row['adjudication'],
            'adjudication': '\n\n'.join(row['adjudication']),
            'proves': [],
            'mocks_and_fixtures': [],
            'limits': [row['limits']],
            'finding_relationships': [],
        })
assert seen == set(range(80, 125)), ('peer allocation mismatch', sorted(seen))
current = json.loads((out / 'test-review.json').read_text())
for update in updates:
    old = current['files'][update['index'] - 1]
    assert old['review_status'] == 'PENDING_READING' or old.get('review_basis') == 'PEER_SEMANTIC_REVIEW'
# No writes until all input records and all source files passed validation.
for target, raw in copies:
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(raw)
subprocess.run([sys.executable, str(out / 'record_test_reviews.py')], input=json.dumps(updates), text=True, check=True)
print(json.dumps({'imported_peer_files': len(updates), 'peer_reviewer': 'root', 'all_source_hashes_checked': True}))
