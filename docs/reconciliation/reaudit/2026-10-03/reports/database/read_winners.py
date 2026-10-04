"""Print explicitly selected current SQL bodies, never query a database."""
import json,sys,re
from pathlib import Path
ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT=Path(__file__).parent
roster=json.loads((OUT/'function_review.json').read_text())['functions']
selected=set(sys.argv[1:])
for row in roster:
    sig=row['identity'];name=sig.split('(',1)[0].split('.')[-1]
    if name not in selected and sig not in selected:continue
    e=row['candidate_effective_definition']
    lines=(ROOT/e['path']).read_text().splitlines()
    body='\n'.join(f'{i+1}: {lines[i]}' for i in range(e['start_line']-1,e['end_line']))
    if re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|sk-[A-Za-z0-9_-]{25,}|AKIA[0-9A-Z]{16}',body):
        print('SKIPPED credential-like literal',sig);continue
    print('\nFUNCTION',sig,'ACL',','.join(row['snapshot_execute_grantees']))
    print(e['path'],e['file_sha256'])
    print(body)
