"""Read chosen local SQL instructions; no SQL execution and no auto-marking."""
from pathlib import Path
import json,re,sys

OUT=Path(__file__).parent
ROOT=Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
inventory=json.loads((OUT/'sql_inventory.json').read_text())
queue=json.loads((OUT/'remaining_ddl_inventory.json').read_text())
cache={}

def text(e):
    if e['path'] not in cache:cache[e['path']]=(ROOT/e['path']).read_text().splitlines()
    return '\n'.join(cache[e['path']][e['start_line']-1:e['end_line']])

def qualified(name):
    name=name.strip('"')
    return name if '.' in name else 'public.'+name

index_tables={}
index_units=[]
for e in inventory['events']:
    if e['kind']!='other':continue
    sql=text(e)
    create=re.match(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)\s+ON\s+(?:ONLY\s+)?([\w."]+)',sql,re.I)
    if create:
        index_tables[qualified(create.group(1))]=qualified(create.group(2))
    if re.match(r'(?:CREATE\s+(?:UNIQUE\s+)?INDEX|ALTER\s+INDEX|DROP\s+INDEX)',sql,re.I):index_units.append(e)

index_relation_cache={}
def index_relations(e):
    key=(e['path'],e['start_line'],e['end_line'])
    if key in index_relation_cache:return index_relation_cache[key]
    sql=text(e)
    names=set(re.findall(r'[A-Za-z_][A-Za-z0-9_]*',sql))
    result={table for name,table in index_tables.items() if name.split('.')[-1] in names}
    index_relation_cache[key]=result
    return result

mode=sys.argv[1]
selected=[]
if mode=='tables':
    wanted={qualified(n) for n in sys.argv[2:]}
    for table in sorted(wanted):
        for e in inventory['table_histories'].get(table,[]):selected.append(('table:'+table,e))
        for e in index_units:
            if table in index_relations(e):selected.append(('index_for:'+table,e))
elif mode=='groups':
    wanted=set(sys.argv[2:])
    selected=[(r['group'],r['source']) for r in queue['pending_source_units'] if r['group'] in wanted]
elif mode=='other':
    wanted=set(sys.argv[2:])
    selected=[(name,e) for name,g in queue['other_top_level_categories'].items() if name in wanted for e in g['source_units']]
elif mode=='unbound_indexes':
    selected=[('index_without_table_mapping',e) for e in index_units if not index_relations(e)]
else:
    raise SystemExit('tables names | groups group_names | other group_names | unbound_indexes')

# Optional READ_BEGIN/READ_END select source instructions, without a subprocess,
# network call, or runtime SQL. Selection alone never grants semantic coverage.
import os
lo=int(os.environ.get('READ_BEGIN','1'));hi=int(os.environ.get('READ_END',str(len(selected))))
seen=set()
presented=[]
printed_lines=0
for i,(group,e) in enumerate(selected,1):
    if i<lo or i>hi:continue
    key=(e['path'],e['start_line'],e['end_line'])
    if key in seen:continue
    seen.add(key)
    presented.append({'group':group,'source':e})
    print('\nINSTRUCTION',i,'OF',len(selected),group,e['path'],f"{e['start_line']}–{e['end_line']}")
    for n,line in enumerate(text(e).splitlines(),e['start_line']):
        # Literal credentials are not needed to review structure or side effects.
        line=re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[REDACTED_JWT_LITERAL]',line)
        line=re.sub(r'sb_secret_[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{25,}|AKIA[0-9A-Z]{16}','[REDACTED_SECRET_LITERAL]',line)
        print(f'{n}: {line}');printed_lines+=1
print('\nREAD_OUTPUT_SUMMARY',{'selected_instruction_count':len(selected),'printed_unique_instructions':len(seen),'printed_source_lines':printed_lines,'selection':[lo,hi],'coverage_recorded':False})
(OUT/'ddl_last_presented.json').write_text(json.dumps({'source_head':inventory['head'],
    'request':sys.argv[1:],'selection':[lo,hi],'presented_instructions':presented,
    'status':'presented_only_not_semantically_reviewed'},ensure_ascii=False,indent=2)+'\n')
