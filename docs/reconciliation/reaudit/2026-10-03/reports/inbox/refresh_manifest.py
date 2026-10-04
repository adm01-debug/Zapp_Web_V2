from pathlib import Path
import hashlib
import json
import datetime

out = Path(__file__).resolve().parent
findings = json.loads((out / 'findings.json').read_text())
extensions = {'.json', '.jsonl', '.md', '.py', '.mjs'}
files = []
for path in sorted(out.rglob('*')):
    if not path.is_file() or path.suffix not in extensions:
        continue
    relative = path.relative_to(out)
    if '__pycache__' in relative.parts or relative == Path('deliverable-manifest.json'):
        continue
    raw = path.read_bytes()
    files.append({'path': str(relative), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()})
result = {'source_sha': findings['source_sha'], 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': files}
target = out / 'deliverable-manifest.json'
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'artifacts': len(files), 'manifest_sha256': hashlib.sha256(target.read_bytes()).hexdigest()}))
