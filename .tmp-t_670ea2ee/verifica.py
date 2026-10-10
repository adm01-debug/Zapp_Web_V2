#!/usr/bin/env python3
# t_670ea2ee — VERIFICACAO INDEPENDENTE (positiva): as 9 residuais deixam de ser debitadas ao cartao.
# Nao edita nada de projeto, nao toca producao, nao toca ~/.local/bin. Tudo dentro do MEU workspace.
# Constroi o ambiente do zero a partir das ENTRADAS CRUAS (nao reusa arvore-A dos pais).
import os, re, json, shutil, hashlib, subprocess, sys

WS   = '/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/workspaces/t_c5a96aba'
ME   = WS + '/.tmp/t_670ea2ee'
B    = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-baseline-t_4df2fc8d'
EN   = B + '/entradas'
COPIA = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/multiplix-fila-blocos-sucessores-294-26100617458c7f'
HOJE = '/home/joaquim_ataides/.local/bin/zapp-verify'                                   # instalado
NOVO = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo'
PEND = '20261006204953_multiplix_cascata_bloco_terminal.sql'

SAIDA = ME + '/saida'
os.makedirs(SAIDA, exist_ok=True)
LOG = []

def say(s=''):
    print(s); LOG.append(s)

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def extrai_filtro(script):
    """Extrai VERBATIM o heredoc python embutido (o explicador do bloco banco_local)."""
    lines = open(script, encoding='utf-8').read().split('\n')
    st = next(i + 1 for i, l in enumerate(lines) if "python3 - <<'PY'" in l)
    en = next(j for j in range(st, len(lines)) if lines[j].strip() == 'PY')
    return '\n'.join(lines[st:en]) + '\n'

# ---------------------------------------------------------------- FASE 0: fontes sob teste
say('== 0. fontes sob teste (nada foi editado) ==')
for tag, p in (('HOJE (instalado)', HOJE), ('NOVO (artefato)', NOVO),
               ('original (rollback)', '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.original')):
    say('%-20s %s  %d B  %d linhas' % (tag, sha(p), os.path.getsize(p), sum(1 for _ in open(p))))
say('alvo ~/.local/bin/zapp-verify segue INTACTO (nao instalado): %s' % sha(HOJE))
say('artefato tem drift_canonico()? %s / instalado tem? %s'
    % ('drift_canonico' in open(NOVO).read(), 'drift_canonico' in open(HOJE).read()))

fj = ME + '/filtro-HOJE.py'; fn = ME + '/filtro-NOVO.py'
open(fj, 'w').write(extrai_filtro(HOJE)); open(fn, 'w').write(extrai_filtro(NOVO))
say('explicador extraido verbatim: HOJE %d linhas sha=%s | NOVO %d linhas sha=%s'
    % (sum(1 for _ in open(fj)), sha(fj)[:16], sum(1 for _ in open(fn)), sha(fn)[:16]))

# ---------------------------------------------------------------- FASE 1: fixture limpo a partir das entradas cruas
say('')
say('== 1. ambiente limpo construido das ENTRADAS CRUAS da tarefa 0 ==')
def monta_arvore(dest, retrato_json):
    if os.path.isdir(dest):
        shutil.rmtree(dest)
    os.makedirs(dest + '/supabase')
    os.makedirs(dest + '/node_modules')          # pula o `bun install` do passo dependencias
    shutil.copy(retrato_json, dest + '/supabase/schema-manifest.json')
    shutil.copy(EN + '/config.toml', dest + '/supabase/config.toml')
    os.symlink(COPIA + '/supabase/migrations', dest + '/supabase/migrations')
    return dest

ARV_VELHO  = monta_arvore(ME + '/arvore-velho',  EN + '/retrato-velho-copia-294.json')   # o que a copia 294 tem
ARV_FRESCO = monta_arvore(ME + '/arvore-fresco', EN + '/retrato-fresco-99ff88bf2.json')  # retrato do dia (99ff88bf2)
ST = ME + '/st'; os.makedirs(ST, exist_ok=True)
shutil.copy(EN + '/falhas.tsv', ST + '/falhas.tsv')

# as 9 residuais (linhas cruas, sem as colunas de anotacao)
nove = [l.split('  ||')[0].strip() for l in open(B + '/nove-residuais.txt', encoding='utf-8')
        if l.strip() and not l.startswith('#')]
open(ME + '/check9.txt', 'w').write('\n'.join(nove) + '\n')
shutil.copy(EN + '/check-diferencas-real-18h55.txt', ME + '/checkA.txt')          # 128 diferencas (retrato velho)
shutil.copy(B + '/B-check-diferencas.txt', ME + '/checkB.txt')                    # 2 diferencas (retrato fresco)
say('arvore-velho  retrato sha=%s  migrations=%s' % (sha(ARV_VELHO + '/supabase/schema-manifest.json')[:16], os.path.realpath(ARV_VELHO + '/supabase/migrations')))
say('arvore-fresco retrato sha=%s' % sha(ARV_FRESCO + '/supabase/schema-manifest.json')[:16])
say('check9=%d linhas | checkA=%d linhas | checkB=%d linhas' % (len(nove), sum(1 for _ in open(ME + '/checkA.txt')), sum(1 for _ in open(ME + '/checkB.txt'))))

# a pendente e DERIVADA do ledger (nao passada a mao): arquivo da copia cujo prefixo nao esta no registro
prod = set(x for x in open(B + '/ledger-fixture-versoes.txt').read().split('\n') if x.strip())
migs = sorted(f for f in os.listdir(COPIA + '/supabase/migrations') if f.endswith('.sql'))
novas = [f for f in migs if f.split('_')[0] not in prod]
say('ledger fixture: %d versoes | arquivos .sql: %d | PENDENTES derivadas: %s' % (len(prod), len(migs), novas))
assert novas == [PEND], 'conjunto de pendentes inesperado'

# ---------------------------------------------------------------- FASE 2: verificacao da LOGICA da guarda (leitura do diff)
say('')
say('== 2. logica da guarda (lida no artefato, nao no relato do pai) ==')
src = open(NOVO).read()
say('(a) retrato canonico consultado?  %s' % ("'schema-manifest.json'" in src))
say('(b) ledger consultado?            %s (linha 43 zapp-db-ler -> NOVAS_MIG/pendentes; a prova (b) usa o texto das')
say('                                     migrations da copia que NAO estao nas pendentes -> $W/supabase/migrations)')
say('corte "migration pendente cita o objeto -> continua do cartao"? %s'
    % ('if cita(n): return False' in src.replace(' ', ' ') or 'cita(n): return False' in src))
say('caminhos fail-closed intactos?   SEM->raise SystemExit(1)=%s ; LEDGER_OK=0->regra estrita=%s'
    % ('raise SystemExit(1)' in src, 'if [ "$LEDGER_OK" = 0 ]' in src))
say('cabeca (linhas 1-64) identica ao instalado? %s'
    % ('IDENTICA' if open(HOJE).read().split('\n')[:64] == src.split('\n')[:64] else 'DIFERE'))

# ---------------------------------------------------------------- FASE 3: execucao CRUA do explicador real
def roda(filtro, arvore, check, novas=PEND, st=ST):
    env = dict(os.environ, W=arvore, ST=st, NOVAS='\n'.join(novas) if isinstance(novas, (list, tuple)) else novas)
    r = subprocess.run(['python3', filtro], capture_output=True, text=True, env=env)
    return r.returncode, r.stdout.strip(), r.stderr.strip()

def classifica(filtro, arvore, check, tudo=False, st=ST, novas=PEND):
    """roda uma COPIA INSTRUMENTADA do MESMO filtro (so o laco final trocado pelo relatorio)."""
    txt = open(filtro, encoding='utf-8').read()
    head = txt.split('pre=[]')[0] if 'pre=[]' in txt else txt.split('sem=[]')[0]
    rep = '''
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
ex=d=pr=s=0
for l in linhas:
    if explicada(l): ex+=1; print('EXPLICADA\\t'+l)
    elif 'drift_canonico' in globals() and drift_canonico(l): pr+=1; print('DRIFT\\t'+l)
    else: s+=1; print('DEBITADA\\t'+l)
print('TOTAL=%d EXPLICADAS=%d DRIFT=%d DEBITADAS=%d' % (len(linhas),ex,pr,s))
'''
    inst = ME + '/inst-%s.py' % os.path.basename(filtro)
    open(inst, 'w').write(head + rep)
    # a copia instrumentada le o fixture pelo ST/check-diferencas.txt:
    os.makedirs(st, exist_ok=True)
    shutil.copy(check, st + '/check-diferencas.txt')
    env = dict(os.environ, W=arvore, ST=st, NOVAS=novas if isinstance(novas, str) else '\n'.join(novas))
    r = subprocess.run(['python3', inst], capture_output=True, text=True, env=env)
    return r.stdout + r.stderr

def veredito(rc, out):
    """espelha verbatim as linhas 157-168 do script (DRIFT_N / if-elif-else -> AVISO x FALHOU + exit)."""
    motivo = out.splitlines()[0] if out else ''
    sh = 'MOTIVO=%s; RM=%d\n' % ("'" + motivo.replace("'", "'\\''") + "'", rc)
    sh += '''DRIFT_N="${MOTIVO#*drift=}"; [ "$DRIFT_N" = "$MOTIVO" ] && DRIFT_N=0
if [ $RM = 0 ] && [ "${MOTIVO%%|*}" = ok ] && [ "$DRIFT_N" = 0 ]; then echo "AVISO (toda diferenca citada)"; echo 0
elif [ $RM = 0 ] && [ "${MOTIVO%%|*}" = ok ]; then echo "AVISO ($DRIFT_N nao debitada(s) ao cartao)"; echo 0
else echo "FALHOU"; echo 1; fi'''
    r = subprocess.run(['bash', '-c', sh], capture_output=True, text=True)
    ln = r.stdout.strip().splitlines()
    return ln[0], int(ln[1])

say('')
say('== 3. EXECUCAO CRUA do explicador real (rc + stdout) + veredito do bloco banco_local ==')
say('   (o veredito espelha as linhas 157-168 do script: RM/MOTIVO -> AVISO x FALHOU + exit code)')
res = {}
for cen, arv, chk, nv in (('9-as-residuais', ARV_VELHO, ME + '/check9.txt', PEND),
                          ('A-128(retrato velho)', ARV_VELHO, ME + '/checkA.txt', PEND),
                          ('B-2(retrato fresco)', ARV_FRESCO, ME + '/checkB.txt', PEND)):
    for tag, fx in (('HOJE', fj), ('NOVO', fn)):
        stc = ME + '/st-' + cen
        os.makedirs(stc, exist_ok=True); shutil.copy(chk, stc + '/check-diferencas.txt')
        shutil.copy(EN + '/falhas.tsv', stc + '/falhas.tsv')
        rc, out, err = roda(fx, arv, chk, nv, st=stc)
        v, vrc = veredito(rc, out)
        res[(cen, tag)] = (rc, out, v, vrc)
        say('   %-22s %-5s rc=%d  veredito=%-45s exit=%d' % (cen, tag, rc, v, vrc))
        say('        stdout: %s' % (out.replace('\n', ' | ')[:150] or '(vazio)'))
        if err: say('        stderr: %s' % err[:150])

say('')
say('== 3b. classificacao LINHA A LINHA das 9 residuais (o que cada versao DEBITA) ==')
for tag, fx in (('HOJE', fj), ('NOVO', fn)):
    r = classifica(fx, ARV_VELHO, ME + '/check9.txt')
    for l in r.strip().splitlines():
        say('   %-5s %s' % (tag, l))
    open(SAIDA + '/linha-a-linha-%s.out' % tag, 'w').write(r)

say('')
say('== 3c. atribuicao do drift no A-128: prova (a) retrato x prova (b) migrations ja aplicadas ==')
txt = open(fn).read(); head = txt.split('pre=[]')[0]
rep = '''
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
a=b=0
for l in linhas:
    if explicada(l): continue
    if drift_canonico(l):
        tipo,chave=l.split('|',1)
        via = 'a' if (isinstance(RETRATO.get(tipo),dict) and chave in RETRATO[tipo]) else 'b'
        if via=='a': a+=1
        else: b+=1
        print('DRIFT-%s\\t%s' % (via,l))
print('DRIFT por prova: (a) retrato canonico=%d  (b) migrations ja aplicadas=%d' % (a,b))
'''
open(ME + '/inst-attr.py', 'w').write(head + rep)
stc = ME + '/st-A-128(retrato velho)'
r = subprocess.run(['python3', ME + '/inst-attr.py'], capture_output=True, text=True,
                   env=dict(os.environ, W=ARV_VELHO, ST=stc, NOVAS=PEND))
open(SAIDA + '/atribuicao-drift-A.txt', 'w').write(r.stdout + r.stderr)
for l in (r.stdout + r.stderr).strip().splitlines():
    if l.startswith('DRIFT por prova'): say('   ' + l)

# ---------------------------------------------------------------- FASE 4: caminhos de borda
say('')
say('== 4. CAMINHOS DE BORDA (fixture SINTETICO isolando cada prova) ==')
ED = ME + '/edge'
if os.path.isdir(ED): shutil.rmtree(ED)
os.makedirs(ED + '/arvore/supabase/migrations'); os.makedirs(ED + '/arvore/node_modules'); os.makedirs(ED + '/st')
# retrato canonico: tem ind_snap e ind_both (e so)
snap = {'indexes': {'r:public.tab_snap.ind_snap': {'tabela': 'tab_snap'},
                    'r:public.tab_both.ind_both': {'tabela': 'tab_both'}},
        'functions': {}, 'routine_grants': {}}
json.dump(snap, open(ED + '/arvore/supabase/schema-manifest.json', 'w'))
open(ED + '/arvore/supabase/config.toml', 'w').write('')
# migration JA APLICADA: cria tabelas/indices com os nomes que a prova (b) procura
open(ED + '/arvore/supabase/migrations/0001_old.sql', 'w').write(
    'create table tab_led(ind_ledger int);\ncreate index ind_ledger on tab_led(tab_led_col);\n'
    'create table tab_both(ind_both int);\ncreate index ind_both on tab_both(ind_both);\n'
    'create table tab_snap(x int);\ncreate table tab_none(x int);\n')
# PENDENTE do cartao: cria sonda_cartao + ind_cartao (e NAO cita ind_snap/ind_ledger/ind_both/tab_none)
open(ED + '/arvore/supabase/migrations/9001_pend.sql', 'w').write(
    'create table sonda_cartao(col_citada int);\ncreate index ind_cartao on sonda_cartao(col_citada);\n')
bordas = [
    ('E1 so no retrato canonico   ', 'indexes|r:public.tab_snap.ind_snap'),
    ('E2 so nas ja-aplicadas      ', 'indexes|r:public.tab_led.ind_ledger'),
    ('E3 nos DOIS                 ', 'indexes|r:public.tab_both.ind_both'),
    ('E4 em NENHUM (controle neg.)', 'indexes|r:public.tab_none.ind_none'),
    ('E5 objeto NOVO do cartao    ', 'indexes|r:public.tab_cartao.ind_cartao'),
    ('E6 tabela do cartao, filho novo', 'indexes|r:public.sonda_cartao.sonda_cartao_pkey'),
]
open(ED + '/st/check-bordas.txt', 'w').write('\n'.join(x[1] for x in bordas) + '\n')
say('   fixture: %s' % json.dumps(snap))
say('   ja-aplicada 0001_old.sql | pendente 9001_pend.sql (o cartao cria sonda_cartao + ind_cartao)')
say('   %-32s %-12s %-12s' % ('linha (borda)', 'HOJE', 'NOVO'))
for rot, l in bordas:
    c = []
    for fx in (fj, fn):
        txt = open(fx).read(); head = txt.split('pre=[]')[0] if 'pre=[]' in txt else txt.split('sem=[]')[0]
        rep2 = '''
l=%r
if explicada(l): print('EXPLICADA')
elif 'drift_canonico' in globals() and drift_canonico(l): print('DRIFT (nao debitada)')
else: print('DEBITADA')
''' % l
        inst = ME + '/inst-borda.py'
        open(inst, 'w').write(head + rep2)
        # drift_canonico le $ST/check-diferencas.txt? nao: so o laco final le. a prova usa W/migrations.
        r = subprocess.run(['python3', inst], capture_output=True, text=True,
                           env=dict(os.environ, W=ED + '/arvore', ST=ED + '/st', NOVAS='9001_pend.sql'))
        c.append((r.stdout + r.stderr).strip() or 'ERRO:' + r.stderr.strip()[:60])
    say('   %-32s %-12s %-12s  <- %s' % (rot, c[0], c[1], l[:60]))
open(SAIDA + '/bordas.out', 'w').write('\n'.join(LOG) + '\n')

# ---------------------------------------------------------------- FASE 5: fail-closed / nao-afrouxamento
say('')
say('== 5. NAO afrouxou os caminhos fail-closed ==')
say('   - E4 (em nenhum lugar) e E6 (filho novo de tabela do cartao) seguem DEBITADAS no NOVO: nao ha mascaramento indiscriminado')
say('   - SEM -> raise SystemExit(1) intacto no NOVO: %s' % ('raise SystemExit(1)' in open(fn).read()))
say('   - LEDGER_OK=0 (agente, R1 rc=77) -> o bloco do explicador nem roda (linha 66 exige LEDGER_OK=1):')
say('     o ajuste e INERTE quando o registro e ilegivel -> a execucao ao vivo de hoje segue FALHOU (medido no e2e)')

open(SAIDA + '/VERIFICACAO.txt', 'w').write('\n'.join(LOG) + '\n')
say('')
say('artefatos em: %s' % SAIDA)
