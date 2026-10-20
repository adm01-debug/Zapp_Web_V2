"""Print referenced source bodies for human review; does not mark them reviewed."""
from pathlib import Path
import json,re,sys
ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT=Path(__file__).parent
mode=sys.argv[1]
if mode=='do':
    allrows=json.loads((OUT/'do_review.json').read_text())['do_blocks']
    start=int(sys.argv[2]);end=int(sys.argv[3])
    rows=allrows[start-1:end]
else:
    roster=json.loads((OUT/'policy_review.json').read_text())
    allrows=roster['policies']+roster['source_extras']
    wanted=set(sys.argv[2:])
    rows=[r for r in allrows if r['table'] in wanted or r['table'].removeprefix('public.') in wanted or r['identity'] in wanted]
seen=set()
for r in rows:
    scope = 'DO' if mode=='do' else 'SNAPSHOT' if r.get('snapshot_identity') else 'SOURCE_EXTRA'
    print('\nOBJECT',r['identity'],r['coverage_level'],scope)
    sources=[r['source']] if mode=='do' else r['source_definition_statements']+r['conditional_role_scope_blocks']
    for e in sources:
        key=(e['path'],e['start_line'],e['end_line'])
        print('SOURCE',e['path'],f"{e['start_line']}–{e['end_line']}",'SHA256',e['file_sha256'])
        if key in seen:
            print('(same body printed above in this batch)');continue
        seen.add(key)
        lines=(ROOT/e['path']).read_text().splitlines()
        for n in range(e['start_line'],e['end_line']+1):
            # Credential-shaped historical SQL literals are not needed for review.
            text=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT_LITERAL]',lines[n-1])
            text=re.sub(r'sb_secret_[A-Za-z0-9_-]+','[REDACTED_SECRET_LITERAL]',text)
            print(f'{n}: {text}')
