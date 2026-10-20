"""Read pinned test source; the journal records requests, never semantic completion."""
from pathlib import Path
import os, sys, json, hashlib, subprocess
out = Path(__file__).resolve().parent
root = Path(os.environ.get('SOURCE', out.parents[1] / 'source')).resolve()
roster = json.loads((out / 'test-review-roster.json').read_text())
assert subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() == roster['source_head']
for arg in sys.argv[1:]:
    parts = arg.split(':')
    index = int(parts[0]); row = roster['files'][index - 1]
    raw = (root / row['path']).read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest() == row['git_blob_sha']
    assert hashlib.sha256(raw).hexdigest() == row['source_sha256']
    lines = raw.decode().splitlines()
    assert len(lines) == row['line_end']
    start = int(parts[1]) if len(parts) > 1 else 1
    end = int(parts[2]) if len(parts) > 2 else len(lines)
    assert 1 <= start <= end <= len(lines)
    print(f'\nTEST {index:03d} {row["path"]} LINES {start}-{end}/{len(lines)}')
    for i in range(start, end + 1): print(f'{i:4d} {lines[i - 1]}')
    with (out / 'read-journal.jsonl').open('a') as log:
        log.write(json.dumps({'path': row['path'], 'start': start, 'end': end, 'total_lines': len(lines), 'test_roster_index': index, 'git_blob_sha': row['git_blob_sha'], 'source_sha256': row['source_sha256']}) + '\n')
