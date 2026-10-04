"""Read ranges from the AST-formatted vendor copy and record explicit review spans."""
import hashlib
import json
import sys
from pathlib import Path

base = Path('/workspace/scratch/f8f9b9cbce53/reaudit/reports/modules/vendor')
raw = (base / 'lamejs.readable.js').read_bytes()
manifest = json.loads((base / 'manifest.json').read_text())
assert hashlib.sha256(raw).hexdigest() == manifest['formatted_sha256']
lines = raw.decode().splitlines()
first, last = int(sys.argv[1]), int(sys.argv[2])
assert 1 <= first <= last <= len(lines)
purpose = sys.argv[3] if len(sys.argv) > 3 else 'Vendor body read'
print(json.dumps({'source_path': manifest['source_path'], 'source_git_blob_sha': manifest['source_git_blob_sha'], 'formatted_range': [first, last], 'purpose': purpose}))
for i in range(first, last + 1):
    print(f'{i:5} {lines[i-1]}')
with (base / 'read-journal.jsonl').open('a') as stream:
    stream.write(json.dumps({'line_start': first, 'line_end': last, 'purpose': purpose, 'formatted_sha256': manifest['formatted_sha256']}, ensure_ascii=False) + '\n')
