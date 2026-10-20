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
# --- t_699fa539: prova de CRIAÇÃO pelas migrations pendentes (nome gerado e ACL padrão) ---
SEM_COMENTARIO = re.sub(r'--[^\n]*', ' ', texto)   # a prova de criação não aceita 'create table' citado em comentário
IDENT = r'(?:"[^"]+"|[a-z_0-9]+)'
def objetos_criados(comando):
    # objetos que as migrations PENDENTES criam com <comando> (create table / create function): é a prova de
    # que o objeto é DESTE cartão. Comparação exata (o texto já vem em minúsculas), sem prefixo de esquema.
    rx = r'\b' + comando + r'\s+(?:if\s+not\s+exists\s+)?(?:' + IDENT + r'\s*\.\s*)?(' + IDENT + r')'
    return set(m.group(1).strip('"') for m in re.finditer(rx, SEM_COMENTARIO))
CRIADAS = objetos_criados(r'create\s+table')
FUNCOES_CRIADAS = objetos_criados(r'create\s+(?:or\s+replace\s+)?function')
GERADOS = ('_pkey', '_fkey', '_key', '_check', '_excl')
ROTULO = re.compile(r'^[a-z_]+:')   # 'relation:' dos constraints, 'r:' dos grants
def nome_gerado(nome, tabela):
    # nome que o Postgres cria sozinho (a pendente escreve 'primary key'/'references'/'check' inline):
    # prova-se pela TABELA dona — e só quando é a pendente que CRIA a tabela. Nome arbitrário continua vermelho.
    return tabela in CRIADAS and nome.strip('"').lower().endswith(GERADOS)
PAPEIS_PADRAO = ('postgres', 'anon', 'authenticated', 'service_role')   # dono e papéis do bootstrap do Supabase
def explicada(l):
    # cada tipo de diferença tem a sua prova: objeto (coluna, índice, função...) ou papel (permissão)
    partes = l.split('|')
    tipo = partes[0]
    if tipo == 'functions':
        return cita(nome_funcao(partes[1]) if len(partes) > 1 else '')
    if tipo in ('rls', 'columns', 'indexes', 'constraints', 'defaults', 'policies', 'triggers'):
        if len(partes) < 2:
            return False
        obj = partes[1]
        if obj[:2] in ('r:', 't:', 'f:', 'i:'):
            obj = obj[2:]
        obj = obj.split('(')[0]
        alvo = obj.split('.')[-1]
        if tipo == 'policies':
            # a policy é o único nome escolhido a mão: no diff ele vem entre aspas e o \b não casa ao lado delas
            alvo = alvo.strip('"').lower()
        if cita(alvo):
            return True
        if tipo in ('indexes', 'constraints'):
            nomes = obj.split('.')
            tabela = ROTULO.sub('', nomes[-2]).strip('"') if len(nomes) > 1 else ''
            return nome_gerado(alvo, tabela)
        return False
    if tipo in ('relation_grants', 'routine_grants', 'schema_grants'):
        papel = (partes[2] if len(partes) > 2 else '').lower()
        if cita(papel):
            return True
        if tipo == 'routine_grants' and len(partes) > 1 and cita(nome_funcao(partes[1])):
            return True
        if papel not in PAPEIS_PADRAO:
            return False
        # ACL PADRÃO do Supabase: se a pendente CRIA o objeto e não cita o papel em cláusula nenhuma (senão
        # uma das provas acima já teria explicado), ela não concede nem revoga nada para ele — a linha de
        # grant veio do bootstrap do projeto, não deste cartão. O endurecimento de ACL é o cartão 2B.
        if tipo == 'relation_grants':
            return ROTULO.sub('', partes[1].split('.')[-1]).strip('"') in CRIADAS
        if tipo == 'routine_grants':
            return nome_funcao(partes[1]) in FUNCOES_CRIADAS
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
pre=[]; sem=[]
try: linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
except OSError: linhas=[]
for l in linhas:
    if explicada(l): continue
    if drift_canonico(l): pre.append(l); continue
    sem.append(l)
if sem: print('diferença não explicada por migration pendente: '+'; '.join(sem[:3])+(' (+%d)'%(len(sem)-3) if len(sem)>3 else '')); raise SystemExit(1)
print('ok|drift=%d' % len(pre))
for d in pre: print('drift: '+d)
