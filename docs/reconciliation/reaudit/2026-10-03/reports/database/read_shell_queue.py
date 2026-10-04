"""Read fixed audit test allocation, without running any tests."""
from pathlib import Path
import json,sys,hashlib,re
OUT=Path(__file__).parent
ROOT=OUT.parents[1]/'source'
roster=json.loads((OUT/'shell-review-roster.json').read_text())
first,last=map(int,sys.argv[1:3]) # displayed one-based positions
for position in range(first,last+1):
    row=roster['files'][position-1]
    raw=(ROOT/row['path']).read_bytes();lines=raw.decode().splitlines()
    assert hashlib.sha256(raw).hexdigest()==row['source_sha256']
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==row['git_blob_sha']
    assert len(lines)==row['line_end']
    lo,hi=(map(int,sys.argv[3:5]) if len(sys.argv)>3 else (1,len(lines)))
    assert first==last or len(sys.argv)==3
    print(f'\nFILE {position} index={position-1} {row["path"]} total_lines={len(lines)} shown={lo}:{hi}')
    for n in range(lo,hi+1):
        line=lines[n-1]
        line=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT_LITERAL]',line)
        print(f'{n}: {line}')
print('\nREADING_ONLY: no shell or SQL executed; no semantic coverage automatically assigned.')
