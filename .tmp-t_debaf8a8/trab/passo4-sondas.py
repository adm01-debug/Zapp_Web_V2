#!/usr/bin/env python3
# t_debaf8a8 - passo 4: sondas do caso NEGATIVO (drift genuinamente novo) no EXPLICADOR REAL
# do artefato, contra o explicador instalado hoje. Cada sonda e uma arvore minima com:
#   supabase/migrations/<aplicadas>.sql, supabase/migrations/<pendente>.sql, supabase/schema-manifest.json
#   e um estado com check-diferencas.txt. Veredito = rc do explicador (1 = FALHOU/debitado).
import json, os, re, shutil, subprocess, sys

SB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT, T = SB + '/saida', SB + '/trab'
HOJE = '/home/joaquim_ataides/.local/bin/zapp-verify'
NOVO = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo'
os.makedirs(OUT, exist_ok=True)

def extrai(src, dst):
    t = open(src, encoding='utf-8', errors='ignore').read()
    m = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", t, re.S)
    open(dst, 'w', encoding='utf-8').write(m.group(1) + '\n')

EMB = {}
for rot, src in (('HOJE', HOJE), ('NOVO', NOVO)):
    EMB[rot] = T + '/emb4-%s.py' % rot
    extrai(src, EMB[rot])

out = []
def log(s=''):
    print(s)
    out.append(s)

CASOS = []
def caso(nome, retrato, aplicadas, pendente, linhas, esperado_novo, nota='', risco=False):
    CASOS.append(dict(nome=nome, retrato=retrato, aplicadas=aplicadas, pendente=pendente,
                      linhas=linhas, esperado=esperado_novo, nota=nota, risco=risco))

# ---- N1: objeto novo do cartao; a pendente cita a TABELA (indice auto-nomeado) -----
caso('N1 objeto novo do cartao (indice auto-nomeado, tabela citada)',
     {'functions': {'f:antiga()': 'x'}},
     {'20250101000000_base.sql': 'create table public.clientes(id bigint);\n'},
     ('29990101000000_cartao.sql', 'create table public.sonda_cartao(id bigint primary key);\n'),
     ['indexes|sonda_cartao.sonda_cartao_pkey'],
     'SEM', 'a tabela sonda_cartao so existe na migration pendente')

# ---- N2: objeto novo do cartao; NENHUM nome no texto da pendente nem nas aplicadas
caso('N2 objeto novo, nome fora do texto da pendente e fora das aplicadas',
     {'columns': {'clientes.id': 'bigint'}},
     {'20250101000000_base.sql': 'create table public.clientes(id bigint);\n'},
     ('29990101000000_cartao.sql', 'select public.aplicar_patch_dinamico();\n'),
     ['columns|clientes.documento_novo'],
     'SEM', 'documento_novo nao existe em nenhuma migration aplicada')

# ---- N3: linha sem separador ------------------------------------------------------
caso('N3 linha de diferenca sem separador |',
     {'functions': {'f:antiga()': 'x'}},
     {'20250101000000_base.sql': 'select 1;\n'},
     ('29990101000000_cartao.sql', 'select 1;\n'),
     ['linha_estranha_sem_separador'],
     'SEM', 'sem separador nao ha como provar drift canonico')

# ---- N4: retrato canonico ausente/ilegivel na copia -------------------------------
caso('N4 retrato canonico ausente',
     None,
     {'20250101000000_base.sql': 'create table public.clientes(id bigint);\n'},
     ('29990101000000_cartao.sql', 'select 1;\n'),
     ['columns|clientes.documento_novo'],
     'SEM', 'sem retrato legivel vale a regra estrita')

# ---- P1: controle positivo (a diferenca JA esta no retrato da copia) --------------
caso('P1 controle (diferenca ja no retrato da copia)',
     {'functions': {'f:antiga()': 'x'}},
     {'20250101000000_base.sql': 'select 1;\n'},
     ('29990101000000_cartao.sql', 'alter table public.tabela_nova add column col_nova text;\n'),
     ['functions|f:antiga()'],
     'drift', 'a pendente nao cita a funcao: e drift pre-existente')

# ---- R1: SONDA DE RISCO - as duas condicoes que o ajuste exige para silenciar -----
caso('R1 RISCO: nome fora da pendente E presente nas aplicadas',
     {'columns': {'clientes.id': 'bigint'}},
     {'20250101000000_base.sql': 'create table public.clientes(id bigint, telefone text);\n'},
     ('29990101000000_cartao.sql', 'select public.aplicar_patch_dinamico();\n'),
     ['columns|clientes.telefone'],
     'drift', 'DDL por funcao: nem clientes nem telefone aparecem no texto da pendente, '
              'e os dois aparecem numa migration antiga', risco=True)

log('== sondas do caso negativo (explicador real, codigo sem alteracao) ==')
log('%-56s %-7s %-7s %-14s %s' % ('sonda', 'HOJE', 'NOVO', 'esperado(NOVO)', 'situacao'))
resultados = []
for c in CASOS:
    raiz = T + '/fx/' + c['nome'].split()[0]
    if os.path.exists(raiz): shutil.rmtree(raiz)
    W, ST = raiz + '/arvore', raiz + '/st'
    os.makedirs(W + '/supabase/migrations'); os.makedirs(ST)
    if c['retrato'] is not None:
        json.dump(c['retrato'], open(W + '/supabase/schema-manifest.json', 'w', encoding='utf-8'))
    for nome, txt in c['aplicadas'].items():
        open(W + '/supabase/migrations/' + nome, 'w', encoding='utf-8').write(txt)
    pnome, ptxt = c['pendente']
    open(W + '/supabase/migrations/' + pnome, 'w', encoding='utf-8').write(ptxt)
    open(ST + '/check-diferencas.txt', 'w', encoding='utf-8').write('\n'.join(c['linhas']) + '\n')
    open(ST + '/falhas.tsv', 'w').write('')
    veredito = {}
    for rot in ('HOJE', 'NOVO'):
        env = dict(os.environ, W=W, ST=ST, NOVAS=pnome)
        r = subprocess.run(['python3', EMB[rot]], capture_output=True, text=True, env=env)
        veredito[rot] = 'drift' if r.returncode == 0 else 'SEM'
        open('%s/sonda-%s-%s.out' % (OUT, c['nome'].split()[0], rot), 'w').write(
            'rc=%d\n%s\n%s' % (r.returncode, r.stdout, r.stderr))
    ok = veredito['NOVO'] == c['esperado']
    situacao = 'RISCO (medido)' if c['risco'] else ('OK' if ok else 'DIVERGIU')
    log('%-56s %-7s %-7s %-14s %s' % (c['nome'], veredito['HOJE'], veredito['NOVO'],
                                      c['esperado'], situacao))
    resultados.append((c['nome'], veredito['HOJE'], veredito['NOVO'], c['esperado'], ok, c['nota'], c['risco']))

log()
log('== detalhe ==')
for nome, h, n, esp, ok, nota, risco in resultados:
    marca = 'RISCO' if risco else ('OK' if ok else 'DIVERGIU')
    log('* %s\n    HOJE=%s  NOVO=%s  esperado(NOVO)=%s  -> %s\n    %s' % (nome, h, n, esp, marca, nota))
normais = [r for r in resultados if not r[6]]
riscos = [r for r in resultados if r[6]]
div = [r for r in normais if not r[4]]
log()
log('sondas normais=%d conforme=%d divergentes=%d | sondas de risco=%d' % (
    len(normais), len(normais) - len(div), len(div), len(riscos)))
for r in riscos:
    log('risco medido: %s -> NOVO=%s (HOJE=%s)' % (r[0], r[2], r[1]))
open(OUT + '/resumo-passo4.txt', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('OK passo 4')
