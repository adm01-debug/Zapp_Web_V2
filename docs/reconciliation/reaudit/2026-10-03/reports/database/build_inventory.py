"""Offline lexical inventory; never executes SQL or contacts a database.

This is not a PostgreSQL parser or proof of migration replay. Dollar quoted DO
blocks are classified separately; dynamic SQL is not projected into final state.
"""
from pathlib import Path
import hashlib, json, re, collections

ROOT = Path('/workspace/scratch/f8f9b9cbce53/reaudit/source')
OUT = Path(__file__).parent
HEAD = 'da307ba5626dce892f0b37cb6762463f55d14a96'

def sha(s): return hashlib.sha256(s.encode() if isinstance(s, str) else s).hexdigest()

def statements(text):
    start = 0; i = 0; n = len(text); state = None; dollar = ''; depth = 0
    while i < n:
        c = text[i]; d = text[i:i+2]
        if state == 'line':
            if c == '\n': state = None
        elif state == 'block':
            if d == '/*': depth += 1; i += 1
            elif d == '*/':
                depth -= 1; i += 1
                if depth == 0: state = None
        elif state in ('single', 'double'):
            q = "'" if state == 'single' else '"'
            if c == q:
                if text[i+1:i+2] == q: i += 1
                else: state = None
        elif state == 'dollar':
            if text.startswith(dollar, i): i += len(dollar)-1; state = None
        elif d == '--': state = 'line'; i += 1
        elif d == '/*': state = 'block'; depth = 1; i += 1
        elif c == "'": state = 'single'
        elif c == '"': state = 'double'
        elif c == '$':
            m = re.match(r'\$(?:[A-Za-z_][\w]*)?\$', text[i:])
            if m: dollar = m.group(); state = 'dollar'; i += len(dollar)-1
        elif c == ';':
            yield start, i+1, text[start:i+1]; start = i+1
        i += 1
    if text[start:].strip(): yield start, n, text[start:]

def leading_sql(s):
    offset = 0
    while True:
        m = re.match(r'\s+', s[offset:])
        if m: offset += m.end()
        if s[offset:offset+2] == '--':
            j = s.find('\n', offset); offset = len(s) if j < 0 else j+1
        elif s[offset:offset+2] == '/*':
            j = s.find('*/', offset+2); offset = len(s) if j < 0 else j+2
        else: return offset, s[offset:]

NAME = r'(?:"[^"]+"|[\w]+)(?:\.(?:"[^"]+"|[\w]+))?'

def parens(s, opening):
    depth = 0; q = None
    for i in range(opening, len(s)):
        c = s[i]
        if q:
            if c == q: q = None
        elif c in "'\"": q = c
        elif c == '(': depth += 1
        elif c == ')':
            depth -= 1
            if not depth: return s[opening+1:i], i
    return '', opening

def split_args(s):
    parts=[]; depth=0; q=None; start=0
    for i,c in enumerate(s):
        if q:
            if c == q: q = None
        elif c in "'\"": q = c
        elif c in '([': depth += 1
        elif c in ')]': depth -= 1
        elif c == ',' and not depth: parts.append(s[start:i].strip()); start=i+1
    if s[start:].strip(): parts.append(s[start:].strip())
    return parts

def arg_types(raw, created=False):
    res=[]
    for arg in split_args(re.sub(r'--[^\n]*', '', raw)):
        arg = re.split(r'\s+DEFAULT\s+|\s*=\s*', arg, maxsplit=1, flags=re.I)[0].strip()
        toks=arg.split()
        if not toks: continue
        if toks[0].upper()=='OUT': continue
        if toks[0].upper() in ['IN','INOUT','VARIADIC']: toks=toks[1:]
        if created and len(toks)>1 and toks[0].lower() not in ['timestamp','time','double','character','bit']:
            toks=toks[1:]
        t=' '.join(toks).lower().replace('public.', '').replace('"','')
        t=re.sub(r'\s+', ' ', t)
        t={'int':'integer','int4':'integer','int8':'bigint','bool':'boolean','timestamp with time zone':'timestamptz','timestamp without time zone':'timestamp','varchar':'character varying'}.get(t,t)
        res.append(t)
    return ','.join(res)

def qname(name):
    name=name.lower().replace('"','')
    return name if '.' in name else 'public.'+name

def ident_name(name):
    return name[1:-1].replace('""','"') if name.startswith('"') else name.lower()

def parse_function(s, created):
    p = r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION' if created else r'(?:DROP|ALTER)\s+FUNCTION(?:\s+IF\s+EXISTS)?'
    m=re.match(p+r'\s+('+NAME+r')\s*\(', s, re.I)
    if not m: return None
    raw,end=parens(s,m.end()-1)
    return qname(m.group(1))+'('+arg_types(raw,created)+')', raw, end

def main():
    files=[]; events=[]; funcs={}; histories=collections.defaultdict(list); policies={}; views={}; triggers={}; tables={}; others=[]
    for path in sorted(ROOT.rglob('*.sql')):
        rel=path.relative_to(ROOT).as_posix(); text=path.read_text(errors='replace'); active=path.parent == ROOT/'supabase/migrations'
        cat='active_migration' if active else ('archived_migration' if rel.startswith('supabase/migrations/') else 'snapshot' if rel.startswith(('supabase-export/','docs/migration/source-ddl/')) else 'test' if ('test' in rel or rel.startswith('e2e/')) else 'audit_or_support')
        files.append({'path':rel,'sha256':sha(path.read_bytes()),'lines':text.count('\n')+int(not text.endswith('\n')),'category':cat})
        if not active: continue
        for a,b,raw in statements(text):
            o,s=leading_sql(raw)
            if not s.strip(): continue
            line=text.count('\n',0,a+o)+1
            # The end offset is exclusive. Ignore trailing whitespace so a final
            # newline does not invent a line after EOF (including no-semicolon SQL).
            last_character = a + len(raw.rstrip()) - 1
            e={'path':rel,'start_line':line,'end_line':text.count('\n',0,last_character)+1,'file_sha256':sha(path.read_bytes()),'statement_sha256':sha(s),'operation':re.sub(r'\s+',' ', s[:120]).split(' ',1)[0].upper()}
            f=parse_function(s,True)
            d=parse_function(s,False)
            if f:
                key,args,end=f; e.update(kind='function',action='create_or_replace',identity=key,arguments=args,security_definer=bool(re.search(r'\bSECURITY\s+DEFINER\b',s,re.I)),search_path=bool(re.search(r'\bSET\s+search_path\b',s,re.I)),auth_uid=bool(re.search(r'auth\.uid\s*\(',s,re.I)),auth_role=bool(re.search(r'auth\.role\s*\(',s,re.I)),returns_trigger=bool(re.search(r'RETURNS\s+trigger\b',s,re.I)))
                funcs[key]=e.copy(); histories[key].append(e.copy())
            elif d:
                key,args,end=d; action=e['operation'].lower();e.update(kind='function',action=action,identity=key,arguments=args)
                histories[key].append(e.copy())
                if action=='drop': funcs.pop(key,None)
                elif key in funcs:
                    funcs[key].setdefault('alter_events',[]).append(e.copy())
            else:
                pm=re.match(r'(CREATE|DROP|ALTER)\s+POLICY(?:\s+IF\s+EXISTS)?\s+("[^"]+"|[\w]+)\s+ON\s+('+NAME+r')',s,re.I)
                vm=re.match(r'(CREATE\s+(?:OR\s+REPLACE\s+)?|DROP\s+|ALTER\s+)(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?('+NAME+r')',s,re.I)
                tm=re.match(r'(CREATE(?:\s+OR\s+REPLACE)?|DROP)\s+(?:CONSTRAINT\s+)?TRIGGER(?:\s+IF\s+EXISTS)?\s+("[^"]+"|[\w]+)(?:\s+[^;]*?)?\s+ON\s+('+NAME+r')',s,re.I)
                tab=re.match(r'(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?|DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?)(?:ONLY\s+)?('+NAME+r')',s,re.I)
                if pm:
                    key=qname(pm.group(3))+'.'+ident_name(pm.group(2));e.update(kind='policy',action=pm.group(1).lower(),identity=key)
                    if pm.group(1).upper()=='DROP': policies.pop(key,None)
                    else: policies[key]=e.copy()
                elif vm:
                    key=qname(vm.group(2));e.update(kind='view',identity=key,action=vm.group(1).strip().lower(),security_invoker=bool(re.search(r'security_invoker\s*=\s*(?:true|on|1)',s,re.I)))
                    if e['operation']=='DROP': views.pop(key,None)
                    elif e['operation']=='ALTER':
                        if key in views: views[key].setdefault('alter_events',[]).append(e.copy())
                    else: views[key]=e.copy()
                elif tm:
                    key=qname(tm.group(3))+'.'+ident_name(tm.group(2));e.update(kind='trigger',action=tm.group(1).lower(),identity=key)
                    if e['operation']=='DROP': triggers.pop(key,None)
                    else: triggers[key]=e.copy()
                elif tab:
                    key=qname(tab.group(2));e.update(kind='table',identity=key,action=e['operation'].lower())
                    tables.setdefault(key,[]).append(e.copy())
                elif re.match(r'(?:GRANT|REVOKE|ALTER\s+DEFAULT\s+PRIVILEGES)\b',s,re.I):e['kind']='privilege'
                elif re.match(r'DO\b',s,re.I): e['kind']='dynamic_do';others.append(e.copy())
                else:e['kind']='other'
            events.append(e)
    final={'head':HEAD,'method':'lexical/top-level; dynamic DO not expanded; overloads normalized approximately, targeted evidence must be inspected','file_count':len(files),'active_migration_count':sum(x['category']=='active_migration' for x in files),'files':files,'counts_by_category':dict(collections.Counter(x['category'] for x in files)),'event_counts':dict(collections.Counter(x['kind'] for x in events)),'events':events,'candidate_final_functions':funcs,'function_histories':histories,'candidate_final_policies':policies,'candidate_final_views':views,'candidate_final_triggers':triggers,'table_histories':tables,'unexpanded_dynamic_do':others}
    OUT.mkdir(parents=True,exist_ok=True);(OUT/'sql_inventory.json').write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:final[k] for k in ['head','file_count','active_migration_count','counts_by_category','event_counts']},indent=2))
    print('Candidate final functions:',len(funcs),'policies:',len(policies),'views:',len(views),'triggers:',len(triggers),'table histories:',len(tables))

if __name__=='__main__':main()
