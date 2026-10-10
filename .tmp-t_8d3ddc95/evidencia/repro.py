#!/usr/bin/env python3
# t_8d3ddc95 - reproducao independente da tarefa 0 (drift pre-existente).
# Roda SO no workspace do cartao. Nao le producao, nao le banco, nao toca ~/.local/bin.
# 1) extrai o explicador embutido dos DOIS scripts (instalado HOJE x artefato NOVO)
# 2) execucao crua (rc = veredito do passo banco_local) sobre a fixture A (as 9 residuais)
# 3) classificacao linha a linha
# 4) controle negativo: objeto novo do cartao continua DEBITADO
import os, re, json, shutil, hashlib, subprocess, sys

WS = '/mnt/c/Users/Joaquim Ataides/AppData/Local/hermes/kanban/boards/zapp-web-v2/workspaces/t_c5a96aba'
R  = WS + '/.tmp/t_8d3ddc95'
B  = WS + '/.tmp/evidencias-baseline'
HOJE = '/home/joaquim_ataides/.local/bin/zapp-verify'
NOVO = R + '/artefato/zapp-verify.novo'
PEND = '20261006204953_multiplix_cascata_bloco_terminal.sql'
os.makedirs(R + '/saida', exist_ok=True)
os.makedirs(R + '/trab', exist_ok=True)


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def extrai(src, dst):
    t = open(src, encoding='utf-8', errors='ignore').read()
    m = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", t, re.S)
    if not m:
        raise SystemExit('nao achei o heredoc PY em ' + src)
    open(dst, 'w', encoding='utf-8').write(m.group(1) + '\n')
    return len(m.group(1).splitlines())


out = []
def log(s=''):
    print(s)
    out.append(s)


log('== 0. alvos ==')
log('HOJE (instalado)  sha256 = ' + sha(HOJE))
log('NOVO (artefato)   sha256 = ' + sha(NOVO))
EMB_H = R + '/trab/emb-hoje.py'
EMB_N = R + '/trab/emb-novo.py'
log('explicador extraido: hoje=%d linhas  novo=%d linhas' % (extrai(HOJE, EMB_H), extrai(NOVO, EMB_N)))
log('artefato tem drift_canonico()? ' + str('def drift_canonico' in open(EMB_N, encoding='utf-8').read()))
log('instalado tem drift_canonico()? ' + str('def drift_canonico' in open(EMB_H, encoding='utf-8').read()))

# ---------- fixture A: arvore da linha do dia (retrato velho) + a migration pendente do cartao
ARV = R + '/trab/arvore'
if os.path.exists(ARV):
    shutil.rmtree(ARV)
shutil.copytree(B + '/arvore-A', ARV, symlinks=True)
# a fixture copia 'migrations' como SYMLINK para a copia 294 real; troco por um diretorio
# proprio (symlinks para os .sql) para nao escrever em outro workspace
MIG = ARV + '/supabase/migrations'
SRC_MIG = os.path.realpath(MIG)
os.remove(MIG)
os.makedirs(MIG)
for f in os.listdir(SRC_MIG):
    if f.endswith('.sql'):
        os.symlink(os.path.join(SRC_MIG, f), os.path.join(MIG, f))
shutil.copy(B + '/entradas/migration-pendente-20261006204953.sql', MIG + '/' + PEND)
ST = R + '/trab/st'
os.makedirs(ST, exist_ok=True)
shutil.copy(B + '/entradas/falhas.tsv', ST + '/falhas.tsv')
nove = [l.strip() for l in open(B + '/nove-residuais.txt', encoding='utf-8') if l.strip() and not l.startswith('#')]
nove = [l.split('  ||')[0].strip() for l in nove]
open(ST + '/check-diferencas.txt', 'w', encoding='utf-8').write('\n'.join(nove) + '\n')
log()
log('== 1. fixture A: %d linhas (as 9 residuais) + pendente %s ==' % (len(nove), PEND))

# ---------- execucao CRUA do explicador (e o que decide o veredito do passo banco_local)
log()
log('== 2. execucao crua (rc = veredito banco_local) ==')
rcs = {}
for rot, emb in (('HOJE', EMB_H), ('NOVO', EMB_N)):
    env = dict(os.environ, W=ARV, ST=ST, NOVAS=PEND)
    r = subprocess.run(['python3', emb], capture_output=True, text=True, env=env)
    rcs[rot] = r.returncode
    p1 = r.stdout.strip().splitlines()[0] if r.stdout.strip() else '(vazio)'
    log('%s rc=%d' % (rot, r.returncode))
    log('  stdout: ' + p1[:400])
    log('  stderr: ' + (r.stderr.strip()[:200] if r.stderr.strip() else '(vazio)'))
    open(R + '/saida/rc-%s.txt' % rot, 'w').write('%d\n' % r.returncode)
    open(R + '/saida/%s.out' % rot, 'w').write(r.stdout)
    open(R + '/saida/%s.err' % rot, 'w').write(r.stderr)

# ---------- classificacao linha a linha (troca so o laco final)
TAIL_NOVO = """
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
c={'explicada':0,'drift':0,'SEM':0}
for l in linhas:
    if explicada(l): print('explicada\\t'+l); c['explicada']+=1
    elif drift_canonico(l): print('drift\\t'+l); c['drift']+=1
    else: print('SEM\\t'+l); c['SEM']+=1
print('total=%d explicadas=%d drift_canonico=%d SEM=%d' % (len(linhas), c['explicada'], c['drift'], c['SEM']))
"""
TAIL_HOJE = """
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
c={'explicada':0,'SEM':0}
for l in linhas:
    if explicada(l): print('explicada\\t'+l); c['explicada']+=1
    else: print('SEM\\t'+l); c['SEM']+=1
print('total=%d explicadas=%d SEM=%d' % (len(linhas), c['explicada'], c['SEM']))
"""


def harness(emb, out_, w, st, novas, novo):
    src = open(emb, encoding='utf-8').read()
    mark = 'pre=[]; sem=[]' if 'pre=[]; sem=[]' in src else 'sem=[]'
    head = src.split(mark)[0]
    open(out_, 'w', encoding='utf-8').write(head + (TAIL_NOVO if novo else TAIL_HOJE))
    env = dict(os.environ, W=w, ST=st, NOVAS=novas)
    r = subprocess.run(['python3', out_], capture_output=True, text=True, env=env)
    return r


log()
log('== 3. classificacao das 9 (linha a linha) ==')
res = {}
for rot, emb in (('HOJE', EMB_H), ('NOVO', EMB_N)):
    r = harness(emb, R + '/trab/cls-%s.py' % rot, ARV, ST, PEND, rot == 'NOVO')
    linhas = r.stdout.strip().splitlines()
    res[rot] = linhas
    log('-- %s -- rc=%d  %s' % (rot, r.returncode, linhas[-1] if linhas else r.stderr.strip()[:200]))
    open(R + '/saida/linha-a-linha-%s.out' % rot, 'w').write(r.stdout)
deb_h = sum(1 for l in res['HOJE'] if l.startswith('SEM'))
deb_n = sum(1 for l in res['NOVO'] if l.startswith('SEM'))
log()
log('DEBITADAS (SEM) HOJE=%d  NOVO=%d  de %d' % (deb_h, deb_n, len(nove)))

# ---------- controle negativo
NEG = R + '/trab/negativo'
if os.path.exists(NEG):
    shutil.rmtree(NEG)
os.makedirs(NEG + '/arvore/supabase/migrations', exist_ok=True)
json.dump({'functions': {'f:consume_gmail_oauth_state(p_user_id uuid, p_state text)': 'x'}},
          open(NEG + '/arvore/supabase/schema-manifest.json', 'w'))
open(NEG + '/arvore/supabase/migrations/29990101000000_cartao_pendente.sql', 'w').write(
    'ALTER TABLE public.sonda_cartao ADD COLUMN col_citada text;\n')
open(NEG + '/arvore/supabase/migrations/20250101000000_base_canonica.sql', 'w').write(
    'CREATE OR REPLACE FUNCTION public.funcao_antiga() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;\n')
NEGST = NEG + '/st'
os.makedirs(NEGST, exist_ok=True)
open(NEGST + '/check-diferencas.txt', 'w').write(
    'indexes|sonda_cartao.sonda_cartao_pkey\n'
    'columns|r:public.sonda_cartao.col_citada\n'
    'functions|f:consume_gmail_oauth_state(p_user_id uuid, p_state text)\n'
    'routine_grants|f:funcao_antiga()|authenticated|EXECUTE|grantor=postgres\n')
log()
log('== 4. controle negativo (objeto novo do cartao tem de continuar SEM) ==')
neg_novo = []
for rot, emb in (('HOJE', EMB_H), ('NOVO', EMB_N)):
    r = harness(emb, R + '/trab/clsneg-%s.py' % rot, NEG + '/arvore', NEGST,
                '29990101000000_cartao_pendente.sql', rot == 'NOVO')
    if rot == 'NOVO':
        neg_novo = r.stdout.strip().splitlines()
    log('-- negativo / %s -- rc=%d' % (rot, r.returncode))
    for l in r.stdout.strip().splitlines():
        log('   ' + l)
    open(R + '/saida/negativo-%s.out' % rot, 'w').write(r.stdout)

log()
log('== 5. veredito ==')
log('as 9 residuais debitadas: HOJE=%d -> NOVO=%d' % (deb_h, deb_n))
log('drift novo (indexes|sonda_cartao.sonda_cartao_pkey) continua SEM com o ajuste? ' +
    str(any(l.startswith('SEM\tindexes|sonda_cartao.sonda_cartao_pkey') for l in neg_novo)))
open(R + '/saida/resumo.txt', 'w').write('\n'.join(out) + '\n')
print('\nOK: repro concluida')
