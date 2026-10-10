import os,re
w=os.environ['W']; st=os.environ['ST']; novas=[x for x in os.environ['NOVAS'].split('\n') if x]
falhas=open(os.path.join(st,'falhas.tsv'),encoding='utf-8').read() if os.path.exists(os.path.join(st,'falhas.tsv')) else ''
ruins=[n for n in novas if n in falhas]
if ruins: print('migration pendente falhou no conjunto: '+', '.join(ruins)); raise SystemExit(1)
texto=' '.join(open(os.path.join(w,'supabase','migrations',n),encoding='utf-8',errors='ignore').read().lower() for n in novas)
def explicada(l):
    # cada tipo de diferença tem a sua prova: objeto (coluna, índice, função...) ou papel (permissão)
    partes = l.split('|')
    tipo = partes[0]
    def cita(x):
        return bool(x) and re.search(r'\b' + re.escape(x) + r'\b', texto) is not None
    def nome_funcao(obj):
        m = re.match(r'f:([a-z_0-9]+)\(', obj + '(')
        return m.group(1) if m else ''
    if tipo == 'functions':
        return cita(nome_funcao(partes[1]) if len(partes) > 1 else '')
    if tipo in ('columns', 'indexes', 'constraints', 'defaults', 'policies', 'triggers'):
        if len(partes) < 2:
            return False
        obj = partes[1]
        if obj[:2] in ('r:', 't:', 'f:', 'i:'):
            obj = obj[2:]
        return cita(obj.split('(')[0].split('.')[-1])
    if tipo in ('relation_grants', 'routine_grants', 'schema_grants'):
        papel = (partes[2] if len(partes) > 2 else '').lower()
        if cita(papel):
            return True
        if tipo == 'routine_grants' and len(partes) > 1:
            return cita(nome_funcao(partes[1]))
        return False
    if tipo == 'default_grants':
        return 'default privileges' in texto
    return False

linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
ex=d=pr=s=0
for l in linhas:
    if explicada(l): ex+=1; print('EXPLICADA\t'+l)
    elif 'drift_canonico' in globals() and drift_canonico(l): pr+=1; print('DRIFT\t'+l)
    else: s+=1; print('DEBITADA\t'+l)
print('TOTAL=%d EXPLICADAS=%d DRIFT=%d DEBITADAS=%d' % (len(linhas),ex,pr,s))
