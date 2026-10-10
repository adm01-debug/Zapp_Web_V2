import os,re,json
w=os.environ['W']; st=os.environ['ST']; novas=[x for x in os.environ['NOVAS'].split('\n') if x]
falhas=open(os.path.join(st,'falhas.tsv'),encoding='utf-8').read() if os.path.exists(os.path.join(st,'falhas.tsv')) else ''
ruins=[n for n in novas if n in falhas]
if ruins: print('migration pendente falhou no conjunto: '+', '.join(ruins)); raise SystemExit(1)
texto=' '.join(open(os.path.join(w,'supabase','migrations',n),encoding='utf-8',errors='ignore').read().lower() for n in novas)
def cita(x):
    return bool(x) and re.search(r'\b' + re.escape(x) + r'\b', texto) is not None
def nome_funcao(obj):
    m = re.match(r'f:([a-z_0-9]+)\(', obj + '(')
    return m.group(1) if m else ''
def explicada(l):
    # cada tipo de diferença tem a sua prova: objeto (coluna, índice, função...) ou papel (permissão)
    partes = l.split('|')
    tipo = partes[0]
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
try:
    RETRATO=json.load(open(os.path.join(w,'supabase','schema-manifest.json'),encoding='utf-8'))
except Exception:
    RETRATO={}   # sem retrato legível não há como provar drift antigo: vale a regra estrita
def nomes_do_objeto(chave):
    # nomes que a linha do diff nomeia (tabela, coluna, função, papel...), sem prefixo de seção,
    # assinatura, papel nem ACL; as aspas dos nomes escolhidos a mão saem fora
    obj=chave
    if obj[:2] in ('r:', 't:', 'f:', 'i:', 'v:'): obj=obj[2:]
    obj=re.sub(r'^[a-z_]+:', '', obj)        # 'relation:' dos constraints, por exemplo
    obj=obj.split('(')[0].split('|')[0]
    return [x.strip('"').lower() for x in obj.split('.')
            if x.strip('"') and x.strip('"').lower() not in ('public', 'auth', 'storage', 'pg_catalog')]
try:
    APLICADAS=' '.join(open(os.path.join(w,'supabase','migrations',n),encoding='utf-8',errors='ignore').read().lower()
                       for n in sorted(os.listdir(os.path.join(w,'supabase','migrations')))
                       if n.endswith('.sql') and n not in novas)
except Exception:
    APLICADAS=''     # sem o texto das já aplicadas só resta a prova pelo retrato
NAO_PALAVRA='A-Za-z0-9_'
def nao_palavra(n):
    # fronteira de palavra sem o escape de barra invertida (ele nao sobrevive à geracao do patch):
    # mesmo efeito da fronteira de palavra para nomes que começam e terminam em letra/digito/_
    return re.search('(?<![' + NAO_PALAVRA + '])' + re.escape(n) + '(?![' + NAO_PALAVRA + '])', APLICADAS) is not None
def drift_canonico(l):
    # Diferença que NÃO vem do cartão. Duas provas: (a) o objeto já existe no retrato canônico da cópia
    # (a produção já o alcançou); (b) o objeto vem de migration JÁ APLICADA na base canônica (a versão
    # está no registro da produção). Em qualquer das duas, nenhuma migration PENDENTE pode citar o
    # objeto nem o seu dono: o que a pendente cita continua provado pelo explicada(); o que só existe
    # na cópia (objeto novo do cartão) continua vermelho.
    if not RETRATO or '|' not in l: return False
    tipo, chave = l.split('|', 1)
    nomes=nomes_do_objeto(chave)
    for n in nomes:
        if cita(n): return False             # migration pendente mexe no objeto: a diferença é do cartão
    if isinstance(RETRATO.get(tipo), dict) and chave in RETRATO[tipo]:
        return True
    if not nomes or not APLICADAS: return False
    for n in nomes:
        if not nao_palavra(n): return False
    return True

l='indexes|r:public.sonda_cartao.sonda_cartao_pkey'
if explicada(l): print('EXPLICADA')
elif 'drift_canonico' in globals() and drift_canonico(l): print('DRIFT (nao debitada)')
else: print('DEBITADA')
