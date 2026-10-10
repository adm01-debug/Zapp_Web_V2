#!/usr/bin/env python3
# t_debaf8a8 - passo 2: roda o EXPLICADOR REAL dos dois scripts (instalado x artefato novo)
# sobre os dados REAIS do conjunto vivo (47 linhas de drift novo + a migration pendente do cartao).
# Prova: o drift novo continua sendo debitado (SEM -> rc=1) com o ajuste.
import hashlib, os, re, shutil, subprocess, sys

SB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E, OUT, T = SB + '/entradas', SB + '/saida', SB + '/trab'
os.makedirs(OUT, exist_ok=True)
C = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/indeterminate-optout-outbox-migration-re-26100709037ed9'
HOJE = '/home/joaquim_ataides/.local/bin/zapp-verify'
NOVO = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/.tmp-t_8d3ddc95/ENTREGA/zapp-verify.novo'
PEND = '20261007095739_indeterminate_optout_outbox.sql'

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def extrai(src, dst):
    t = open(src, encoding='utf-8', errors='ignore').read()
    m = re.search(r"python3 - <<'PY'\n(.*?)\nPY\n", t, re.S)
    if not m:
        sys.exit('sem heredoc PY em ' + src)
    open(dst, 'w', encoding='utf-8').write(m.group(1) + '\n')
    return len(m.group(1).splitlines())

out = []
def log(s=''):
    print(s)
    out.append(s)

# estado de ensaio (so o que o explicador le): diferencas REAIS + falhas REAIS
ST = T + '/estado'; os.makedirs(ST, exist_ok=True)
shutil.copy(E + '/check-diferencas-live.txt', ST + '/check-diferencas.txt')
shutil.copy(E + '/falhas-live.tsv', ST + '/falhas.tsv')

log('== alvos ==')
log('HOJE (instalado) sha256 = ' + sha(HOJE))
log('NOVO (artefato)  sha256 = ' + sha(NOVO))
log('PENDENTE do cartao = ' + PEND)
log('W (copia do conjunto vivo) = ' + C)
log('retrato canonico da copia sha256 = ' + sha(C + '/supabase/schema-manifest.json'))
log('n linhas de diferenca (reais) = ' + str(len([l for l in open(ST + '/check-diferencas.txt', encoding='utf-8') if l.strip()])))
EMB = {}
for rot, src in (('HOJE', HOJE), ('NOVO', NOVO)):
    EMB[rot] = T + '/emb-%s.py' % rot
    log('%s: explicador extraido com %d linhas (drift_canonico=%s)' % (
        rot, extrai(src, EMB[rot]), 'def drift_canonico' in open(EMB[rot], encoding='utf-8').read()))

# ---------- execucao CRUA: e o que decide FALHOU x AVISO no passo banco_local ----------
log()
log('== execucao crua do explicador (rc = veredito do passo banco_local) ==')
for rot in ('HOJE', 'NOVO'):
    env = dict(os.environ, W=C, ST=ST, NOVAS=PEND)
    r = subprocess.run(['python3', EMB[rot]], capture_output=True, text=True, env=env)
    l1 = (r.stdout.strip().splitlines() or ['(vazio)'])[0]
    log('%s rc=%d' % (rot, r.returncode))
    log('   stdout: ' + l1[:300])
    log('   stderr: ' + (r.stderr.strip()[:200] or '(vazio)'))
    open(OUT + '/crua-%s.out' % rot, 'w').write(r.stdout)
    open(OUT + '/crua-%s.rc' % rot, 'w').write('%d\n' % r.returncode)

# ---------- classificacao linha a linha ----------
TAIL = """
linhas=[l.strip() for l in open(os.path.join(st,'check-diferencas.txt'),encoding='utf-8') if l.strip()]
c={'explicada':0,'drift':0,'SEM':0}
for l in linhas:
    if explicada(l): print('explicada\\t'+l); c['explicada']+=1
    elif %s(l): print('drift\\t'+l); c['drift']+=1
    else: print('SEM\\t'+l); c['SEM']+=1
print('total=%%d explicadas=%%d drift_canonico=%%d SEM=%%d' %% (len(linhas), c['explicada'], c['drift'], c['SEM']))
"""
def harness(rot, src, novo):
    t = open(src, encoding='utf-8').read()
    mark = 'pre=[]; sem=[]' if 'pre=[]; sem=[]' in t else 'sem=[]'
    head = t.split(mark)[0]
    dst = T + '/cls-%s.py' % rot
    open(dst, 'w', encoding='utf-8').write(head + (TAIL % ('drift_canonico' if novo else '(lambda l: False)')))
    env = dict(os.environ, W=C, ST=ST, NOVAS=PEND)
    return subprocess.run(['python3', dst], capture_output=True, text=True, env=env)

log()
log('== classificacao das 47 linhas reais ==')
cls = {}
for rot, novo in (('HOJE', False), ('NOVO', True)):
    r = harness(rot, EMB[rot], novo)
    linhas = r.stdout.strip().splitlines()
    cls[rot] = linhas
    log('-- %s -- %s' % (rot, linhas[-1] if linhas else r.stderr.strip()[:200]))
    open(OUT + '/linha-a-linha-%s.out' % rot, 'w').write(r.stdout)
deb = {k: sum(1 for l in v if l.startswith('SEM')) for k, v in cls.items()}
log()
log('DEBITADAS AO CARTAO (SEM): HOJE=%d  NOVO=%d  de %d' % (deb['HOJE'], deb['NOVO'], len(cls['NOVO']) - 1))
log('o drift novo continua debitado com o ajuste? %s' % (deb['NOVO'] > 0))
open(OUT + '/resumo-passo2.txt', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('OK passo 2')
