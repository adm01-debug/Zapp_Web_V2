import json,sys,hashlib
from pathlib import Path
B=Path('/workspace/scratch/f8f9b9cbce53/reaudit'); S=B/'source'; O=B/'reports/modules'
roster=json.loads((B/'reports/database/test-review-roster.json').read_text())['files']
for i in map(int,sys.argv[1:]):
 e=roster[i]; raw=(S/e['path']).read_bytes(); ls=raw.decode().splitlines()
 sha=hashlib.sha256(raw).hexdigest(); blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
 assert sha==e['source_sha256'] and blob==e['git_blob_sha'] and len(ls)==e['line_end']
 print(f"\nFILE {i}: {e['path']} ({len(ls)} lines) blob={blob}")
 for n,l in enumerate(ls,1): print(f'{n:4} {l}')
 with (O/'database-peer-read-journal.jsonl').open('a') as f: f.write(json.dumps(dict(index=i,path=e['path'],line_start=1,line_end=len(ls),source_sha256=sha,git_blob_sha=blob,reviewer='/root/grill_me_primary_review'))+'\n')
