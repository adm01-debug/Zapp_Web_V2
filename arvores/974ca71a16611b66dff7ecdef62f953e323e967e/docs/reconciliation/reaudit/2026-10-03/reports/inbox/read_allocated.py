"""Read pinned source ranges only. Does not import or run the files being reviewed."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import subprocess

out = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--roster', type=Path, required=True)
parser.add_argument('--journal', type=Path, required=True)
parser.add_argument('--source', type=Path, default=Path(os.environ.get('SOURCE', os.environ.get('INBOX_SOURCE_ROOT', str(out.parents[1] / 'source')))))
parser.add_argument('ranges', nargs='+', help='Zero-based roster index, optionally index:start:end.')
args = parser.parse_args()
roster_bytes = args.roster.read_bytes()
roster = json.loads(roster_bytes)
assert subprocess.check_output(['git', '-C', str(args.source), 'rev-parse', 'HEAD'], text=True).strip() == roster['source_head']
for spec in args.ranges:
    bits = spec.split(':')
    index = int(bits[0])
    row = roster['files'][index]
    raw = (args.source / row['path']).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    digest = hashlib.sha256(raw).hexdigest()
    assert blob == row['git_blob_sha'], row['path']
    assert digest == row['source_sha256'], row['path']
    lines = raw.decode().splitlines()
    assert len(lines) == row['line_end'], row['path']
    start = int(bits[1]) if len(bits) > 1 else 1
    end = int(bits[2]) if len(bits) > 2 else len(lines)
    assert 1 <= start <= end <= len(lines)
    print(f'\nROSTER INDEX {index} {row["path"]} LINES {start}-{end}/{len(lines)}')
    for number in range(start, end + 1):
        print(f'{number:4} {lines[number - 1]}')
    with args.journal.open('a') as stream:
        stream.write(json.dumps({'roster_index': index, 'path': row['path'], 'start': start, 'end': end, 'source_head': roster['source_head'], 'source_sha256': digest, 'git_blob_sha': blob, 'roster_sha256': hashlib.sha256(roster_bytes).hexdigest(), 'read_requested_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}) + '\n')
